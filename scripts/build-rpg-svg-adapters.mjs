import fs from 'node:fs'
import path from 'node:path'

// CSS border-image uses SVG intrinsic dimensions for numeric slicing. User
// originals retain percentage dimensions; runtime adapters only fix that metadata.
const sources = { 'window.svg': 'Scuro/box-1.svg', 'command.svg': 'Scuro/bottone.svg', 'selected.svg': 'Blu/bottone-selezionato.svg' }
const output = path.resolve('public/ui/studio/runtime')
fs.mkdirSync(output, { recursive: true })
for (const [name, input] of Object.entries(sources)) {
  const source = fs.readFileSync(path.resolve('public/ui/studio', input), 'utf8')
  const viewBox = source.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
  const svg = source.replace(/<svg\b[^>]*>/, root => root.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '').replace('>', ` width="${viewBox[2]}" height="${viewBox[3]}">`))
  fs.writeFileSync(path.join(output, name), svg)
}

// Vite bundles raw imports from src. Keep the public originals untouched and
// regenerate these exact copies with the runtime adapters after an asset edit.
const templates = path.resolve('src/ui-studio/templates')
fs.mkdirSync(templates, { recursive: true })
for (const name of ['hp-bar.svg', 'hp-bar-enemy.svg']) {
  fs.copyFileSync(path.resolve('public/ui/studio/Comuni', name), path.join(templates, name))
}
