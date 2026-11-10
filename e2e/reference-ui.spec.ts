import {test,expect,type Locator} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'

const query='/?uiStudioPreview=1&uiConceptFluid=1&uiConcept=aurora&screen='

async function expectProvidedArtwork(root:Locator,required=true) {
  const artwork=root.locator('img[data-provided-asset][data-package-asset][src*="/ui/reference-png/"]')
  if(required)expect(await artwork.count(),'provided artwork is mounted as real images').toBeGreaterThan(0)
  await expect.poll(()=>root.locator('img').evaluateAll((images:HTMLImageElement[])=>images
    .filter(image=>image.hasAttribute('data-provided-asset')||/\.svg$/i.test(new URL(image.currentSrc||image.src).pathname)||/\/ui\/(?:reference-assets|reference-png)\//.test(new URL(image.currentSrc||image.src).pathname))
    .map(image=>({
      source:new URL(image.currentSrc||image.src).pathname,
      complete:image.complete&&image.naturalWidth>0&&image.naturalHeight>0,
      fit:getComputedStyle(image).objectFit,
      packaged:!image.hasAttribute('data-provided-asset')||!!image.getAttribute('data-package-asset'),
    }))
    .filter(image=>! /\/ui\/reference-png\/[a-z0-9][a-z0-9_-]*\.webp$/i.test(image.source)||!image.complete||image.fit!=='contain'||!image.packaged)),
  {message:'provided PNG package artwork loads completely and preserves its proportions',timeout:30000}).toEqual([])
  await expect(root.locator('[data-provided-svg]'),'Aurora does not retain vector crop dependencies').toHaveCount(0)
  if(required)await expect(root.locator('svg:not(.pu-creature-art)'),'menu decoration uses the supplied PNG package').toHaveCount(0)
  const inlineAtlases=await root.locator('svg').evaluateAll(elements=>elements.filter(element=>element.querySelectorAll('path').length>1000).map(element=>({className:element.getAttribute('class'),paths:element.querySelectorAll('path').length})))
  expect(inlineAtlases,'dense source atlases stay outside the live DOM').toEqual([])
}

async function expectCreatureArtwork(root:Locator) {
  const portraits=root.locator('.pu-creature-art')
  expect(await portraits.count(),'real creature portraits remain mounted').toBeGreaterThan(0)
  await expect.poll(()=>portraits.evaluateAll(elements=>elements.every(element=>element.getAttribute('data-creature-loaded')==='true')),
    {message:'all compact icons and full-body portraits finish loading',timeout:30000}).toBe(true)
  const issues=await portraits.evaluateAll(elements=>elements.flatMap(element=>{
    const id=Number(element.getAttribute('data-species-id'))
    const source=element.getAttribute('data-creature-source')
    const expected=element.tagName.toLowerCase()==='img'?`/ui/reference-png/portrait-${String(id).padStart(3,'0')}.webp`:`/sprites/front_sprites/${id}.png`
    const errors:string[]=[]
    if(!Number.isInteger(id)||id<1||id>110)errors.push('invalid official species ID')
    if(source!==expected)errors.push('incorrect species artwork source')
    if(element instanceof HTMLImageElement){
      if(!element.complete||!element.naturalWidth||!element.naturalHeight)errors.push('compact PNG not decoded')
      if(!new URL(element.currentSrc||element.src).pathname.endsWith(expected))errors.push('compact PNG does not match source')
      if(getComputedStyle(element).objectFit!=='contain')errors.push('compact PNG is not contained')
      if(element.closest('.is-large'))errors.push('compact bust replaces a full-body hero')
    }else{
      if(element.getAttribute('preserveAspectRatio')!=='xMidYMid meet')errors.push('full-body portrait framing changed')
      if(!element.querySelector('image')?.getAttribute('href')?.endsWith(expected))errors.push('full-body source changed')
    }
    return errors.map(error=>({id,source,error}))
  }))
  expect(issues,'compact portraits and full-body heroes retain their respective artwork').toEqual([])
}

test('eight reference screens fit and preserve real storage',async({page,isMobile},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  const legacyArtwork:string[]=[];page.on('request',request=>{if(request.resourceType()==='image'&&/\/ui\/(?:studio|player-kit|reference-assets)(?:\/|$)/i.test(new URL(request.url()).pathname))legacyArtwork.push(request.url())})
  await page.addInitScript(()=>{for(const key of ['arkamon-save','arkamon-preferences-v1','arkamon-interactions-v1','arkamon-automatic-backups-v1'])localStorage.setItem(key,'protected-real-data')})
  const destination=resolve('output/reference-ui/final');await mkdir(destination,{recursive:true})
  for(const screen of ['menu','squadra','deposito','arkadex','analisi','borsa','negozio','citta']) {
    await page.goto(query+screen)
    const root=page.locator(screen==='citta'?'.local-map-scene':'.pu-shell')
    await expect(root).toBeVisible({timeout:30000})
    if(screen!=='citta')await expect(root).toHaveAttribute('data-ui-concept','aurora')
    await expect(root.locator('[role=status]').filter({hasText:'Caricamento…'})).toHaveCount(0)
    await page.evaluate(()=>document.fonts.ready)
    await expectProvidedArtwork(root,screen!=='citta')
    if(['arkadex','deposito'].includes(screen)) {
      const fields=await root.locator('.pu-filter-grid select,.pu-deposit-filters select,.pu-filter-grid input[type="search"],.pu-deposit-filters input[type="search"]').evaluateAll(elements=>elements.map(element=>{
        const style=getComputedStyle(element)
        return {image:style.backgroundImage,expected:element.tagName==='SELECT'?'filter-icon.webp':'search-icon.webp',size:style.backgroundSize,appearance:style.appearance}
      }))
      expect(fields.length,'real search and filter fields exist').toBeGreaterThan(0)
      expect(fields.every(field=>field.image.includes(field.expected)&&field.size==='25px 25px'&&field.appearance==='auto'),'square package icons paint beside native editable controls').toBe(true)
    }
    await expectCreatureArtwork(root)
    if(['menu','squadra','deposito','arkadex','citta'].includes(screen))expect(await root.locator('img.pu-creature-art').count(),`${screen}: supplied compact portraits`).toBeGreaterThan(0)
    if(['squadra','arkadex'].includes(screen)) await expect(root.locator('.is-large > svg.pu-creature-art,.pu-splash-hero-presence').first(),`${screen}: full-body hero or decoded splash`).toBeVisible()
    if(['deposito','analisi'].includes(screen))expect(await root.locator('.is-large > svg.pu-creature-art').count(),`${screen}: official full-body hero`).toBeGreaterThan(0)
    await root.evaluate(async el=>{await Promise.all([...el.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})
    if(screen==='borsa') {
      const centered=await root.locator('.pu-live-bag-slot').evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect(),art=button.querySelector('.pu-kit-icon')!.getBoundingClientRect();return {x:Math.abs(box.x+box.width/2-art.x-art.width/2),y:Math.abs(box.y+box.height/2-art.y-art.height/2),fits:art.width<=box.width&&art.height<=box.height}}))
      expect(centered.every(item=>item.x<1&&item.y<1&&item.fits),'bag illustrations are centered inside their frames').toBe(true)
    }
    if(screen!=='citta') {
      const hiddenArt=await root.locator('.pu-nav-button,.pu-live-bag-category,.pu-dex-row,.pu-reference-team .pu-actions>.studio-command').evaluateAll(elements=>elements.filter(el=>getComputedStyle(el,'::before').display==='none').map(el=>el.textContent))
      expect(hiddenArt,'authored decorative layers remain visible').toEqual([])
    }
    const horizontal=await root.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}))
    expect(horizontal.scroll,screen).toBeLessThanOrEqual(horizontal.width+1)
    if(!isMobile) {
      const box=await root.boundingBox();expect(box!.y+box!.height,screen).toBeLessThanOrEqual(page.viewportSize()!.height+1)
      if(screen!=='citta') {
        const content=await root.locator('.pu-content').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight}))
        expect(content.scroll,`${screen} main content fits`).toBeLessThanOrEqual(content.height+2)
      }
    }
    if(screen==='menu')await expect(root.locator('.ref-menu-tile')).toHaveCount(9)
    if(screen==='squadra') {
      await root.getByRole('tab',{name:'Mosse',exact:true}).click();await expect(root.locator('.pu-reference-dossier-content .pu-moves')).toBeVisible()
      await root.getByRole('tab',{name:'Statistiche',exact:true}).click();await expect(root.locator('.pu-reference-statistics')).toBeVisible()
      await root.getByRole('tab',{name:'Riepilogo',exact:true}).click()
      await root.getByRole('button',{name:/Squadra, posto 2:/}).click()
      await expect(root).toHaveAttribute('data-reference-splash-species','5')
      await expect(root.locator('[data-splash-species="5"]')).toBeVisible()
      await root.getByRole('button',{name:'G2 · Maggi',exact:true}).click()
      await expect(root).toHaveAttribute('data-player-ui-player','2')
      await root.getByRole('button',{name:'G1 · Melia',exact:true}).click()
      await root.getByRole('button',{name:/Squadra, posto 1:/}).click()
    }
    if(screen==='negozio') {
      await expect(root.locator('.pu-shop-row')).toHaveCount(7)
      await root.getByRole('button',{name:'Cure',exact:true}).click();await expect(root.locator('.pu-shop-row')).toHaveCount(3)
      await root.getByRole('button',{name:'Cattura',exact:true}).click();await expect(root.locator('.pu-shop-row')).toHaveCount(1)
      await root.getByRole('button',{name:'Tutti',exact:true}).click()
    }
    await page.screenshot({path:resolve(destination,`${info.project.name}-${screen}.png`)})
    const accessibility=await new AxeBuilder({page}).include(screen==='citta'?'.local-map-scene':'.pu-shell').analyze()
    expect(accessibility.violations,screen).toEqual([])
  }
  expect(errors).toEqual([])
  expect(legacyArtwork,'Aurora does not request the suspended legacy SVG families').toEqual([])
  for(const key of ['arkamon-save','arkamon-preferences-v1','arkamon-interactions-v1','arkamon-automatic-backups-v1'])expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe('protected-real-data')
})

