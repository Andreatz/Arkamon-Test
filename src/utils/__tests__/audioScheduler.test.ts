import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleAudioClip, setAudioMuted, setChannelVolumes, stopSelectedAudio } from '../soundManager'

const players: FakeAudio[] = []
class FakeAudio {
  volume = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  constructor(public src: string) { players.push(this) }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('Audio', FakeAudio); players.length = 0; setAudioMuted(false) })
afterEach(() => { stopSelectedAudio(); setChannelVolumes(1, 1); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('shared audio cue scheduler', () => {
  it('lets an explicit laboratory audition use its own fader while the campaign is muted', async () => {
    setAudioMuted(true)
    setChannelVolumes(1, 0)
    scheduleAudioClip({ src: '/preview.ogg', channel: 'preview', volume: .3, delayMs: 150 })
    await vi.advanceTimersByTimeAsync(150)
    expect(players[0].play).toHaveBeenCalledOnce()
    expect(players[0].volume).toBe(.3)
    setAudioMuted(true)
    expect(players[0].pause).toHaveBeenCalledOnce()
  })
  it('waits the authored delay after the cue and starts exactly once', async () => {
    const start = vi.fn()
    scheduleAudioClip({ src: '/test.ogg', delayMs: 150, volume: .4, onStart: start })
    await vi.advanceTimersByTimeAsync(149)
    expect(players[0].play).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(players[0].play).toHaveBeenCalledOnce()
    expect(players[0].volume).toBe(.4)
    expect(start).toHaveBeenCalledOnce()
  })
  it('cancels a pending cue on mute and cannot play stale audio when unmuted', async () => {
    scheduleAudioClip({ src: '/test.ogg', delayMs: 150 })
    setAudioMuted(true)
    setAudioMuted(false)
    await vi.runAllTimersAsync()
    expect(players[0].play).not.toHaveBeenCalled()
  })
  it('cancels already-playing and pending clips on scene change', async () => {
    scheduleAudioClip({ src: '/first.ogg' })
    scheduleAudioClip({ src: '/next.ogg', delayMs: 150 })
    stopSelectedAudio()
    await vi.runAllTimersAsync()
    expect(players[0].pause).toHaveBeenCalledOnce()
    expect(players[1].play).not.toHaveBeenCalled()
  })
  it('bounds rapid overlapping input and keeps stop idempotent', () => {
    const stops = Array.from({ length: 10 }, (_, index) => scheduleAudioClip({ src: `/${index}.ogg`, delayMs: 100 }))
    expect(players[0].pause).toHaveBeenCalledOnce()
    expect(players[1].pause).toHaveBeenCalledOnce()
    stops[0](); stops[0]()
    expect(players[0].pause).toHaveBeenCalledOnce()
  })
})
