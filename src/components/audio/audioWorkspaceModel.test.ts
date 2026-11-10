import { describe, expect, it } from 'vitest'
import { audioWorkspaceBaseline } from './audioWorkspaceModel'
import type { AudioCatalog } from './audioCuration'
const catalog: AudioCatalog = { total: 0, shortlistCount: 0, metadataErrors: 0, files: [] }
describe('audio lab applied baseline', () => {
  it('keeps applied custom sounds and settings when creating a new draft', () => {
    const choice = { soundId: 'custom-impact', cue: 'start' as const, volume: .25, delayMs: 150, status: 'confirmed' as const }
    const baseline = audioWorkspaceBaseline(catalog, { choices: { 'move:1': choice }, sounds: { 'custom-impact': { src: '/sounds/custom.ogg' } } }, null)
    expect(baseline.choices['move:1']).toEqual(choice)
    expect(baseline.files.get('custom-impact')).toMatchObject({ src: '/sounds/custom.ogg', pack: 'Progetto visivo applicato' })
    expect(baseline.sounds['custom-impact'].src).toBe('/sounds/custom.ogg')
  })
  it('merges only valid local edits over the applied baseline without dropping untouched custom choices', () => {
    const choice = { soundId: 'custom', cue: 'impact' as const, volume: .5, delayMs: 100, status: 'selected' as const }
    const local = { version: 1, choices: { 'move:1': { ...choice, delayMs: 200 }, 'move:2': { ...choice, soundId: 'missing' } } }
    const baseline = audioWorkspaceBaseline(catalog, { choices: { 'move:1': choice, 'move:3': choice }, sounds: { custom: { src: '/sounds/custom.wav' } } }, JSON.stringify(local))
    expect(baseline.choices['move:1'].delayMs).toBe(200)
    expect(baseline.choices['move:3']).toEqual(choice)
    expect(baseline.choices['move:2']?.soundId).not.toBe('missing')
  })
})
