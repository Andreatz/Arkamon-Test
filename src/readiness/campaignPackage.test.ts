import { describe, expect, it } from 'vitest'
import { draftLeagueConfiguration } from '@/league/leagueModel'
import { getLocalMap } from '@/data/localMaps'
import { newInteractionDefinition } from '@/interactions/types'
import { exportCampaignPackage, parseCampaignPackage } from './campaignPackage'

const map = getLocalMap('Venezia')!
const entry = { ...newInteractionDefinition(map.id, map.startNode, 'entry'), title: 'Tappa' }
const baseline = () => JSON.parse(exportCampaignPackage('Prova', { version: 1, interactions: [entry] }, draftLeagueConfiguration()))
describe('pacchetto configurazione separato dai progressi', () => {
  it('porta interazioni e bozza Lega senza dati delle giocatrici né credenziali', () => {
    const result = parseCampaignPackage(JSON.stringify(baseline()))
    expect(result.error).toBeNull()
    expect(Object.keys(result.configuration!)).toEqual(['format', 'version', 'name', 'catalog', 'league'])
    expect(result.configuration?.league?.opponents).toHaveLength(4)
  })
  it.each(['giocatore1', 'posizione1', 'matchLog', 'hostToken', 'progress'])('respinge la proprietà estranea %s invece di importare progressi', key => {
    expect(parseCampaignPackage(JSON.stringify({ ...baseline(), [key]: {} })).error).toContain('progressi non sono ammessi')
  })
  it('non normalizza silenziosamente specie, livelli o regole errate', () => {
    const bundle = baseline()
    bundle.league.opponents[0] = { name: 'Uno', team: [{ pokemonId: 999, livello: 5 }] }
    expect(parseCampaignPackage(JSON.stringify(bundle)).error).toContain('Lega non valida')
    bundle.league.opponents[0].team = [{ pokemonId: 1, livello: 4 }]
    expect(parseCampaignPackage(JSON.stringify(bundle)).configuration).toBeNull()
    bundle.league.opponents[0].team = [{ pokemonId: 1, livello: 5 }]
    bundle.league.defeat = 'invented'
    expect(parseCampaignPackage(JSON.stringify(bundle)).configuration).toBeNull()
  })
  it('valida insieme anche i riferimenti fra interazioni', () => {
    const bundle = baseline()
    bundle.catalog.interactions[0].requirements.completedInteractions = ['missing']
    expect(parseCampaignPackage(JSON.stringify(bundle)).error).toContain('assente')
  })
  it('un file corrotto o enorme non può diventare una configurazione', () => {
    expect(parseCampaignPackage('{').error).toContain('JSON')
    expect(parseCampaignPackage('x'.repeat(2_000_001)).error).toContain('2 MB')
  })
})
