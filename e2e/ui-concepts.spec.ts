import { expect, test } from '@playwright/test'
import { UI_CONCEPTS } from '../src/player-ui/concepts/uiConcepts'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

for (const concept of UI_CONCEPTS) {
  test(`${concept.id}: Squadra, Borsa e strumenti reali`, async ({page, isMobile}) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`/?uiStudioPreview=1&uiConceptFluid=1&uiConcept=${concept.id}&screen=squadra`)
    const shell = page.locator('.pu-shell')
    await expect(shell).toHaveAttribute('data-ui-concept', concept.id)
    await expect(page.locator('.pu-team-slot')).toHaveCount(6)
    await expect(page.locator('.pu-live-team-portrait [data-creature-loaded=true]')).toHaveCount(1)
    await page.evaluate(() => document.fonts.ready)
    await expect(shell.locator('img[src*=".svg"]')).toHaveCount(0)
    if (!isMobile) {
      const actions = await shell.locator('.pu-team-tactics .pu-actions').boundingBox()
      const roster = await shell.locator('.pu-team-list').boundingBox()
      expect(actions!.y + actions!.height).toBeLessThanOrEqual(roster!.y + 1)
    }
    const destination = resolve('output/ui-concepts/screenshots')
    await mkdir(destination, { recursive:true })
    const layout = await shell.evaluate(element => Object.fromEntries(['.pu-content','.pu-live-team','.pu-team-layout','.pu-hero-column','.pu-detail-panel','.pu-team-tactics','.pu-team-tactics>h2','.pu-moves','.pu-actions','.pu-team-list','.pu-team-cap'].map(selector => {
      const node = element.querySelector<HTMLElement>(selector)!, style = getComputedStyle(node), rect = node.getBoundingClientRect()
      return [selector, {x:rect.x,y:rect.y,width:rect.width,height:rect.height,display:style.display,position:style.position,gridRows:style.gridTemplateRows,gridRow:style.gridRow,gridColumn:style.gridColumn,alignItems:style.alignItems,margin:style.margin,maxHeight:style.maxHeight}]
    })))
    await writeFile(resolve(destination,`${concept.id}-${isMobile?'mobile':'desktop'}-layout.json`), JSON.stringify(layout,null,2))
    await page.screenshot({path:resolve(destination, `${concept.id}-${isMobile?'mobile':'desktop'}-squadra.png`)})
    const stateBefore = await page.evaluate(() => localStorage.getItem('arkamon-save'))
    await page.getByRole('button', {name:/Squadra, posto 2:/}).click()
    await expect(page.locator('.pu-live-team-portrait [data-species-id="5"]')).toHaveCount(1)
    for (const [screen, name] of [['borsa','Borsa'],['partita','Menù Partita'],['deposito','Deposito'],['arkadex','Arkadex'],['analisi','Analisi']] as const) {
      await page.getByRole('navigation', {name:'Schermate del giocatore'}).getByRole('button',{name,exact:true}).click()
      await expect(shell).toHaveAttribute('data-player-ui-screen',screen)
      await expect(shell.locator('[role=status]').filter({hasText:'Caricamento'})).toHaveCount(0)
      await expect(shell.locator('img[src*=".svg"]')).toHaveCount(0)
      if(screen==='borsa') {
        await page.getByRole('button',{name:'Cure',exact:true}).click()
        await expect(page.getByRole('button',{name:/Superpozione: 4/})).toBeVisible()
        await page.getByRole('button',{name:/Superpozione: 4/}).click()
        await expect(page.locator('.pu-live-bag-detail>h2')).toHaveText('Superpozione')
        await page.getByLabel('Arkamon da curare').selectOption('ui-preview-1-0')
        const beforeHp = await shell.locator('.pu-cure-preview>div:nth-child(2) .pu-health').boundingBox()
        const afterHp = await shell.locator('.pu-cure-after .pu-health').boundingBox()
        expect(beforeHp!.x + beforeHp!.width).toBeLessThanOrEqual(afterHp!.x + 1)
      }
      await page.screenshot({path:resolve(destination,`${concept.id}-${isMobile?'mobile':'desktop'}-${screen}.png`)})
      const geometry = await shell.evaluate(element => ({width:element.clientWidth,scrollWidth:element.scrollWidth,bodyWidth:document.documentElement.clientWidth,bodyScroll:document.documentElement.scrollWidth}))
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width+1)
      expect(geometry.bodyScroll).toBeLessThanOrEqual(geometry.bodyWidth+1)
      if(!isMobile) {
        const footer=await shell.locator('.pu-footer').boundingBox()
        expect(footer!.y+footer!.height).toBeLessThanOrEqual(page.viewportSize()!.height+1)
      }
    }
    if(!isMobile) {
      await page.setViewportSize({width:1366,height:768})
      for(const [screen,name] of [['squadra','Squadra'],['borsa','Borsa'],['partita','Menù Partita'],['deposito','Deposito'],['arkadex','Arkadex'],['analisi','Analisi']] as const) {
        await page.getByRole('navigation',{name:'Schermate del giocatore'}).getByRole('button',{name,exact:true}).click()
        await expect(shell).toHaveAttribute('data-player-ui-screen',screen)
        await expect(shell.locator('[role=status]').filter({hasText:'Caricamento'})).toHaveCount(0)
        const fit=await shell.locator('.pu-content').evaluate(element=>({height:element.clientHeight,scroll:element.scrollHeight}))
        expect(fit.scroll,`${concept.id}/${screen} fits the compact desktop`).toBeLessThanOrEqual(fit.height+2)
        if(screen==='squadra') {
          const actions=await shell.locator('.pu-team-tactics .pu-actions').boundingBox(), roster=await shell.locator('.pu-team-list').boundingBox()
          expect(actions!.y+actions!.height).toBeLessThanOrEqual(roster!.y+1)
          await page.screenshot({path:resolve(destination,`${concept.id}-compact-squadra.png`)})
        }
      }
    }
    expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(stateBefore)
    expect(errors).toEqual([])
  })
}

