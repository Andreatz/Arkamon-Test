import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { audioSourceUrl, parseAudioChoices, suggestedAudio, type AudioCatalog } from './audioCuration'

const catalog = JSON.parse(readFileSync(resolve('public/audio-lab/catalog.json'), 'utf8')) as AudioCatalog
describe('audio audition catalog', () => {
  it('indexes existing local files with unique IDs and leaves all entries unreviewed', () => {
    expect(catalog.files.length).toBe(catalog.total)
    expect(new Set(catalog.files.map((file) => file.id)).size).toBe(catalog.total)
    for (const file of catalog.files) {
      expect(file.src.startsWith('sounds/')).toBe(true)
      expect(file.src.includes('../')).toBe(false)
      expect(existsSync(resolve('public', file.src)), file.src).toBe(true)
      expect(file.reviewed).toBe(false)
    }
  })
  it('only proposes measured, decodable, short candidates', () => {
    const selected = catalog.files.filter((file) => file.shortlist)
    expect(selected.length).toBe(catalog.shortlistCount)
    expect(selected.length).toBeGreaterThan(30)
    for (const file of selected) {
      expect(file.error).toBeNull()
      expect(file.duration).toBeGreaterThanOrEqual(0.07)
      expect(file.duration).toBeLessThanOrEqual(5)
      expect(file.signal?.peakDb).toBeGreaterThan(-55)
      expect(file.format).not.toBe('wma')
    }
  })
  it('matches only the requested sound families and never uses invalid files', () => {
    const result = suggestedAudio(catalog.files, ['electric'], 900)
    expect(result.length).toBeGreaterThan(0)
    for (const file of result) { expect(file.tags).toContain('electric'); expect(file.error).toBeNull() }
    expect(suggestedAudio(catalog.files, ['nonexistent'])).toEqual([])
  })
  it('escapes reserved characters while preserving deployment base and directories', () => {
    expect(audioSourceUrl('sounds/a #1/50%?.wav', '/Arkamon-Beta/'))
      .toBe('/Arkamon-Beta/sounds/a%20%231/50%25%3F.wav')
  })
  it('rejects corrupt, unknown or unsafe saved choices', () => {
    const choice = { soundId: 'ok', volume: 0.5, cue: 'impact', delayMs: 100, status: 'candidate' }
    const raw = JSON.stringify({ version: 1, choices: {
      'move:1': choice, 'move:2': { ...choice, soundId: 'missing' },
      'event:click': { ...choice, volume: 10 }, 'move:3': { ...choice, delayMs: -1 },
      'move:4': null, 'wrong': choice,
    } })
    expect(parseAudioChoices(raw, new Set(['ok']))).toEqual({ 'move:1': choice })
    expect(parseAudioChoices('{broken', new Set())).toEqual({})
    expect(parseAudioChoices(JSON.stringify({ version: 9, choices: {} }), new Set())).toEqual({})
  })
})
