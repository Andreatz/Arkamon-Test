import selections from '@/data/audio-selections.json'
import { getAppliedAudioSelection } from '@/presentation/presentationRuntime'
import { assetUrl } from './assetUrl'

const activeClips = new Map<HTMLAudioElement, { volume: number; channel: 'effects' | 'preview' }>()
let musicVolume = 1
let effectsVolume = 1
export interface ScheduledAudioOptions {
  src: string
  volume?: number
  delayMs?: number
  channel?: 'effects' | 'preview'
  onStart?: () => void
  onEnd?: () => void
  onError?: () => void
}
const scheduledClips = new Set<() => void>()

/** One cancellable clock for laboratory and live cues. It never controls game time. */
export function scheduleAudioClip({ src, volume = 1, delayMs = 0, channel = 'effects', onStart, onEnd, onError }: ScheduledAudioOptions): () => void {
  if ((muted && channel !== 'preview') || typeof Audio === 'undefined') return () => {}
  const player = new Audio(assetUrl(src))
  const baseVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1
  player.volume = baseVolume * (channel === 'preview' ? 1 : effectsVolume)
  let active = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    if (!active) return
    active = false
    if (timer !== undefined) clearTimeout(timer)
    player.pause()
    activeClips.delete(player)
    scheduledClips.delete(stop)
  }
  if (scheduledClips.size >= 8) scheduledClips.values().next().value?.()
  scheduledClips.add(stop)
  activeClips.set(player, { volume: baseVolume, channel })
  player.onended = () => { if (active) { stop(); onEnd?.() } }
  player.onerror = () => { if (active) { stop(); onError?.() } }
  const begin = () => {
    if (!active || (muted && channel !== 'preview')) return
    void player.play().then(() => { if (active) onStart?.() }).catch(() => { if (active) { stop(); onError?.() } })
  }
  const delay = Number.isFinite(delayMs) ? Math.max(0, Math.min(10000, delayMs)) : 0
  if (delay > 0) timer = setTimeout(begin, delay)
  else begin()
  return stop
}

export function stopSelectedAudio(): void {
  for (const stop of [...scheduledClips]) stop()
}

export function getSelectedAudioCue(key: string): 'start' | 'impact' {
  return getAppliedAudioSelection(key)?.choice.cue
    ?? (selections.choices as Record<string, { cue?: 'start' | 'impact' }>)[key]?.cue ?? 'impact'
}

export function playSelectedAudio(key: string): () => void {
  const applied = getAppliedAudioSelection(key)
  const choice = applied?.choice ?? (selections.choices as Record<string, { soundId: string; volume: number; delayMs?: number }>)[key]
  const src = applied?.src ?? (choice && (selections.sounds as Record<string, { src: string }>)[choice.soundId]?.src)
  if (!choice || !src) return () => {}
  return scheduleAudioClip({ src, volume: choice.volume, delayMs: choice.delayMs })
}

export type SoundId =
  | 'click'
  | 'battle-start'
  | 'hit'
  | 'ko'
  | 'capture'
  | 'victory'
  | 'level-up'
  | 'evolution'

export type MusicId = 'title' | 'map' | 'battle' | 'evolution'

type WaveType = OscillatorType

interface ToneStep {
  frequency: number
  duration: number
  delay?: number
  type?: WaveType
  gain?: number
}

const SOUND_BANK: Record<SoundId, ToneStep[]> = {
  click: [{ frequency: 620, duration: 0.045, type: 'square', gain: 0.035 }],
  'battle-start': [
    { frequency: 196, duration: 0.08, type: 'sawtooth', gain: 0.055 },
    { frequency: 247, duration: 0.08, delay: 0.08, type: 'sawtooth', gain: 0.055 },
    { frequency: 330, duration: 0.14, delay: 0.16, type: 'sawtooth', gain: 0.06 },
  ],
  hit: [
    { frequency: 130, duration: 0.055, type: 'sawtooth', gain: 0.08 },
    { frequency: 92, duration: 0.07, delay: 0.035, type: 'square', gain: 0.06 },
  ],
  ko: [
    { frequency: 220, duration: 0.12, type: 'triangle', gain: 0.055 },
    { frequency: 165, duration: 0.14, delay: 0.11, type: 'triangle', gain: 0.055 },
    { frequency: 110, duration: 0.2, delay: 0.24, type: 'triangle', gain: 0.055 },
  ],
  capture: [
    { frequency: 523, duration: 0.08, type: 'triangle', gain: 0.05 },
    { frequency: 659, duration: 0.08, delay: 0.09, type: 'triangle', gain: 0.05 },
    { frequency: 784, duration: 0.16, delay: 0.18, type: 'triangle', gain: 0.06 },
  ],
  victory: [
    { frequency: 392, duration: 0.1, type: 'square', gain: 0.045 },
    { frequency: 523, duration: 0.1, delay: 0.1, type: 'square', gain: 0.045 },
    { frequency: 659, duration: 0.12, delay: 0.2, type: 'square', gain: 0.045 },
    { frequency: 784, duration: 0.22, delay: 0.32, type: 'square', gain: 0.045 },
  ],
  'level-up': [
    { frequency: 440, duration: 0.07, type: 'triangle', gain: 0.045 },
    { frequency: 554, duration: 0.07, delay: 0.07, type: 'triangle', gain: 0.045 },
    { frequency: 659, duration: 0.12, delay: 0.14, type: 'triangle', gain: 0.05 },
  ],
  evolution: [
    { frequency: 330, duration: 0.12, type: 'sine', gain: 0.04 },
    { frequency: 440, duration: 0.12, delay: 0.12, type: 'sine', gain: 0.04 },
    { frequency: 660, duration: 0.18, delay: 0.24, type: 'sine', gain: 0.045 },
    { frequency: 880, duration: 0.28, delay: 0.42, type: 'sine', gain: 0.045 },
  ],
}