test('cinque direzioni selezionabili nella galleria', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('arkamon-save','protected-user-campaign')
    localStorage.setItem('arkamon-automatic-backups-v1','protected-user-backups')
    localStorage.setItem('arkamon-preferences-v1','protected-user-preferences')
  })
  await page.goto('/?uiConcepts=1&legacyConcepts=1')
  const gallery = await page.locator('.uc-lab').boundingBox()
  expect(gallery!.width).toBe(page.viewportSize()!.width)
  for(const concept of UI_CONCEPTS) {
    await page.locator(`[data-concept-choice=${concept.id}]`).click()
    await expect(page.frameLocator('iframe').locator('.pu-shell')).toHaveAttribute('data-ui-concept',concept.id)
  }
  await page.getByRole('navigation',{name:'Schermata da confrontare'}).getByRole('button',{name:'Borsa',exact:true}).click()
  await expect(page.frameLocator('iframe').locator('.pu-shell')).toHaveAttribute('data-player-ui-screen','borsa')
  await page.getByRole('navigation',{name:'Schermata da confrontare'}).getByRole('button',{name:'Menù partita',exact:true}).click()
  const preview = page.frameLocator('iframe')
  await preview.getByRole('button',{name:'Apri Impostazioni',exact:true}).click()
  await preview.getByLabel('Velocità animazioni').selectOption('fast')
  await expect(preview.getByLabel('Velocità animazioni')).toHaveValue('fast')
  expect(await page.evaluate(()=>localStorage.getItem('arkamon-save'))).toBe('protected-user-campaign')
  expect(await page.evaluate(()=>localStorage.getItem('arkamon-automatic-backups-v1'))).toBe('protected-user-backups')
  expect(await page.evaluate(()=>localStorage.getItem('arkamon-preferences-v1'))).toBe('protected-user-preferences')
})
