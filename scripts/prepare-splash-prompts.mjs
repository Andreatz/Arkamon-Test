import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
const plan=JSON.parse(await fs.readFile('art-source/splash/production-plan.json','utf8'))
await fs.mkdir('art-source/splash/prompts',{recursive:true})
await fs.mkdir('output/splash-art/references',{recursive:true})
for(const entry of plan.entries){
 const stem=path.basename(entry.outputFile,'.webp'), target=`art-source/splash/prompts/${stem}.txt`
 try{await fs.access(target);continue}catch{}
 const prompt=`Use case: stylized-concept. Asset: ORIGINAL Arkamon premium champion splash illustration, clean landscape16:9, target1920x1080.
REFERENCE1 is the ONE immutable character design: official form ID${entry.paddedId}, ${entry.name}, form${entry.formIndex} of${entry.formsWithSameName}. Carefully reproduce the EXACT creature shown in this image: bodyshape, silhouette, face, originalcolors, markings, eye details, ears, horns, wings, limbs, appendagecounts and tail. Never substitute a generic animal, another evolution or redesign. Do not infer maturity or anatomy from the name. Preserve its stylized appeal. No invented clothes, weapons, armor, extra limbs or decorative anatomy.
REFERENCE2 (the user-provided4.png painting) is ONLY the series STYLE and LARGE HERO COMPOSITION standard. Match its cinematic painterly rendering, sculpted materials, dynamic lighting, expressive polished eyes, atmospheric depth and premium game splash finish. Do NOT copy its white dragon or its setting into this different form.
SCENE: ${entry.sceneTheme} Palette for environment and lighting: ${entry.environmentPalette.join(', ')}. ${entry.lighting} One coherent foreground/midground/background; naturally lit subject with contactshadows and depth. This is a painting of an actual scene, not an isolatedsprite pasted onto scenery.
COMPOSITION IS CRITICAL: a large main figure like reference2, around40-48% of total width. Keep the full FACE and MAIN TORSO readable in central x33%-62%,y28%-78%; the expression and body mass are the priority. Wings, tail, horns and peripheral limbs may extend sideways and be partly covered by live UI. Do not shrink the creature just to keep every extremity inside the central opening. Render real scenery across the entire landscape, no blank panels. A distinct scene arrangement and gesture for every form while preserving the exact official anatomy.
Medium: hand-painted polished gamekeyart, luminous materialresponse, elegant restrained effects appropriate to the existing character, coherent perspective and lighting. One single character. Clean edge-to-edge standalone painting, no text/letters/numbers, logos, cards, HUD, panels, buttons, healthbars, frames, borders, watermark, guides or UI. No extra animals or humans. No runiccircle framing the subject. Output exact16:9.
`
 await fs.writeFile(target,prompt)
}
for(let start=1;start<=110;start+=8){
 const ids=Array.from({length:Math.min(8,111-start)},(_,i)=>start+i)
 const tiles=await Promise.all(ids.map(async id=>{const thumb=await sharp(`public/sprites/front_sprites/${id}.png`).flatten({background:'#ddd'}).resize(280,280,{fit:'contain'}).png().toBuffer(); const label=Buffer.from(`<svg width="300" height="32"><rect width="300" height="32" fill="#14243a"/><text x="12" y="23" fill="white" font-size="18">${String(id).padStart(3,'0')} ${plan.entries[id-1].name}</text></svg>`);return {thumb,label}}))
 const composite=[];tiles.forEach((tile,index)=>{const left=index%4*300,top=Math.floor(index/4)*320;composite.push({input:tile.thumb,left:left+10,top},{input:tile.label,left,top:top+282})})
 await sharp({create:{width:1200,height:Math.ceil(ids.length/4)*320,channels:3,background:'#22334a'}}).composite(composite).png().toFile(`output/splash-art/references/${start}-${ids.at(-1)}.png`)
}
console.log('Prepared distinct prompts for110 forms and14 reference contact sheets.')
