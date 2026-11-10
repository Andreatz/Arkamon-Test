import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import sharp from 'sharp'

// Archive built-in imagegen output and make a display derivative; never edits the drawing.
const root=process.cwd(), args=process.argv.slice(2)
const value=key=>args[args.indexOf(key)+1]
const id=Number(value('--id')), input=value('--input')
if(!args.includes('--id')||!args.includes('--input')||!Number.isInteger(id)||id<1||id>110)throw new Error('Use --id 1..110 --input <generated PNG>')
const plan=JSON.parse(await fs.readFile(path.join(root,'art-source/splash/production-plan.json'),'utf8'))
const entry=plan.entries.find(entry=>entry.id===id)
if(!entry)throw new Error('Missing catalog form')
const stem=path.basename(entry.outputFile,'.webp')
const version=args.includes('--version')?value('--version'):'v2-centered'
if(!/^[a-z0-9-]+$/.test(version))throw new Error('Unsafe version')
const master=path.join(root,'output/splash-art/originals',`${stem}-${version}.png`)
await fs.mkdir(path.dirname(master),{recursive:true})
if(path.resolve(input)!==path.resolve(master))await fs.copyFile(input,master)
const meta=await sharp(master).metadata()
if(!meta.width||!meta.height||Math.abs(meta.width/meta.height-16/9)>.03)throw new Error('Source is not a landscape 16:9 illustration')
await fs.mkdir(path.dirname(path.join(root,entry.outputFile)),{recursive:true})
await sharp(master).resize(1920,1080,{fit:'cover',position:'centre'}).webp({quality:94,alphaQuality:100,effort:4}).toFile(path.join(root,entry.outputFile))
const bytes=await fs.readFile(path.join(root,entry.outputFile))
const record={id,name:entry.name,type:entry.type,version,sourceToolPath:path.resolve(input),sourceMaster:path.relative(root,master).replaceAll('\\','/'),sourceDimensions:{width:meta.width,height:meta.height},outputFile:entry.outputFile,runtimePath:entry.runtimePath,promptFile:`art-source/splash/prompts/${stem}.txt`,width:1920,height:1080,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),status:'generated-needs-ui-review',subjectSafeZone:{left:.35,top:.28,right:.65,bottom:.8},generatedAt:new Date().toISOString()}
await fs.mkdir(path.join(root,'art-source/splash/status'),{recursive:true})
await fs.writeFile(path.join(root,`art-source/splash/status/${entry.paddedId}.json`),JSON.stringify(record,null,2)+'\n')
console.log(JSON.stringify(record))
