import { expect, test } from '@playwright/test'

test('reacquiring a changed checkpoint discards an unsaved retry calculated from the previous campaign', async ({page}) => {
  await page.addInitScript(()=>{
    if(localStorage.getItem('arkamon-save'))return
    const player=(id:1|2)=>({id,nome:id===1?'Melia':'Maggi',squadra:[{istanzaId:`recovery-${id}`,specieId:id===1?1:5,nome:id===1?'Vyrath':'Darklaw',livello:5,hp:12,xp:0}],deposito:{},cespugliVisitati:[],allenatoriSconfitti:[],caselleConsumate:[],monete:700,inventario:{}})
    const position={mappaId:'mappa-principale',luogo:'Venezia',x:0,y:0,direzione:'S'}
    localStorage.setItem('arkamon-save',JSON.stringify({version:0,state:{giocatore1:player(1),giocatore2:player(2),giocatoreAttivo:1,posizione1:position,posizione2:position,scenaCorrente:{scena:'mappa-principale'},turnoOverworld:{giocatoreAttivo:1,azioniRimaste:2},audioMuted:true}}))
    localStorage.setItem('arkamon-preferences-v1',JSON.stringify({version:1,state:{musicVolume:0,effectsVolume:0,reducedMotion:'on'}}))
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy','false')
  await page.evaluate(async()=>{
    const path=performance.getEntriesByType('resource').map(entry=>entry.name).filter(name=>new URL(name).pathname==='/src/store/gameStore.ts').at(-1)!
    const {useGameStore}=await import(path)
    const original=Storage.prototype.setItem
    Storage.prototype.setItem=function(key,value){if(key==='arkamon-save')throw new DOMException('Quota test','QuotaExceededError');original.call(this,key,value)}
    try{useGameStore.getState().aggiornaMonete(1,50)}finally{Storage.prototype.setItem=original}
  })
  await expect(page.getByRole('dialog',{name:'Salvataggio da completare',exact:true})).toBeVisible()
  await page.evaluate(async()=>{
    const path=performance.getEntriesByType('resource').map(entry=>entry.name).filter(name=>new URL(name).pathname==='/src/store/gameStore.ts').at(-1)!
    const {useGameStore}=await import(path)
    const fresh=JSON.parse(localStorage.getItem('arkamon-save')!)
    fresh.state.giocatore1.nome='Melia da checkpoint più recente'
    fresh.arkamonSession={version:1,revision:100,writer:'external-import'}
    localStorage.setItem('arkamon-save',JSON.stringify(fresh))
    useGameStore.setState({audioMuted:true})
  })
  const request=page.getByRole('button',{name:'Ricarica lo stato e richiedi controllo',exact:true})
  await expect(request).toBeVisible();await request.click()
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy','false')
  await expect(page.getByRole('dialog',{name:'Salvataggio da completare',exact:true})).toHaveCount(0)
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(state.giocatore1.nome).toBe('Melia da checkpoint più recente')
  expect(state.giocatore1.monete).toBe(700)
})
