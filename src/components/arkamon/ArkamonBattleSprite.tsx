import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  motion,
  useAnimation,
  type TargetAndTransition,
  type Transition,
} from 'framer-motion'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { assetUrl } from '@/utils/assetUrl'
import { AnimatedSprite } from '@/components/vfx/AnimatedSprite'
import {
  resolveArkamonAnimationAsset,
  getArkamonAnimationAsset,
  getArkamonAnimationDurationMs,
  type ArkamonBattleAnimation,
  type ArkamonSpriteSide,
} from './arkamonAnimationManifest'
import { getArkamonMotionProfile } from './arkamonMotionProfiles'

export type ArkamonAnimationCue = 'release' | 'reaction'

function getProceduralMotion(
  speciesId: number,
  side: ArkamonSpriteSide,
  animation: ArkamonBattleAnimation,
  reduceMotion: boolean
): { animate: TargetAndTransition; transition: Transition & { duration?: number } } {
  const profile = getArkamonMotionProfile(speciesId)
  const direction = side === 'back' ? 1 : -1

  if (reduceMotion) {
    return {
      animate: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, filter: 'brightness(1)' },
      transition: { duration: 0.1 },
    }
  }

  switch (animation) {
    case 'attack':
      return {
        animate: {
          x: [0, direction * profile.attackDistance, 0],
          y: [0, -profile.attackLift, 0],
          rotate: [0, direction * profile.attackTilt, 0],
          scale: [1, profile.attackScale, 1],
        },
        transition: { duration: 0.46, ease: 'easeInOut' },
      }

    case 'hit':
      return {
        animate: {
          scale: [1, profile.hitScale, 1.025, 1],
          filter: [
            'brightness(1)',
            'brightness(2.2) saturate(0.45)',
            'brightness(1)',
          ],
        },
        transition: { duration: 0.24, ease: 'easeOut' },
      }

    case 'ko':
      return {
        animate: {
          y: [0, 8],
          rotate: [0, direction * profile.koTilt],
          scale: [1, 0.96],
          opacity: [1, 0.56],
        },
        transition: { duration: 0.42, ease: 'easeOut' },
      }

    case 'victory':
      return {
        animate: {
          y: [0, -profile.victoryLift, 0],
          rotate: [
            0,
            -direction * profile.victoryTilt,
            direction * profile.victoryTilt,
            0,
          ],
          scale: [1, 1.045, 1],
        },
        transition: {
          duration: 1.15,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatDelay: 0.18,
        },
      }

    case 'idle':
    default:
      return {
        animate: {
          y: [0, -profile.idleLift, 0],
          rotate: [0, -profile.idleTilt, profile.idleTilt, 0],
          scale: [1, profile.idleScale, 1],
        },
        transition: {
          duration: profile.idleSeconds,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'mirror',
        },
      }
  }
}

export interface ArkamonPlaybackState {
  animation: ArkamonBattleAnimation
  replayKey: number
  generation: number
  requestedAnimation: ArkamonBattleAnimation
  requestedReplayKey: number
  completed: boolean
}

/** Ignore an early idle request while a dedicated action is still playing. */
export function requestArkamonPlayback(
  current: ArkamonPlaybackState,
  animation: ArkamonBattleAnimation,
  replayKey: number,
  holdCurrentClip: boolean
): ArkamonPlaybackState {
  if (current.requestedAnimation === animation && current.requestedReplayKey === replayKey) return current
  const requested = { requestedAnimation: animation, requestedReplayKey: replayKey }
  if (animation === 'idle' && holdCurrentClip && !current.completed) return { ...current, ...requested }
  return { ...current, ...requested, animation, replayKey, generation: current.generation + 1, completed: false }
}

/** A generation guard prevents a finished or interrupted clip from changing a newer one. */
export function completeArkamonPlayback(current: ArkamonPlaybackState, generation: number): ArkamonPlaybackState {
  if (current.generation !== generation || current.completed || current.animation === 'idle') return current
  return current.animation === 'ko'
    ? { ...current, completed: true }
    : { ...current, animation: 'idle', generation: current.generation + 1, completed: false }
}

