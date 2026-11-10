import fs from 'node:fs/promises'
import path from 'node:path'
const root=process.cwd()
const review=JSON.parse(await fs.readFile(path.join(root,'art-source/splash/hero-framing-review.json'),'utf8'))
const round=value=>Math.round(value*10000)/10000
const skippedRegenerated=[]
for(const entry of review.entries){
  const file=path.join(root,'art-source/splash/status',String(entry.id).padStart(3,'0')+'.json')
  const status=JSON.parse(await fs.readFile(file,'utf8')),focus=entry.focusBounds
  if(!status.outputFile)throw new Error('No painting for reviewed form'+entry.id)
  // Historical coordinates refer to the former small painting, never the replacement.
  if(status.sourceComposition==='large-central-foreground'||status.sourceComposition==='full-canvas-central-hero'||status.compositionPolicy==='full-canvas-focus'){skippedRegenerated.push(entry.id);continue}
  const width=focus.right-focus.left,height=focus.bottom-focus.top
  const scale=round(Math.max(.5,Math.min(2.5,review.maximumFocusSize.width/width,review.maximumFocusSize.height/height)))
  const offset={x:round(review.targetFocusCenter.x-(.5+((focus.left+focus.right)/2-.5)*scale)),y:round(review.targetFocusCenter.y-(.5+((focus.top+focus.bottom)/2-.5)*scale))}
  const full=status.subjectBounds??{left:focus.left-.025,top:focus.top-.1,right:focus.right+.07,bottom:focus.bottom+.04}
  const subjectBounds={left:Math.min(full.left,focus.left),top:Math.min(full.top,focus.top),right:Math.max(full.right,focus.right),bottom:Math.max(full.bottom,focus.bottom)}
  if(entry.id===26)Object.assign(subjectBounds,{left:.394,top:.397,right:.601,bottom:.729})
  if(entry.id===27)Object.assign(subjectBounds,{left:.337,top:.245,right:.644,bottom:.727})
  if(entry.id===28)Object.assign(subjectBounds,{left:.413,top:.331,right:.604,bottom:.716})
  Object.assign(status,{status:'approved-visual',compositionPolicy:'hero-focus',subjectBounds,focusBounds:focus,displayScale:scale,displayOffset:offset,reviewedAt:new Date().toISOString(),framingReview:'art-source/splash/hero-framing-review.json',
    reviewNotes:'The user clarified that face and torso take priority over complete extremities. The reviewed painting is scaled uniformly and positioned for the live interface; the original drawing is unchanged.'})
  await fs.writeFile(file,JSON.stringify(status,null,2)+'\n')
}
console.log(JSON.stringify({reviewed:review.entries.length-skippedRegenerated.length,skippedRegenerated,policy:'hero-focus'}))
