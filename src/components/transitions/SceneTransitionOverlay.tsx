import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { assetUrl } from '@/utils/assetUrl'
import type { SceneTransitionPhase } from './sceneTransitionState'
import { ArkamonDiceArtwork } from './ArkamonDiceArtwork'
import {
  TRANSITION_VIDEO_PATH,
  TRANSITION_VIDEO_START_SECONDS,
  TRANSITION_VIDEO_SEGMENT_SECONDS,
  type SceneTransitionProfile,
} from './sceneTransitionProfiles'

interface SceneTransitionOverlayProps {
  phase: Exclude<SceneTransitionPhase, 'idle'>
  startCovered: boolean
  profile: SceneTransitionProfile
  onCovered: () => void
  onRevealed: () => void
}

export function SceneTransitionOverlay({ phase, profile, startCovered, onCovered, onRevealed }: SceneTransitionOverlayProps) {
  const beganCovered = useRef(startCovered).current
  const videoRef = useRef<HTMLVideoElement>(null)
  const callbacks = useRef({ onCovered, onRevealed })
  const videoTerminal = useRef(false)
  const [videoReady, setVideoReady] = useState(false)
  const [finishRequested, setFinishRequested] = useState(false)
  const fading = phase === 'reveal' && finishRequested

  useEffect(() => { callbacks.current = { onCovered, onRevealed } }, [onCovered, onRevealed])
  const finish = useCallback(() => {
    videoTerminal.current = true
    setFinishRequested(true)
  }, [])
  const videoFailed = useCallback(() => {
    if (videoTerminal.current) return
    videoTerminal.current = true
    videoRef.current?.pause()
    setVideoReady(false)
    setFinishRequested(true)
  }, [])

  useEffect(() => {
    if (phase !== 'cover') return
    const timer = window.setTimeout(() => callbacks.current.onCovered(), profile.coverMs)
    return () => window.clearTimeout(timer)
  }, [phase, profile.coverMs])

  useEffect(() => {
    if (profile.mode !== 'battle-video') return
    const timer = window.setTimeout(videoFailed, profile.failSafeMs)
    return () => window.clearTimeout(timer)
  }, [videoFailed, profile.failSafeMs, profile.mode])

  useEffect(() => {
    if (profile.mode === 'battle-video' || phase !== 'reveal') return
    const timer = window.setTimeout(finish, profile.durationMs - profile.blendMs)
    return () => window.clearTimeout(timer)
  }, [finish, phase, profile.mode, profile.durationMs, profile.blendMs])

  useEffect(() => {
    if (!fading) return
    const timer = window.setTimeout(() => callbacks.current.onRevealed(), profile.blendMs)
    return () => window.clearTimeout(timer)
  }, [fading, profile.blendMs])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = profile.playbackRate
  }, [profile.playbackRate])

  const play = () => {
    const video = videoRef.current
    if (!video || videoTerminal.current) return
    video.playbackRate = profile.playbackRate
    void video.play().catch(videoFailed)
  }

  const style = {
    '--scene-cover-ms': `${profile.coverMs}ms`,
    '--scene-blend-ms': `${profile.blendMs}ms`,
    '--scene-dice-ms': `${profile.durationMs + profile.coverMs}ms`,
    '--scene-artwork-filter': profile.filter,
  } as CSSProperties

  return (
    <div
      className="arka-scene-transition"
      data-scene-transition={fading ? 'reveal' : phase === 'cover' ? 'cover' : 'playing'}
      data-start-covered={beganCovered}
      data-video-ready={videoReady}
      data-transition-mode={profile.mode}
      style={style}
      aria-hidden="true"
    >
      {profile.mode === 'arkamon-dice' ? <ArkamonDiceArtwork /> : null}
      {profile.mode === 'battle-video' ? (
        <video
          ref={videoRef}
          className="arka-scene-transition__video"
          data-ready={videoReady}
          src={assetUrl(TRANSITION_VIDEO_PATH)}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(event) => {
            if (videoTerminal.current) return
            const video = event.currentTarget
            if (Number.isFinite(video.duration) && video.duration > TRANSITION_VIDEO_START_SECONDS) {
              video.currentTime = TRANSITION_VIDEO_START_SECONDS
            } else {
              play()
            }
          }}
          onSeeked={play}
          onPlaying={() => {
            if (videoTerminal.current) videoRef.current?.pause()
            else setVideoReady(true)
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget
            if (!Number.isFinite(video.duration)) return
            const segmentEnd = Math.min(video.duration, TRANSITION_VIDEO_START_SECONDS + TRANSITION_VIDEO_SEGMENT_SECONDS)
            const remainingMs = (segmentEnd - video.currentTime) / profile.playbackRate * 1000
            if (remainingMs <= profile.blendMs) finish()
          }}
          onEnded={finish}
          onError={videoFailed}
        />
      ) : null}
    </div>
  )
}
