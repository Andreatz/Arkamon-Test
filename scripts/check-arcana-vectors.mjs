import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const art = ['hp-ally', 'hp-rival', 'move-card', 'chronicle', 'command', 'supreme', 'title-panel', 'battle-glyph']
const battle = readFileSync(resolve('src/scenes/battleArcana.css'), 'utf8')
const title = readFileSync(resolve('src/scenes/titleArcana.css'), 'utf8')
let total = 0
for (const name of art) {
  const file = resolve('public/ui/arcana/' + name + '.svg')
  const xml = readFileSync(file, 'utf8')
  if (!xml.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') || !xml.includes('viewBox=') || !xml.includes('</svg>')) {
    throw new Error('Malformed Arcana SVG root: ' + name)
  }
  if (/\<\s*(script|foreignObject|image|text)\b|\bon\w+\s*=|\bhref\s*=|javascript:|data:image/i.test(xml)) {
    throw new Error('Arcana SVG must be vector-only, without scripts, external sources or embedded text: ' + name)
  }
  if ((xml.match(/<path\b/g) || []).length < 3) throw new Error('Vector is too flat: ' + name)
  if (!xml.includes('<defs>') || !/(?:linearGradient|radialGradient)/.test(xml) || !xml.includes('stroke=')) {
    throw new Error('Illustrated material/engraving missing: ' + name)
  }
  if (!battle.includes('/ui/arcana/' + name + '.svg') && !title.includes('/ui/arcana/' + name + '.svg')) {
    throw new Error('Unreferenced illustrated SVG: ' + name)
  }
  total += statSync(file).size
}
if (total > 90000) throw new Error('SVG pack is unexpectedly large: ' + total)
for (const [scene, expected] of [
  ['src/scenes/BattagliaScene.tsx', "import './battleArcana.css'"],
  ['src/scenes/TitoloScene.tsx', "import './titleArcana.css'"],
]) {
  if (!readFileSync(resolve(scene), 'utf8').includes(expected)) throw new Error('Skin not loaded: ' + scene)
}
console.log('Arcana assets verified:', art.length, 'original engraved SVGs;', (total / 1024).toFixed(1) + ' KiB')
