import { describe, expect, it } from 'vitest'
import { initialGameSave } from '@/save/gamePersistence'
import { getLocalMap } from '@/data/localMaps'
import { ALLENATORI } from '@/data'
import { newInteractionDefinition } from '@/interactions/types'
import { buildReadinessReport, currentRaceProgress, type ConnectionReadiness } from './readinessModel'

const disconnected: ConnectionReadiness = { enabled: false, guestEnabled: true, serviceUrl: '', connectionStatus: 'disconnected', snapshot: null }
describe('preparazione della live', () => {
  it('non inventa la storia né blocca le tappe intenzionalmente vuote', () => {
    const report = buildReadinessReport(initialGameSave(), [], disconnected)
    expect(report.counts.errors).toBe(0)
    expect(report.maps.length).toBe(16)
    expect(report.checks.find(check => check.id === 'interaction-coverage')).toMatchObject({ level: 'warning' })
    expect(report.checks.find(check => check.id === 'shop-access')).toMatchObject({ level: 'warning', destination: 'interactions' })
    expect(report.checks.find(check => check.id === 'connection')?.message).toContain('locale resta disponibile')
  })
  it('conta solo interazioni attive e accessi veri ai negozi', () => {
    const map = getLocalMap('Venezia')!
    const entry = { ...newInteractionDefinition(map.id, map.startNode, 'shop'), title: 'Negozio', repeatable: true, action: { kind: 'shop' as const } }
    const report = buildReadinessReport(initialGameSave(), [entry, { ...entry, id: 'disabled', enabled: false }], disconnected)
    expect(report.maps.find(place => place.id === 'Venezia')).toMatchObject({ configured: 1, shops: 1 })
    expect(report.checks.find(check => check.id === 'shop-access')?.level).toBe('ok')
    expect(report.counts.configuredInteractions).toBe(1)
  })
  it('distingue catalogo invalido da semplice configurazione incompleta', () => {
    const entry = { ...newInteractionDefinition('Venezia', 'impossible', 'broken'), title: 'Errata' }
    expect(buildReadinessReport(initialGameSave(), [entry], disconnected).checks.find(check => check.id === 'interaction-invalid')?.level).toBe('error')
  })
  it('segnala come errore un catalogo persistito sospeso invece di presentarlo soltanto come non configurato', () => {
    const report = buildReadinessReport(initialGameSave(), [], disconnected, Date.now(), 'Pallino non disponibile.')
    expect(report.checks.find(check => check.id === 'interaction-recovery')).toMatchObject({ level: 'error', destination: 'interactions', message: expect.stringMatching(/originale.*conservato/) })
    expect(report.counts.errors).toBe(1)
  })
  it('mostra la gara usando solo dati reali e gli eventi restano esterni al rapporto', () => {
    const game = initialGameSave()
    game.giocatore1.nome = 'Melia'
    game.giocatore2.nome = 'Maggi'
    const gym = ALLENATORI.find(trainer => trainer.tipo === 'Capopalestra')!
    game.giocatore1.allenatoriSconfitti.add(gym.id)
    game.league.players[2].completedStages = [0, 1]
    expect(currentRaceProgress(game)).toMatchObject([{ name: 'Melia', badges: 1 }, { name: 'Maggi', badges: 0, leagueStages: 2 }])
  })
  it('non dichiara verificata una connessione sulla sola presenza di credenziali locali', () => {
    expect(buildReadinessReport(initialGameSave(), [], { ...disconnected, connectionStatus: 'connected', serviceUrl: 'https://example.com' }).checks.find(check => check.id === 'connection')?.level).toBe('warning')
  })
})
