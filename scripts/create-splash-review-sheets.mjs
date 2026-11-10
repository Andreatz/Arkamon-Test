import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root=fileURLToPath(new URL('..',import.meta.url))
const statusDirectory=path.join(root,'art-source/splash/status')
const records=(await Promise.all((await fs.readdir(statusDirectory)).filter(file=>file.endsWith('.json')).map(async file=>JSON.parse(await fs.readFile(path.join(statusDirectory,file),'utf8'))))).filter(record=>record.outputFile).sort((a,b)=>a.id-b.id)
const destination=path.join(root,'output/splash-art/review-sheets')
await fs.mkdir(destination,{recursive:true})
const cellWidth=600,cellHeight=377,columns=3,perSheet=6
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
for(let start=0;start<records.length;start+=perSheet){
  const group=records.slice(start,start+perSheet),layers=[]
  for(let i=0;i<group.length;i++){
    const record=group[i],left=(i%columns)*cellWidth,top=Math.floor(i/columns)*cellHeight
    const painting=await sharp(path.join(root,record.outputFile)).resize(cellWidth,338,{fit:'contain'}).png().toBuffer()
    const reference=await sharp(path.join(root,'public/sprites/front_sprites',record.id+'.png')).resize(96,96,{fit:'contain',background:'#071b31'}).png().toBuffer()
    const label=Buffer.from('<svg width="600" height="39"><rect width="600" height="39" fill="#071b31"/><text x="12" y="25" fill="#fff1d6" font-size="18" font-family="Arial">'+escape(String(record.id).padStart(3,'0')+' · '+record.name+' · '+record.status)+'</text></svg>')
    layers.push({input:painting,left,top},{input:reference,left:left+cellWidth-100,top:top+338-100},{input:label,left,top:top+338})
  }
  const filename=String(group[0].id).padStart(3,'0')+'-'+String(group.at(-1).id).padStart(3,'0')+'.png'
  await sharp({create:{width:columns*cellWidth,height:Math.ceil(group.length/columns)*cellHeight,channels:4,background:'#071b31'}}).composite(layers).png().toFile(path.join(destination,filename))
}
console.log(JSON.stringify({reviewedSources:records.length,destination:path.relative(root,destination)}))
