const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { spawnSync } = require('node:child_process')
const { before, test } = require('node:test')

const root = path.resolve(__dirname, '..')
let braces, hardenBuildDependencies, guardSource
const controlledRejection = error => error instanceof RangeError && error.code === 'BRACES_COMPLEXITY_LIMIT'

before(async () => {
  const module = await import(pathToFileURL(path.join(root, 'scripts/harden-build-dependencies.mjs')).href)
  hardenBuildDependencies = module.hardenBuildDependencies
  guardSource = module.GUARD_SOURCE
  await hardenBuildDependencies(root)
  braces = require('braces')
})

test('every public pattern entry rejects 10000-level inputs before recursion', () => {
  const patterns = [
    '{'.repeat(10000),
    '('.repeat(10000),
    '{('.repeat(2500) + ')}'.repeat(2500),
    '{'.repeat(4999) + 'x' + '}'.repeat(4999),
  ]
  for (const pattern of patterns) {
    for (const entry of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => entry(pattern, { maxLength: Infinity }), controlledRejection)
    }
  }
})

test('direct recursive AST entries reject crafted deep, cyclic, and wide trees', () => {
  const ast = { type: 'root', nodes: [] }
  let previous = ast
  for (let depth = 0; depth < 10000; depth++) {
    const child = { type: 'paren', nodes: [], parent: previous }
    previous.nodes.push(child)
    previous = child
  }
  previous.nodes.push({ type: 'text', value: 'x', parent: previous })
  const childCycle = { type: 'root', nodes: [] }
  childCycle.nodes.push(childCycle)
  const parentCycle = { type: 'root', nodes: [] }
  parentCycle.parent = parentCycle
  const wide = { type: 'root', nodes: Array.from({ length: 20001 }, () => ({ type: 'text', value: 'x' })) }
  for (const entry of ['compile', 'expand', 'stringify']) {
    const action = require(path.join(root, 'node_modules/braces/lib', entry))
    for (const input of [ast, childCycle, parentCycle, wide]) {
      assert.throws(() => action(input), controlledRejection)
    }
  }
})

test('recursive flatten rejects deep or cyclic arrays and preserves ordinary values', () => {
  const { flatten } = require(path.join(root, 'node_modules/braces/lib/utils'))
  let nested = ['x']
  for (let depth = 0; depth < 10000; depth++) nested = [nested]
  const cycle = []
  cycle.push(cycle)
  assert.throws(() => flatten(nested), controlledRejection)
  assert.throws(() => flatten(cycle), controlledRejection)
  assert.deepEqual(flatten('a', ['b', ['c']], undefined), ['a', 'b', 'c'])
})