export function ArkamonBattleSprite({
  speciesId,
  name,
  side,
  animation,
  scale = 1,
  animationEnabled = true,
  playbackPaused = false,
  reviewFrame,
  holdReactionUntilImpact = false,
  finishActionBeforeIdle = true,
  replayKey = 0,
  className = '',
  onError,
  onAnimationComplete,
  onAnimationReady,
  onAnimationStart,
  onAnimationCue,
}: {
  speciesId: number
  name: string
  side: ArkamonSpriteSide
  animation: ArkamonBattleAnimation
  scale?: number
  animationEnabled?: boolean
  /** Mount and paint the native first frame while keeping its action clock stopped. */
  playbackPaused?: boolean
  /** Laboratory only: show a source frame without altering its pixels, order or duration. */
  reviewFrame?: number
  /** Keep the native hit immediately before its reaction until the VFX impact arrives. */
  holdReactionUntilImpact?: boolean
  /** Battle feedback can request idle early; a manual preview may interrupt it. */
  finishActionBeforeIdle?: boolean
  replayKey?: number
  className?: string
  onError?: () => void
  onAnimationComplete?: (animation: ArkamonBattleAnimation, replayKey: number) => void
  onAnimationReady?: (animation: ArkamonBattleAnimation, replayKey: number) => void
  onAnimationStart?: (animation: ArkamonBattleAnimation, replayKey: number) => void
  onAnimationCue?: (animation: ArkamonBattleAnimation, replayKey: number, cue: ArkamonAnimationCue) => void
}) {
  const { reducedMotion: reduceMotion, speed } = useGameMotionPreferences()
  const resolved = animationEnabled ? resolveArkamonAnimationAsset(speciesId, side, animation) : undefined
  const callbacksRef = useRef({ onAnimationStart, onAnimationCue, onAnimationReady })
  callbacksRef.current = { onAnimationStart, onAnimationCue, onAnimationReady }
  useEffect(() => {
    if (resolved || playbackPaused || animation === 'idle') return
    callbacksRef.current.onAnimationStart?.(animation, replayKey)
    if (animation === 'attack') callbacksRef.current.onAnimationCue?.(animation, replayKey, 'release')
  }, [animation, replayKey, speciesId, side, !!resolved, playbackPaused])
  useEffect(() => {
    if (!resolved && animationEnabled && animation !== 'idle') callbacksRef.current.onAnimationReady?.(animation, replayKey)
  }, [animation, replayKey, speciesId, side, !!resolved, animationEnabled])
  const transformStyle: CSSProperties = {
    transform: `scale(${scale})`,
    transformOrigin: 'center bottom',
  }

  if (resolved) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ ...transformStyle, width: '100%', height: '100%', containerType: 'size' }}
        role="img"
        aria-label={name}
        data-arkamon-animation={animation}
      >
        <AnimatedArkamonVisual
          key={`${speciesId}:${side}`}
          speciesId={speciesId}
          side={side}
          animation={animation}
          animationEnabled={animationEnabled}
          playbackPaused={playbackPaused || reviewFrame !== undefined}
          reviewFrame={reviewFrame}
          holdReactionUntilImpact={holdReactionUntilImpact}
          finishActionBeforeIdle={finishActionBeforeIdle}
          replayKey={replayKey}
          reduceMotion={!!reduceMotion}
          onError={onError}
          onAnimationComplete={onAnimationComplete}
          onAnimationReady={onAnimationReady}
          onAnimationStart={onAnimationStart}
          onAnimationCue={onAnimationCue}
        />
      </div>
    )
  }

  const folder = side === 'back' ? 'back_sprites' : 'front_sprites'
  const procedural = getProceduralMotion(speciesId, side, animation, !!reduceMotion || !animationEnabled || playbackPaused)

  return (
    <div
      className={className}
      style={transformStyle}
      data-arkamon-animation={animation}
      data-arkamon-renderer="procedural"
      data-arkamon-playback={reduceMotion || !animationEnabled || playbackPaused ? 'paused' : 'playing'}
    >
      <motion.img
        src={assetUrl(`/sprites/${folder}/${speciesId}.png`)}
        alt={name}
        className="h-full w-full object-contain"
        animate={procedural.animate}
        transition={{ ...procedural.transition, duration: typeof procedural.transition.duration === 'number' ? procedural.transition.duration / speed : procedural.transition.duration }}
        onError={onError}
        draggable={false}
      />
    </div>
  )
}

