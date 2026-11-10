import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Reviewed local mitigation for GHSA-vfj7-8cjw-p6xm, not a claimed upstream fix.
// Version plus original source hashes must match before touching any dependency.
export const BRACES_VERSION = '3.0.3'
export const ORIGINAL_HASHES = {
  'parse.js': 'e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310',
  'compile.js': 'dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f',
  'stringify.js': '379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a',
  'expand.js': '41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7',
  'utils.js': 'b5a7596aa67730412b3c029ef09e84e6b67b8e445cffd35d1d295549c89066c7',
}
const hash = value => createHash('sha256').update(value).digest('hex')
const importLine = "const codexBracesGuard = require('./codex-braces-guard');\n"
const guardCalls = {
  'parse.js': ["const parse = (input, options = {}) => {", '  codexBracesGuard.assertPattern(input);'],
  'compile.js': ["const compile = (ast, options = {}) => {", '  codexBracesGuard.assertAst(ast);'],
  'stringify.js': ["module.exports = (ast, options = {}) => {", '  codexBracesGuard.assertAst(ast);'],
  'expand.js': ["const expand = (ast, options = {}) => {", '  codexBracesGuard.assertAst(ast);'],
  'utils.js': ["exports.flatten = (...args) => {", '  codexBracesGuard.assertArrays(args);'],
}

// Kept as a normal function so the emitted CommonJS guard is self-contained.
function guardFactory(exports) {
  'use strict'
  const MAX_DEPTH = 64, MAX_AST_DEPTH = 128, MAX_NODES = 20000, MAX_LENGTH = 10000
  const reject = reason => {
    const error = new RangeError('braces input rejected by local security guard: ' + reason)
    error.code = 'BRACES_COMPLEXITY_LIMIT'
    throw error
  }
  exports.assertPattern = input => {
    if (typeof input !== 'string') return // Preserve the parser's own type error.
    if (input.length > MAX_LENGTH) reject('length')
    const stack = []
    for (let i = 0; i < input.length; i++) {
      const character = input[i]
      if (character === '\\') { i++; continue }
      if (character === '[') {
        let brackets = 1
        while (++i < input.length) {
          if (input[i] === '\\') { i++; continue }
          if (input[i] === '[') brackets++
          else if (input[i] === ']' && --brackets === 0) break
        }
        continue
      }
      if (character === '"' || character === "'" || character === '\x60') {
        while (++i < input.length) {
          if (input[i] === '\\') { i++; continue }
          if (input[i] === character) break
        }
        continue
      }
      if (character === '{' || character === '(') {
        if (stack.length >= MAX_DEPTH) reject('nesting')
        stack.push(character)
      } else if ((character === '}' && stack[stack.length - 1] === '{') ||
                 (character === ')' && stack[stack.length - 1] === '(')) stack.pop()
    }
  }
  exports.assertAst = root => {
    const pending = [{ node: root, depth: 0 }], visited = new WeakSet()
    let count = 0
    while (pending.length) {
      const { node, depth } = pending.pop()
      if (!node || typeof node !== 'object' || Array.isArray(node)) reject('invalid AST node')
      if (depth > MAX_AST_DEPTH || ++count > MAX_NODES) reject('AST budget')
      if (visited.has(node)) reject('cyclic or repeated AST node')
      visited.add(node)
      // expand follows parent links in loops even though they are not AST children.
      const parents = new WeakSet()
      let parent = node.parent, parentDepth = 0
      while (parent) {
        if (typeof parent !== 'object' || parents.has(parent) || ++parentDepth > MAX_AST_DEPTH) reject('parent chain')
        parents.add(parent); parent = parent.parent
      }
      if (node.nodes !== undefined) {
        if (!Array.isArray(node.nodes) || node.nodes.length > MAX_NODES || pending.length + node.nodes.length + count > MAX_NODES) reject('AST children')
        for (let i = node.nodes.length - 1; i >= 0; i--) pending.push({ node: node.nodes[i], depth: depth + 1 })
      }
    }
  }
  exports.assertArrays = root => {
    const pending = [{ array: root, depth: 0 }], visited = new WeakSet()
    let count = 0
    while (pending.length) {
      const { array, depth } = pending.pop()
      if (depth > MAX_AST_DEPTH || visited.has(array) || array.length + count > MAX_NODES) reject('array budget')
      visited.add(array); count += array.length
      for (let i = 0; i < array.length; i++) if (Array.isArray(array[i])) pending.push({ array: array[i], depth: depth + 1 })
    }
  }
  exports.limits = Object.freeze({ patternDepth: MAX_DEPTH, astDepth: MAX_AST_DEPTH, nodes: MAX_NODES, length: MAX_LENGTH })
}
export const GUARD_SOURCE = "'use strict';\n// Local GHSA-vfj7-8cjw-p6xm preflight mitigation.\n(" + guardFactory.toString() + ')(exports);\n'

