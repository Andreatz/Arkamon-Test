import { useSceneNavigation } from '@/components/transitions/SceneNavigationContext'
import { useEffect } from 'react'
import { useGameStore } from '@store/gameStore'
import {
  musicForScene,
  playMusic,
  playSound,
  setAudioMuted,
  setChannelVolumes,
  stopMusic,
  stopSelectedAudio,
  unlockAudio,
} from '@/utils/soundManager'
import { useGamePreferences } from '@/settings/gamePreferences'

export function AudioController() {
  const scena = useSceneNavigation().scena
  const compactControl = scena === 'deposito' || scena === 'battaglia'
  const audioMuted = useGameStore((s) => s.audioMuted)
  const setMutedStore = useGameStore((s) => s.setAudioMuted)
  const musicVolume = useGamePreferences((s) => s.musicVolume)
  const effectsVolume = useGamePreferences((s) => s.effectsVolume)

  useEffect(() => { setChannelVolumes(musicVolume, effectsVolume) }, [musicVolume, effectsVolume])

  useEffect(() => {
    stopSelectedAudio()
    setAudioMuted(audioMuted)
    if (audioMuted) {
      stopMusic()
      return
    }
    playMusic(musicForScene(scena))
  }, [audioMuted, scena])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      unlockAudio()
      const target = event.target
      if (target instanceof Element && target.closest('button')) {
        playSound('click')
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      unlockAudio()
      if (!event.repeat && (event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.closest('button')) playSound('click')
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      stopMusic()
      stopSelectedAudio()
    }
  }, [])

  return (
    <button
      type="button"
      className={`z-50 flex items-center justify-center rounded-md border border-white/15 bg-black/70 font-bold text-white shadow-xl backdrop-blur transition hover:bg-black/85 ${compactControl
        ? 'absolute right-[0.75%] top-1/2 aspect-square w-[5%] max-w-9 -translate-y-1/2 p-0 text-[clamp(10px,2.4vw,18px)]'
        : 'fixed bottom-4 right-4 px-3 py-2 text-xs'}`}
      onClick={() => {
        setAudioMuted(!audioMuted)
        if (audioMuted) unlockAudio()
        setMutedStore(!audioMuted)
      }}
      aria-pressed={!audioMuted}
      aria-label={compactControl ? (audioMuted ? 'Attiva audio' : 'Disattiva audio') : undefined}
      title={audioMuted ? 'Audio disattivato' : 'Audio attivo'}
    >
      {compactControl
        ? <span aria-hidden="true">{audioMuted ? '🔇' : '🔊'}</span>
        : audioMuted ? 'Audio OFF' : 'Audio ON'}
    </button>
  )
}