/** Keep playback within this creature/view even when the battle's feedback timer ends. */
function AnimatedArkamonVisual({
  speciesId,
  side,
  animation,
  animationEnabled,
  playbackPaused,
  reviewFrame,
  holdReactionUntilImpact,
  finishActionBeforeIdle,
  replayKey,
  reduceMotion,
  onError,
  onAnimationComplete,
  onAnimationReady,
  onAnimationStart,
  onAnimationCue,
}: {
  speciesId: number
  side: ArkamonSpriteSide
  animation: ArkamonBattleAnimation
  animationEnabled: boolean
  playbackPaused: boolean
  reviewFrame?: number
  holdReactionUntilImpact: boolean
  finishActionBeforeIdle: boolean
  replayKey: number
  reduceMotion: boolean
  onError?: () => void
  onAnimationComplete?: (animation: ArkamonBattleAnimation, replayKey: number) => void
  onAnimationReady?: (animation: ArkamonBattleAnimation, replayKey: number) => void
  onAnimationStart?: (animation: ArkamonBattleAnimation, replayKey: number) => void
  onAnimationCue?: (animation: ArkamonBattleAnimation, replayKey: number, cue: ArkamonAnimationCue) => void
}) {
  const { speed } = useGameMotionPreferences()
  const [run, setRun] = useState<ArkamonPlaybackState>(() => ({
    animation, replayKey, generation: 0,
    requestedAnimation: animation, requestedReplayKey: replayKey, completed: false,
  }))
  const currentAsset = getArkamonAnimationAsset(speciesId, side, run.animation)
  const dedicatedOneShot = run.animation !== 'idle' && !!currentAsset && !currentAsset.loop
  const requestedRun = requestArkamonPlayback(run, animation, replayKey, dedicatedOneShot && finishActionBeforeIdle)
  // Updating during render makes a new action visible immediately, including KO.
  if (requestedRun !== run) setRun(requestedRun)

  const resolved = resolveArkamonAnimationAsset(speciesId, side, run.animation)!
  const animated = resolved.asset
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const [nativeFramePainted, setNativeFramePainted] = useState(false)
  const sheetFailed = failedSource === animated.src
  const controls = useAnimation()
  const onSheetError = useCallback(() => {
    setFailedSource(animated.src)
    // The failed canvas unmounts; the next native clip needs its initial PNG again.
    setNativeFramePainted(false)
  }, [animated.src])
  const runRef = useRef(run)
  runRef.current = run
  const mountedRef = useRef(true)
  const completionCallbackRef = useRef(onAnimationComplete)
  completionCallbackRef.current = onAnimationComplete
  const readyCallbackRef = useRef(onAnimationReady)
  readyCallbackRef.current = onAnimationReady
  const readyGenerationRef = useRef(-1)
  const notifyClipReady = useCallback(() => {
    const current = runRef.current
    if (!mountedRef.current || current.generation !== run.generation || current.animation === 'idle' || readyGenerationRef.current === run.generation) return
    readyGenerationRef.current = run.generation
    readyCallbackRef.current?.(current.animation, current.replayKey)
  }, [run.generation])
  const onClipReady = useCallback(() => {
    setNativeFramePainted(true)
    notifyClipReady()
  }, [notifyClipReady])
  const startCallbackRef = useRef(onAnimationStart)
  startCallbackRef.current = onAnimationStart
  const cueCallbackRef = useRef(onAnimationCue)
  cueCallbackRef.current = onAnimationCue
  const startedGenerationRef = useRef(-1)
  const releasedGenerationRef = useRef(-1)
  const reactionGenerationRef = useRef(-1)
  const onClipStart = useCallback(() => {
    const current = runRef.current
    if (!mountedRef.current || current.generation !== run.generation || current.animation === 'idle' || startedGenerationRef.current === run.generation) return
    startedGenerationRef.current = run.generation
    startCallbackRef.current?.(current.animation, current.replayKey)
  }, [run.generation])
  const onReleaseCue = useCallback(() => {
    const current = runRef.current
    if (!mountedRef.current || current.generation !== run.generation || current.animation !== 'attack' || releasedGenerationRef.current === run.generation) return
    releasedGenerationRef.current = run.generation
    cueCallbackRef.current?.(current.animation, current.replayKey, 'release')
  }, [run.generation])
  const onReactionCue = useCallback(() => {
    const current = runRef.current
    if (!mountedRef.current || current.generation !== run.generation || current.animation !== 'hit' || reactionGenerationRef.current === run.generation) return
    reactionGenerationRef.current = run.generation
    cueCallbackRef.current?.(current.animation, current.replayKey, 'reaction')
  }, [run.generation])
  const onClipComplete = useCallback(() => {
    const current = runRef.current
    const next = completeArkamonPlayback(current, run.generation)
    if (!mountedRef.current || next === current) return
    runRef.current = next
    setRun(next)
    completionCallbackRef.current?.(current.animation, current.replayKey)
  }, [run.generation])
  const onFallbackError = useCallback(() => {
    notifyClipReady()
    if (!playbackPaused) {
      onClipStart()
      onReleaseCue()
      if (dedicatedOneShot && !(run.animation === 'hit' && holdReactionUntilImpact)) onClipComplete()
    }
    onError?.()
  }, [dedicatedOneShot, run.animation, holdReactionUntilImpact, playbackPaused, onClipComplete, notifyClipReady, onClipStart, onReleaseCue, onError])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => { setFailedSource(null) }, [animated.src])

  const clipDurationMs = getArkamonAnimationDurationMs(speciesId, side, run.animation)
  useEffect(() => {
    if (!dedicatedOneShot || run.completed || playbackPaused) return
    if (reduceMotion) {
      onClipStart()
      onReleaseCue()
      onClipComplete()
      return
    }
    // An unavailable sheet still completes its static fallback and cannot trap the view.
    if (sheetFailed) {
      onClipStart()
      if (run.animation === 'hit' && holdReactionUntilImpact) return
      const cueTimer = run.animation === 'attack'
        ? window.setTimeout(onReleaseCue, (animated.releaseFrame ?? 0) / animated.fps * 1000 / speed)
        : undefined
      const timer = window.setTimeout(onClipComplete, clipDurationMs / speed)
      return () => {
        window.clearTimeout(timer)
        window.clearTimeout(cueTimer)
      }
    }
  }, [dedicatedOneShot, run.completed, run.animation, holdReactionUntilImpact, playbackPaused, reduceMotion, sheetFailed, clipDurationMs, animated.releaseFrame, animated.fps, speed, onClipComplete, onClipStart, onReleaseCue])

  const viewport = animated.viewport ?? { width: animated.width, height: animated.height, left: 0, top: 0 }
  const aspect = viewport.width / viewport.height
  const paused = playbackPaused || !animationEnabled || reduceMotion || (run.animation === 'ko' && resolved.isIdleFallback)
  const useProcedural = sheetFailed || resolved.isIdleFallback
  const folder = side === 'back' ? 'back_sprites' : 'front_sprites'

  useEffect(() => {
    const neutral = getProceduralMotion(speciesId, side, run.animation, true)
    if (useProcedural) {
      const procedural = getProceduralMotion(speciesId, side, run.animation, reduceMotion || !animationEnabled || playbackPaused || (run.animation === 'hit' && holdReactionUntilImpact))
      // Replay only the action transform; the mounted idle player keeps its phase.
      void controls.start({
        ...neutral.animate,
        ...procedural.animate,
        transition: { ...procedural.transition, duration: typeof procedural.transition.duration === 'number' ? procedural.transition.duration / speed : procedural.transition.duration },
      })
    } else {
      controls.set(neutral.animate)
    }
    return () => controls.stop()
  }, [controls, speciesId, side, run.animation, holdReactionUntilImpact, playbackPaused, reduceMotion, animationEnabled, useProcedural, run.replayKey, speed])

  return (
    <motion.div
      // Both dimensions are constrained by the battle slot, with no stretching.
      style={{
        width: `min(100cqw, ${aspect * 100}cqh)`,
        height: `min(100cqh, ${100 / aspect}cqw)`,
        aspectRatio: String(aspect),
        transformOrigin: 'center bottom',
        position: 'relative',
        overflow: 'visible',
      }}
      animate={controls}
      data-arkamon-renderer={sheetFailed ? 'procedural' : 'sprite-sheet'}
      data-arkamon-asset-animation={resolved.animation}
      data-arkamon-active-animation={run.animation}
      data-arkamon-replay-key={run.replayKey}
      data-arkamon-motion={useProcedural ? 'procedural' : 'none'}
      data-arkamon-reaction-gated={run.animation === 'hit' && holdReactionUntilImpact}
      data-arkamon-playback={paused ? 'paused' : run.completed ? 'complete' : 'playing'}
    >
      {sheetFailed ? (
        <img
          key="procedural-fallback"
          src={assetUrl(`/sprites/${folder}/${speciesId}.png`)}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain"
          onLoad={notifyClipReady}
          onError={onFallbackError}
          draggable={false}
        />
      ) : (
        <>
        {!nativeFramePainted && <img
          key="native-loading-poster"
          src={assetUrl(`/sprites/${folder}/${speciesId}.png`)}
          alt=""
          aria-hidden="true"
          data-arkamon-first-frame-fallback
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />}
        <AnimatedSprite
          src={assetUrl(animated.src)}
          pages={animated.pages}
          renderMode="canvas"
          frameWidth={animated.frameWidth}
          frameHeight={animated.frameHeight}
          columns={animated.columns}
          rows={animated.rows}
          frameCount={reviewFrame !== undefined || reduceMotion && run.animation === 'ko' ? 1 : animated.frameCount}
          startFrame={reviewFrame !== undefined ? (animated.startFrame ?? 0) + Math.max(0, Math.min(animated.frameCount - 1, reviewFrame)) : reduceMotion && run.animation === 'ko'
            ? (animated.startFrame ?? 0) + animated.frameCount - 1
            : animated.startFrame}
          fps={animated.fps}
          width={animated.width}
          height={animated.height}
          durationMs={animated.durationMs}
          loop={reviewFrame === undefined && (animated.loop ?? resolved.animation === 'idle')}
          responsive
          paused={paused}
          holdBeforeFrame={run.animation === 'hit' && holdReactionUntilImpact ? animated.reactionFrame : undefined}
          replayKey={run.generation}
          waitForLoad
          preserveFrameWhileLoading
          onComplete={dedicatedOneShot ? onClipComplete : undefined}
          onReady={onClipReady}
          onStart={onClipStart}
          cueFrame={run.animation === 'attack' ? animated.releaseFrame ?? 0 : run.animation === 'hit' ? animated.reactionFrame : undefined}
          onCue={run.animation === 'hit' ? onReactionCue : onReleaseCue}
          onError={onSheetError}
          style={animated.viewport ? {
            position: 'absolute',
            width: `${animated.frameWidth / viewport.width * 100}%`,
            height: `${animated.frameHeight / viewport.height * 100}%`,
            left: `${-viewport.left / viewport.width * 100}%`,
            top: `${-viewport.top / viewport.height * 100}%`,
          } : undefined}
        />
        </>
      )}
    </motion.div>
  )
}
