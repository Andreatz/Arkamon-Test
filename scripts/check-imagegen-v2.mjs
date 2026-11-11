import { readFileSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const folder = resolve('public/ui/imagegen/v2')
const names = [
  'hp-ally','hp-enemy','dialogue','command-active','command-idle',
  'move-ember','move-arcane','supreme',
  'command-active-hover','command-active-pressed',
  'command-idle-hover','command-idle-pressed',
  'move-ember-hover','move-ember-pressed',
  'move-arcane-hover','move-arcane-pressed',
  'supreme-pulse',
]
const css = readFileSync(resolve('src/scenes/battleImageGenV2.css'),'utf8')
if (/linear-gradient\s*\(|radial-gradient\s*\(|<svg\b|data:image\/svg\+xml/i.test(css))
  throw new Error('ImageGen UI must use painted raster assets, not CSS- or SVG-drawn UI art.')
let total = 0
for (const name of names) {
  const file = resolve(folder, name + '.webp')
  if (!existsSync(file)) throw new Error('Missing ImageGen raster asset: '+file)
  const bytes = readFileSync(file)
  if (bytes.length < 5000 || bytes.toString('ascii',0,4)!=='RIFF' || bytes.toString('ascii',8,12)!=='WEBP')
    throw new Error('Invalid/truncated WebP: '+file)
  if (!css.includes('/ui/imagegen/v2/'+name+'.webp'))
    throw new Error('Raster asset not referenced in UI: '+name)
  if (name==='supreme-pulse' && !bytes.includes(Buffer.from('ANIM')))
    throw new Error('Supreme button must contain a prerendered WebP animation.')
  total+=bytes.length
}
for (const scene of ['src/scenes/BattagliaScene.tsx','src/scenes/TitoloScene.tsx']) {
  if (!readFileSync(resolve(scene),'utf8').includes("import './battleImageGenV2.css'"))
    throw new Error('Raster skin not imported by '+scene)
}
if (total > 4*1024*1024) throw new Error('Raster runtime exceeds 4 MiB asset budget: '+total)
console.log('ImageGen raster UI OK:',names.length,'valid WebP files;', (total/1048576).toFixed(2),'MiB')
