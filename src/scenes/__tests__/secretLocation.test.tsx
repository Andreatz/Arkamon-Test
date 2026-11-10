import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalMap } from '@data/localMaps'
import { SECRET_LOCATION_GYM_IDS } from '@data/secretLocation'
import { CittaScene } from '@scenes/CittaScene'
import { LocalMapScene } from '@scenes/LocalMapScene'
import { MappaPrincipaleScene } from '@scenes/MappaPrincipaleScene'
import { PercorsoScene } from '@scenes/PercorsoScene'
import { useGameStore } from '@store/gameStore'

vi.mock('@store/gameStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@store/gameStore')>()
  return {
    ...actual,
    useGameStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useGameStore.getState>) => unknown) => selector(actual.useGameStore.getState()),
      actual.useGameStore,
    ),
  }
})

const world = (luogo: string) => ({ mappaId: 'mappa-principale', luogo, x: 0, y: 0, direzione: 'S' as const })
const unlock = (id: 1 | 2) => {
  const key = id === 1 ? 'giocatore1' : 'giocatore2'
  useGameStore.setState((s) => ({ [key]: { ...s[key], allenatoriSconfitti: new Set(SECRET_LOCATION_GYM_IDS) } }))
}

describe('interfaccia del passaggio segreto', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState({ posizione1: world('Roma'), posizione2: world('Roma'), scenaCorrente: { scena: 'citta', payload: { luogo: 'Roma' } } })
  })

  it('nasconde il passaggio a Roma prima dello sblocco personale, anche se l’altro giocatore ha tutte le palestre', () => {
    unlock(2)
    const markup = renderToStaticMarkup(<CittaScene />)
    expect(markup).not.toContain('Passaggio segreto')
    expect(markup).not.toContain('Percorso 15')
    expect(markup).not.toContain('/maps/Percorso_15.png')
  })

  it('offre a Roma il passaggio dopo tutte le palestre, indicando il costo di movimento', () => {
    unlock(1)
    const markup = renderToStaticMarkup(<CittaScene />)
    expect(markup).toContain('Passaggio segreto')
    expect(markup).toContain('1 movimento')
  })

  it('non offre il passaggio in un’altra città neppure a un giocatore sbloccato', () => {
    unlock(1)
    useGameStore.setState({ posizione1: world('Venezia'), scenaCorrente: { scena: 'citta', payload: { luogo: 'Venezia' } } })
    expect(renderToStaticMarkup(<CittaScene />)).not.toContain('Passaggio segreto')
  })

  it('un payload forzato non mostra lo sfondo né attività segrete prima dello sblocco', () => {
    useGameStore.setState({ posizione1: world('Percorso_15'), scenaCorrente: { scena: 'percorso', payload: { luogo: 'Percorso_15' } } })
    const markup = renderToStaticMarkup(<PercorsoScene />)
    expect(markup).toContain('Luogo non disponibile')
    expect(markup).not.toContain('/maps/Percorso_15.png')
    expect(markup).not.toContain('Cespuglio')
    expect(markup).not.toContain('Punti raggiungibili')
  })

  it('protegge anche il componente locale usato direttamente prima dello sblocco', () => {
    useGameStore.setState({ posizione1: world('Percorso_15') })
    const markup = renderToStaticMarkup(<LocalMapScene map={getLocalMap('Percorso_15')!} activities={<p>Contenuto segreto</p>} />)
    expect(markup).not.toContain('Contenuto segreto')
    expect(markup).not.toContain('/maps/Percorso_15.png')
    expect(markup).toContain('Luogo non disponibile')
  })

  it('mostra la rete e il ritorno a Roma dopo l’ingresso, senza inventare cespugli o allenatori', () => {
    unlock(1)
    expect(useGameStore.getState().attraversaPassaggioSegreto(1)).toBe(true)
    const markup = renderToStaticMarkup(<PercorsoScene />)
    expect(markup).toContain('/maps/Percorso_15.png')
    expect(markup).toContain('Torna a Roma')
    expect(markup).toContain('Passaggio di ritorno')
    expect(markup).toContain('Nessuna attività configurata qui.')
    expect(markup).not.toContain('aria-label="Cespuglio')
    expect(markup).not.toContain('aria-label="Sfida')
  })

  it('l’ispezione della schermata di ritorno conserva luogo, pallino e azioni', () => {
    unlock(1)
    expect(useGameStore.getState().attraversaPassaggioSegreto(1)).toBe(true)
    useGameStore.getState().vaiAScena('mappa-principale')
    const before = useGameStore.getState()
    const markup = renderToStaticMarkup(<MappaPrincipaleScene />)
    expect(markup).toContain('Riapri Percorso 15')
    expect(markup).toContain('Torna a Roma')
    expect(markup).not.toContain('/maps/Mappa-Finale.jpg')
    expect(useGameStore.getState()).toBe(before)
    expect(before.posizione1.luogo).toBe('Percorso_15')
    expect(before.turnoOverworld.azioniRimaste).toBe(1)
  })

  it('mostra nel segreto soltanto gli avatar dei giocatori autorizzati', () => {
    unlock(1)
    expect(useGameStore.getState().attraversaPassaggioSegreto(1)).toBe(true)
    useGameStore.setState({ posizione2: world('Percorso_15') })
    const markup = renderToStaticMarkup(<PercorsoScene />)
    expect(markup).toContain('data-local-map-player="1"')
    expect(markup).not.toContain('data-local-map-player="2"')
    unlock(2)
    expect(renderToStaticMarkup(<PercorsoScene />)).toContain('data-local-map-player="2"')
  })

  it('quando l’altro giocatore è sul mondo, l’avatar nel percorso segreto non appare su coordinate inventate', () => {
    unlock(1)
    expect(useGameStore.getState().attraversaPassaggioSegreto(1)).toBe(true)
    useGameStore.getState().passaTurnoOverworld()
    const markup = renderToStaticMarkup(<MappaPrincipaleScene />)
    expect(markup).toContain('/maps/Mappa-Finale.jpg')
    expect(markup).not.toContain('Riapri Percorso 15')
    expect(markup).not.toContain('Passaggio segreto')
  })
})