test('normal Tailwind paths, alternatives, and bounded ranges retain their output', () => {
  assert.equal(braces.compile('./src/**/*.{js,ts,jsx,tsx}'), './src/**/*.(js|ts|jsx|tsx)')
  assert.deepEqual(braces.expand('src/{components,scenes}/**/*.{ts,tsx}'), [
    'src/components/**/*.ts', 'src/components/**/*.tsx',
    'src/scenes/**/*.ts', 'src/scenes/**/*.tsx',
  ])
  assert.deepEqual(braces.expand('file-{1..3}.txt'), ['file-1.txt', 'file-2.txt', 'file-3.txt'])
  const patterns = [
    '{a,{b,c}}', 'file-\\{literal\\}.txt', '"{quoted}"',
    '[{}]/{a,b}', '(foo|bar)/{one,two}', '$' + '{variable}',
  ]
  for (const pattern of patterns) {
    for (const entry of [braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.doesNotThrow(() => entry(pattern))
    }
  }
})

test('quoted, bracketed, and escaped brace literals do not consume nesting budget', () => {
  for (const pattern of [
    '"' + '{'.repeat(1000) + '"',
    '[' + '{'.repeat(1000) + ']',
    '\\{'.repeat(1000),
  ]) {
    assert.doesNotThrow(() => braces.compile(pattern))
  }
})

test('boundary depths are controlled and length options cannot disable the guard', () => {
  assert.doesNotThrow(() => braces.compile('{'.repeat(64) + 'a,b' + '}'.repeat(64)))
  assert.throws(() => braces.compile('{'.repeat(65)), controlledRejection)
  assert.throws(() => braces.parse('x'.repeat(10001), { maxLength: Infinity }), controlledRejection)
  assert.throws(() => braces.parse(42), TypeError)
})

test('a caught malicious glob leaves the process usable for the next normal glob', () => {
  const source = [
    "const assert = require('node:assert/strict');",
    "const braces = require('braces');",
    "assert.throws(() => braces.compile('('.repeat(10000)), e => e.code === 'BRACES_COMPLEXITY_LIMIT');",
    "assert.equal(braces.compile('src/*.{js,ts}'), 'src/*.(js|ts)');",
    "process.stdout.write('healthy');",
  ].join('\n')
  const child = spawnSync(process.execPath, ['-e', source], { cwd: root, encoding: 'utf8', timeout: 10000 })
  assert.equal(child.status, 0, child.stderr)
  assert.equal(child.stdout, 'healthy')
})

test('fresh install patch is idempotent and unknown source or versions fail closed', async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'braces-security-fixture-'))
  assert.ok(path.resolve(fixture).startsWith(path.resolve(os.tmpdir()) + path.sep))
  const dependency = path.join(fixture, 'node_modules/braces')
  try {
    await fs.cp(path.join(root, 'node_modules/braces'), dependency, { recursive: true })
    await fs.writeFile(path.join(fixture, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3, packages: { 'node_modules/braces': { version: '3.0.3' } },
    }))
    for (const filename of ['parse.js', 'compile.js', 'stringify.js', 'expand.js', 'utils.js']) {
      const file = path.join(dependency, 'lib', filename)
      const source = (await fs.readFile(file, 'utf8'))
        .replace("const codexBracesGuard = require('./codex-braces-guard');\n", '')
        .replace(/  codexBracesGuard\.assert(?:Pattern|Ast|Arrays)\([a-z]+\);\n/, '')
      await fs.writeFile(file, source)
    }
    await fs.unlink(path.join(dependency, 'lib/codex-braces-guard.js'))
    assert.equal((await hardenBuildDependencies(fixture)).changedFiles, 6)
    assert.equal((await hardenBuildDependencies(fixture)).changedFiles, 0)
    assert.equal((await fs.readFile(path.join(dependency, 'lib/codex-braces-guard.js'), 'utf8')), guardSource)
    const compileFile = path.join(dependency, 'lib/compile.js')
    const compileBefore = await fs.readFile(compileFile, 'utf8')
    await fs.appendFile(path.join(dependency, 'lib/parse.js'), '\n// unexpected source\n')
    await assert.rejects(hardenBuildDependencies(fixture), /unrecognized braces source/)
    assert.equal(await fs.readFile(compileFile, 'utf8'), compileBefore)
    const metadataFile = path.join(dependency, 'package.json')
    const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'))
    metadata.version = '3.0.4'
    await fs.writeFile(metadataFile, JSON.stringify(metadata))
    await assert.rejects(hardenBuildDependencies(fixture), /unsupported braces version/)
  } finally {
    await fs.rm(fixture, { recursive: true, force: true })
  }
})

test('a production-only install may omit locked dev copies, never an expected runtime copy', async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'braces-security-fixture-'))
  assert.ok(path.resolve(fixture).startsWith(path.resolve(os.tmpdir()) + path.sep))
  try {
    const lockFile = path.join(fixture, 'package-lock.json')
    await fs.writeFile(lockFile, JSON.stringify({
      packages: { 'node_modules/braces': { version: '3.0.3', dev: true } },
    }))
    assert.equal((await hardenBuildDependencies(fixture)).installations, 0)
    await fs.writeFile(lockFile, JSON.stringify({
      packages: { 'node_modules/braces': { version: '3.0.3' } },
    }))
    await assert.rejects(hardenBuildDependencies(fixture), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture, { recursive: true, force: true })
  }
})
