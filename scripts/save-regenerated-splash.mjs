import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

// One record per form: workers can publish distinct paintings without racing the catalog.
const args = process.argv.slice(2)
const argument = flag => args[args.indexOf(flag) + 1]
const root = process.cwd(), id = Number(argument('--id')), fullscreen = args.includes('--fullscreen')
if (!args.includes('--id') || !args.includes('--input') || !args.includes('--prompt')
  || !args.includes('--focus') || !args.includes('--subject') || !Number.isInteger(id) || id < 1 || id > 110) {
  throw new Error('Use --id N --input generated.png --prompt prompt.txt --focus JSON --subject JSON')
}
const bounds = (flag) => {
  const value = JSON.parse(argument(flag))
  const numbers = ['left', 'top', 'right', 'bottom'].map(key => value[key])
  if (!numbers.every(number => Number.isFinite(number) && number >= 0 && number <= 1)
    || value.left >= value.right || value.top >= value.bottom) throw new Error(`Invalid ${flag}`)
  return value
}
const subjectBounds = bounds('--subject'), focusBounds = bounds('--focus')
if (focusBounds.left < subjectBounds.left || focusBounds.top < subjectBounds.top
  || focusBounds.right > subjectBounds.right || focusBounds.bottom > subjectBounds.bottom) throw new Error('Full face/torso must be inside the subject envelope')
const scale = Math.floor(Math.min(1, .339 / (focusBounds.right - focusBounds.left), .569 / (focusBounds.bottom - focusBounds.top)) * 1e6) / 1e6
if (!fullscreen && scale < .5) throw new Error('Protected region is too broad; review the source composition before publication')
const offset = {
  x: .48 - (.5 + ((focusBounds.left + focusBounds.right) / 2 - .5) * scale),
  y: .515 - (.5 + ((focusBounds.top + focusBounds.bottom) / 2 - .5) * scale),
}
const padded = String(id).padStart(3, '0'), statusPath = path.join(root, 'art-source/splash/status', padded + '.json')
const previous = JSON.parse(await fs.readFile(statusPath, 'utf8'))
if (!previous.outputFile && !fullscreen) throw new Error('Only an existing painting can be replaced in this revision')
const entry = previous.outputFile ? previous : JSON.parse(await fs.readFile(path.join(root, 'art-source/splash/production-plan.json'), 'utf8')).entries.find(entry => entry.id === id)
if (!entry?.outputFile) throw new Error('Missing catalog form')
const version = fullscreen ? 'fullscreen-source-v3' : 'hero-source-v2', stem = path.basename(entry.outputFile, '.webp')
const input = path.resolve(argument('--input')), sourceMetadata = await sharp(input).metadata()
if (!sourceMetadata.width || !sourceMetadata.height || Math.abs(sourceMetadata.width / sourceMetadata.height - 16 / 9) > .03) throw new Error('Generated painting must be landscape16:9')
const history = path.join(root, 'art-source/splash/history', `${padded}-before-${version}.json`)
await fs.mkdir(path.dirname(history), { recursive: true })
try { await fs.writeFile(history, JSON.stringify(previous, null, 2) + '\n', { flag: 'wx' }) }
catch (error) { if (error.code !== 'EEXIST') throw error }
const archive = path.join(root, fullscreen ? 'output/splash-fullscreen-2026-10-26/previous' : 'output/splash-regeneration-2026-10-26/previous', path.basename(entry.outputFile))
await fs.mkdir(path.dirname(archive), { recursive: true })
try { if (previous.outputFile) await fs.copyFile(path.join(root, previous.outputFile), archive, 1) }
catch (error) { if (error.code !== 'EEXIST') throw error }
const master = path.join(root, 'output/splash-art/originals', `${stem}-${version}.png`)
await fs.mkdir(path.dirname(master), { recursive: true })
await fs.copyFile(input, master)
const promptFile = `art-source/splash/prompts/${stem}-${version}.txt`
const prompt = (await fs.readFile(path.resolve(argument('--prompt')), 'utf8')).trimEnd() + '\n'
if (path.resolve(argument('--prompt')) !== path.join(root, promptFile)) await fs.writeFile(path.join(root, promptFile), prompt)
await fs.mkdir(path.dirname(path.join(root, entry.outputFile)), { recursive: true })
await sharp(master).resize(1920, 1080, { fit: 'cover', position: 'centre' }).webp({ quality: 94, alphaQuality: 100, effort: 4 }).toFile(path.join(root, entry.outputFile))
const bytes = await fs.readFile(path.join(root, entry.outputFile))
const record = {
  id, name: entry.name, type: entry.type, version, sourceToolPath: input,
  sourceMaster: path.relative(root, master).replaceAll('\\', '/'),
  sourceDimensions: { width: sourceMetadata.width, height: sourceMetadata.height },
  outputFile: entry.outputFile, runtimePath: entry.runtimePath, promptFile,
  width: 1920, height: 1080, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  status: 'approved-visual', generatedAt: new Date().toISOString(), reviewedAt: new Date().toISOString(),
  compositionPolicy: fullscreen ? 'full-canvas-focus' : 'hero-focus', subjectBounds, focusBounds, ...(!fullscreen ? { displayScale: scale, displayOffset: offset } : {}),
  sourceComposition: fullscreen ? 'full-canvas-central-hero' : 'large-central-foreground',
  regeneration: { date: '2026-10-26', reason: fullscreen ? 'Author a complete sharp 16:9 painting with a central readable face and core torso, without shrinking the canvas over a blurred duplicate.' : 'The source character was too small relative to the environment.', references: fullscreen ? [36, 97] : [109, 110, 30], previousStatusFile: path.relative(root, history).replaceAll('\\', '/') },
  reviewNotes: fullscreen ? 'Built-in image generation; official form anatomy and colors visually reviewed. One coherent full-canvas painting. Reviewed bounds protect the face and core torso; crests, extremities and tail may extend under UI. No display-scale or display-offset compensation. UI validation is recorded separately.' : 'Regenerated painting with a large central character following Oniros/Voider/Eclyps. Official form anatomy and colors visually reviewed. Face bounds include forehead and muzzle; peripheral anatomy may extend under UI. Runtime remains responsible for the measured interface opening. No CSS enlargement above source size is required. UI validation is recorded separately.',
}
await fs.writeFile(statusPath, JSON.stringify(record, null, 2) + '\n')
console.log(JSON.stringify({ id, version, bytes: bytes.length, displayScale: fullscreen ? 1 : scale, outputFile: record.outputFile }))
