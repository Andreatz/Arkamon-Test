import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import selections from '@/data/audio-selections.json'
import { MOVE_VFX_ASSIGNMENTS } from '../vfx/moveVfxAssignments'
import { playSelectedAudio, playSound, setAudioMuted } from '@/utils/soundManager'

afterEach(() => { setAudioMuted(true); vi.unstubAllGlobals(); setAudioMuted(false) })
describe('selected game audio', () => {
  it('covers all 276 moves and 10 events with real normalized files', () => {
    const choices = selections.choices as Record<string, { soundId: string; volume: number; cue: string }>
    const sounds = selections.sounds as Record<string, { src: string }>
    expect(Object.keys(choices)).toHaveLength(286)
    for (const move of MOVE_VFX_ASSIGNMENTS) expect(choices[`move:${move.sourceMoveId}`]).toBeDefined()
    for (const choice of Object.values(choices)) {
      expect(choice.volume).toBeGreaterThan(0)
      expect(choice.volume).toBeLessThanOrEqual(1)
      expect(['start','impact']).toContain(choice.cue)
      const path = resolve('public', sounds[choice.soundId].src)
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path).subarray(0,4).toString()).toBe('OggS')
    }
  })
  it('uses the selected clip for generic events and cancels active sound on mute', () => {
    const players: { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = []
    class FakeAudio {
      volume = 1
      play = vi.fn().mockResolvedValue(undefined)
      pause = vi.fn()
      constructor(public src: string) { players.push(this) }
    }
    vi.stubGlobal('Audio', FakeAudio)
    playSound('click')
    expect(players).toHaveLength(1)
    expect(players[0].play).toHaveBeenCalledOnce()
    setAudioMuted(true)
    expect(players[0].pause).toHaveBeenCalledOnce()
    playSelectedAudio('move:38')
    expect(players).toHaveLength(1)
  })
  it('bounds rapid overlapping playback and handles missing selections safely', () => {
    const pauses = vi.fn()
    class FakeAudio { play = vi.fn().mockResolvedValue(undefined); pause = pauses }
    vi.stubGlobal('Audio', FakeAudio)
    for(let i=0;i<12;i++) playSelectedAudio('event:click')
    expect(pauses).toHaveBeenCalledTimes(4)
    expect(() => playSelectedAudio('move:9999')()).not.toThrow()
  })
})