test('reference gallery and local map use real controls without modifying the campaign',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('arkamon-save','protected-campaign'))
  await page.goto('/?uiReferences=1')
  const preview=page.frameLocator('iframe')
  await expect(preview.locator('.ref-main-menu')).toBeVisible({timeout:30000})
  await expectProvidedArtwork(preview.locator('.pu-shell'))
  await page.getByRole('button',{name:'Mappa locale',exact:true}).click()
  await expect(preview.locator('.local-map-budget')).toHaveText('2 azioni')
  const move=preview.getByRole('navigation',{name:'Punti raggiungibili'}).getByRole('button').first()
  await expect(move).toBeEnabled();await move.click()
  await expect(preview.locator('.local-map-budget')).toHaveText('1 azione')
  await preview.getByRole('button',{name:'Menù',exact:true}).click()
  await expect(preview.locator('.ref-main-menu')).toBeVisible()
  await preview.getByRole('button',{name:'Apri Squadra',exact:true}).click()
  await expect(preview.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen','squadra')
  await expectProvidedArtwork(preview.locator('.pu-shell'))
  expect(await page.evaluate(()=>localStorage.getItem('arkamon-save'))).toBe('protected-campaign')
})

test('the splash picker previews distinct forms in both live screens without touching saved data',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('arkamon-save','protected-campaign'))
  await page.goto('/?uiReferences=1&screen=squadra&splash=13')
  const preview=page.frameLocator('iframe')
  await expect(preview.locator('.pu-shell')).toHaveAttribute('data-reference-splash-species','13',{timeout:30000})
  await page.getByRole('combobox',{name:'Arkamon dello splash'}).selectOption('9')
  await expect(preview.locator('.pu-shell')).toHaveAttribute('data-reference-splash-species','9')
  await expect(preview.locator('[data-splash-source]')).toHaveAttribute('data-splash-source','/backgrounds/arkamon-splash/009-felyss.webp')
  await page.getByRole('button',{name:'Arkadex',exact:true}).click()
  await expect(preview.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen','arkadex')
  await expect(preview.locator('.pu-shell')).toHaveAttribute('data-reference-splash-species','9')
  await page.getByRole('combobox',{name:'Arkamon dello splash'}).selectOption('43')
  await expect(preview.locator('.pu-shell')).toHaveAttribute('data-reference-splash-species','43')
  await expect(page.getByRole('link',{name:'Apri a pieno schermo ↗'})).toHaveAttribute('href',/screen=arkadex&splash=43$/)
  expect(await page.evaluate(()=>localStorage.getItem('arkamon-save'))).toBe('protected-campaign')
})