const MUSIC_BANK: Record<MusicId, ToneStep[]> = {
  title: [
    { frequency: 196, duration: 0.2 },
    { frequency: 247, duration: 0.2, delay: 0.25 },
    { frequency: 294, duration: 0.35, delay: 0.5 },
  ],
  map: [
    { frequency: 262, duration: 0.16 },
    { frequency: 330, duration: 0.16, delay: 0.22 },
    { frequency: 392, duration: 0.22, delay: 0.44 },
  ],
  battle: [
    { frequency: 110, duration: 0.08, type: 'square' },
    { frequency: 147, duration: 0.08, delay: 0.14, type: 'square' },
    { frequency: 165, duration: 0.08, delay: 0.28, type: 'square' },
    { frequency: 220, duration: 0.1, delay: 0.42, type: 'square' },
  ],
  evolution: [
    { frequency: 330, duration: 0.25 },
    { frequency: 494, duration: 0.25, delay: 0.3 },
    { frequency: 659, duration: 0.4, delay: 0.6 },
  ],
}

let ctx: AudioContext | null = null
let muted = false
let currentMusic: MusicId | null = null
let musicTimer: number | null = null
let musicBus: GainNode | null = null
let effectsBus: GainNode | null = null
const activeTones = new Map<OscillatorNode, { gain: GainNode; music: boolean }>()

export function setChannelVolumes(music: number, effects: number): void {
  const valid = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback
  musicVolume = valid(music, musicVolume)
  effectsVolume = valid(effects, effectsVolume)
  if (ctx) {
    musicBus?.gain.setValueAtTime(musicVolume, ctx.currentTime)
    effectsBus?.gain.setValueAtTime(effectsVolume, ctx.currentTime)
  }
  for (const [clip, entry] of activeClips) clip.volume = entry.volume * (entry.channel === 'preview' ? 1 : effectsVolume)
}

function channelBus(audio: AudioContext, music: boolean): GainNode {
  const existing = music ? musicBus : effectsBus
  if (existing) return existing
  const bus = audio.createGain()
  bus.gain.setValueAtTime(music ? musicVolume : effectsVolume, audio.currentTime)
  bus.connect(audio.destination)
  if (music) musicBus = bus
  else effectsBus = bus
  return bus
}

function releaseTone(oscillator: OscillatorNode): void {
  const tone = activeTones.get(oscillator)
  if (!tone) return
  activeTones.delete(oscillator)
  oscillator.onended = null
  oscillator.disconnect()
  tone.gain.disconnect()
}

function stopTones(musicOnly = false): void {
  for (const [oscillator, tone] of activeTones) {
    if (musicOnly && !tone.music) continue
    // Stop also cancels tones scheduled for a future point in the melody.
    try { oscillator.stop() } catch { /* A tone may have just ended. */ }
    releaseTone(oscillator)
  }
}

function hasAudio(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined'
}

function audioContext(): AudioContext | null {
  if (!hasAudio()) return null
  if (!ctx) ctx = new window.AudioContext()
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

/** Resume Web Audio inside the input gesture; HTML audio clicks do not unlock it. */
export function unlockAudio(): void {
  if (!muted) audioContext()
}

function playTone(step: ToneStep, baseDelay = 0, volumeScale = 1, music = false): void {
  const audio = audioContext()
  if (!audio || muted) return

  const start = audio.currentTime + baseDelay + (step.delay ?? 0)
  const duration = Math.max(0.02, step.duration)
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()

  oscillator.type = step.type ?? 'sine'
  oscillator.frequency.setValueAtTime(step.frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime((step.gain ?? 0.025) * volumeScale, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  oscillator.connect(gain)
  gain.connect(channelBus(audio, music))
  activeTones.set(oscillator, { gain, music })
  oscillator.onended = () => releaseTone(oscillator)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function setAudioMuted(nextMuted: boolean): void {
  muted = nextMuted
  if (muted) { stopMusic(); stopTones(); stopSelectedAudio() }
}

export function isAudioMuted(): boolean {
  return muted
}

export function playSound(sound: SoundId): void {
  if (muted) return
  if (getAppliedAudioSelection(`event:${sound}`) || selections.choices[`event:${sound}`]) { playSelectedAudio(`event:${sound}`); return }
  for (const step of SOUND_BANK[sound]) playTone(step)
}

export function playMusic(music: MusicId): void {
  if (currentMusic === music || muted) return
  stopMusic()
  currentMusic = music

  const playLoop = () => {
    if (!currentMusic || muted) return
    for (const step of MUSIC_BANK[currentMusic]) playTone(step, 0, 0.45, true)
  }

  playLoop()
  musicTimer = window.setInterval(playLoop, 3800)
}

export function stopMusic(): void {
  if (musicTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(musicTimer)
  }
  musicTimer = null
  currentMusic = null
  stopTones(true)
}

export function musicForScene(scene: string): MusicId {
  if (scene === 'titolo' || scene === 'laboratorio') return 'title'
  if (scene === 'battaglia') return 'battle'
  if (scene === 'evoluzione') return 'evolution'
  return 'map'
}

export const AUDIO_EVENTI: SoundId[] = [
  'click',
  'battle-start',
  'hit',
  'ko',
  'capture',
  'victory',
  'level-up',
  'evolution',
]
