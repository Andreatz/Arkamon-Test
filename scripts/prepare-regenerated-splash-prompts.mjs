import fs from 'node:fs/promises'
import path from 'node:path'

const review = JSON.parse(await fs.readFile('art-source/splash/source-scale-review-2026-10-26.json', 'utf8'))
const plan = JSON.parse(await fs.readFile('art-source/splash/production-plan.json', 'utf8'))
for (const id of review.pendingIds) {
  const record = JSON.parse(await fs.readFile(`art-source/splash/status/${String(id).padStart(3, '0')}.json`, 'utf8'))
  const entry = plan.entries.find(entry => entry.id === id)
  const stem = path.basename(record.outputFile, '.webp'), file = `art-source/splash/prompts/${stem}-hero-source-v2.txt`
  try { await fs.access(file); continue } catch {}
  const prompt = `Use case: stylized-concept. Asset: official Arkamon ${record.name}, exact catalog form${id}, premium clean 16:9 landscape splash painting.
Inputs: IMAGE1 is the immutable official character anatomy and colors for this exact form. IMAGE2 is the current splash to REPLACE because its character is too small; retain its environmental identity and atmosphere. IMAGE3 is Oniros, the approved LARGE CENTRAL FIGURE scale and detailed painterly finish only; do not copy Oniros's anatomy into this different creature.
Repaint a new detailed close foreground portrait of the exact IMAGE1 creature, with its FACE AND MAIN BODY DOMINATING the composition like IMAGE3. The creature should occupy roughly75–90% of image height, or an equivalent broad foreground presence for horizontal anatomy. Center the face near x48–52%, y32–42%, and the chest/body beneath it around the canvas center. The head and chest must be large and immediately readable; keep the full forehead, eyes and muzzle away from the frame edges. A small distant animal in an establishing landscape is unacceptable. Camera is physically close to the creature, with perspective and rich foreground detail. This is a freshly painted scene, not a crop, upscale or sprite pasted onto scenery.
Scene direction: ${entry.sceneTheme}. Environmental colors: ${entry.environmentPalette.join(', ')}. ${entry.lighting}. Preserve the current painting's setting as a supporting distant background with cinematic depth, not the visual protagonist. Original architecture, atmospheric layers and light may extend across the landscape.
Character fidelity: reproduce the exact silhouette, face, eye count, markings, colors, limbs, horns, ears, fins, tails and appendage structure from IMAGE1. Do not substitute another form with the same name, infer anatomy from the name, add clothes/armor/weapons or redesign. Match official proportions while painting nuanced material, fur/scales/shell and eye detail.
Style: match IMAGE3's polished fantasy game splash finish: expressive detailed eyes, sculpted materials, premium painterly rendering, luminous rim light, coherent realistic depth and restrained intrinsic effects. One single character. The central head and body are the priority; wings, tail, long horns and other peripheral appendages may extend toward or naturally beyond the edges. Do not shrink the creature to fit every extremity. Keep central face and torso visually clear, suitable behind a live Squadra/Arkadex UI.
Output: one edge-to-edge cinematic 16:9 painting with no text, logos, letters, numbers, labels, interface, panels, borders, watermark, grid, reference thumbnails or other characters. Do not reproduce solid white/red sprite backdrop. Large central foreground creature, environment behind it.
`
  await fs.writeFile(file, prompt)
}
console.log(`Prepared source-regeneration prompts for the ${review.pendingIds.length} pending forms; existing prompts retained.`)