/** Validate every installed copy before applying deterministic, idempotent patches. */
export async function hardenBuildDependencies(root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'))
  const installations = Object.keys(lock.packages ?? {}).filter(name => /(?:^|\/)node_modules\/braces$/.test(name))
  if (!installations.length) throw new Error('Security guard: expected a locked braces installation')
  const changes = []
  let installedCopies = 0
  for (const installation of installations) {
    const directory = path.resolve(root, installation)
    if (!directory.startsWith(path.resolve(root, 'node_modules') + path.sep)) throw new Error('Security guard: invalid dependency path')
    const exists = await fs.access(directory).then(() => true).catch(error => { if (error.code === 'ENOENT') return false; throw error })
    // A production-only install legitimately omits this development dependency.
    // Missing metadata inside an existing directory still fails closed below.
    if (!exists && lock.packages[installation].dev === true) continue
    const realDirectory = await fs.realpath(directory)
    const realModules = await fs.realpath(path.resolve(root, 'node_modules'))
    if (!realDirectory.startsWith(realModules + path.sep)) throw new Error('Security guard: dependency resolves outside node_modules')
    installedCopies++
    const metadata = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
    if (metadata.name !== 'braces' || metadata.version !== BRACES_VERSION || lock.packages[installation].version !== BRACES_VERSION) {
      throw new Error('Security guard: unsupported braces version at ' + installation + '; review the upstream fix before changing the guard')
    }
    for (const [filename, expectedHash] of Object.entries(ORIGINAL_HASHES)) {
      const file = path.join(directory, 'lib', filename), source = (await fs.readFile(file, 'utf8')).replace(/\r\n/g, '\n')
      const [entry, call] = guardCalls[filename]
      let original = source
      if (source.includes(importLine)) original = source.replace(importLine, '').replace(entry + '\n' + call, entry)
      if (hash(original) !== expectedHash) throw new Error('Security guard: unrecognized braces source ' + installation + '/lib/' + filename)
      const patched = original.replace("'use strict';\n", "'use strict';\n" + importLine).replace(entry, entry + '\n' + call)
      if (source !== original && source !== patched) throw new Error('Security guard: unrecognized partial patch ' + filename)
      if (source !== patched) changes.push({ file, source: patched })
    }
    const guardFile = path.join(directory, 'lib', 'codex-braces-guard.js')
    const installedGuard = await fs.readFile(guardFile, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (installedGuard !== null && installedGuard.replace(/\r\n/g, '\n') !== GUARD_SOURCE.replace(/\r\n/g, '\n')) throw new Error('Security guard: unexpected guard source')
    if (installedGuard === null) changes.push({ file: guardFile, source: GUARD_SOURCE })
  }
  for (const { file, source } of changes) await fs.writeFile(file, source, 'utf8')
  return { installations: installedCopies, changedFiles: changes.length, version: BRACES_VERSION, guardSha256: hash(GUARD_SOURCE.replace(/\r\n/g, '\n')) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('Build dependency guard:', JSON.stringify(await hardenBuildDependencies())) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
