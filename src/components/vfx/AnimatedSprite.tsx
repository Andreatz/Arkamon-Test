import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { getPreparedImageAsset } from '@/utils/prepareImageAsset'
import { useVfxPlaybackPreferences } from './useVfxPlaybackPreferences'
import { PagedAnimatedSprite } from './PagedAnimatedSprite'
import type { SpritePage } from './spritePages'

const useSpriteLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Own decoded canvas pixels only while their clip is mounted. */
export function createSpriteCanvasImage(image: HTMLImageElement) {
  let disposed = false
  let bitmap: ImageBitmap | undefined
  const ready: Promise<CanvasImageSource | undefined> = Promise.resolve().then(async () => {
    if (disposed) return undefined
    if (typeof createImageBitmap !== 'function') return image
    try {
      const decodedBitmap = await createImageBitmap(image)
      if (disposed) {
        decodedBitmap.close()
        return undefined
      }
      bitmap = decodedBitmap
      return bitmap
    } catch {
      return disposed ? undefined : image
    }
  })
  return {
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      bitmap?.close()
      bitmap = undefined
    },
  }
}

export interface SpritePlaybackClock {
  startedAt: number
  hasStarted?: boolean
  frameOffset?: number
  heldAt?: number
  heldBeforeFrame?: number
  resumedAt?: number
}

/** Keep a reaction frame behind its impact gate without restarting the clip. */
export function getSpritePlaybackSample(
  clock: SpritePlaybackClock,
  timestamp: number,
  frameDuration: number,
  holdBeforeFrame?: number
) {
  const frameOffset = clock.frameOffset ?? 0
  const elapsed = timestamp - clock.startedAt + frameOffset * frameDuration
  const rawFrame = frameOffset + Math.floor((timestamp - clock.startedAt) / frameDuration)
  if (holdBeforeFrame !== undefined && rawFrame >= holdBeforeFrame) {
    if (clock.heldBeforeFrame !== holdBeforeFrame) {
      clock.heldAt = clock.startedAt + (holdBeforeFrame - frameOffset) * frameDuration
      clock.heldBeforeFrame = holdBeforeFrame
    }
    return { rawFrame: Math.max(0, holdBeforeFrame - 1), elapsed, held: true }
  }
  if (clock.heldAt !== undefined) {
    // Rebase at the reaction marker, avoiding a fractional-frame rounding step back.
    clock.startedAt = clock.resumedAt ?? timestamp
    clock.frameOffset = clock.heldBeforeFrame ?? 0
    clock.heldAt = undefined
    clock.heldBeforeFrame = undefined
    clock.resumedAt = undefined
  }
  const activeFrameOffset = clock.frameOffset ?? 0
  const activeElapsed = timestamp - clock.startedAt + activeFrameOffset * frameDuration
  return {
    rawFrame: activeFrameOffset + Math.floor((timestamp - clock.startedAt) / frameDuration),
    elapsed: activeElapsed,
    held: false,
  }
}

/** An impact can arrive after the marker's logical time but before its next RAF. */
export function releaseSpriteReactionGate(
  clock: SpritePlaybackClock,
  timestamp: number,
  frameDuration: number,
  holdBeforeFrame: number
) {
  if (clock.hasStarted === false || clock.resumedAt !== undefined) return undefined
  if (clock.heldBeforeFrame === undefined) {
    const current = getSpritePlaybackSample(clock, timestamp, frameDuration, holdBeforeFrame)
    if (!current.held) return undefined
  }
  clock.resumedAt = timestamp
  return clock.heldBeforeFrame
}

export interface AnimatedSpriteProps {
  src: string
  pages?: readonly SpritePage[]
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
  frameCount: number
  startFrame?: number
  fps: number
  width: number
  height: number
  responsive?: boolean
  /** Crop large native sheets on a CPU canvas instead of uploading the entire atlas. */
  renderMode?: 'css' | 'canvas'
  durationMs?: number
  /** Use the owning event's speed when a delayed layer joins an existing playback. */
  playbackSpeed?: number
  loop?: boolean
  /** Hold the current frame without scheduling playback. */
  paused?: boolean
  /** Hold immediately before a native reaction marker until its actual VFX impact. */
  holdBeforeFrame?: number
  /** Replay a one-shot without replacing its loaded DOM element. */
  replayKey?: number
  /** Begin the clock only after the sheet is ready to display. */
  waitForLoad?: boolean
  /** Native creature clips keep their last painted pixels during a source handover. */
  preserveFrameWhileLoading?: boolean
  className?: string
  style?: CSSProperties
  onComplete?: () => void
  /** A canvas frame was painted; CSS images also release their fallback on error. */
  onReady?: () => void
  /** Called from the first displayed frame, after loading when requested. */
  onStart?: () => void
  /** A native frame marker; emits once per playback without changing frames. */
  cueFrame?: number
  onCue?: () => void
  onError?: () => void
}

export function getSpriteFramePosition(
  frame: number,
  columns: number,
  frameWidth: number,
  frameHeight: number
) {
  const safeFrame = Math.max(0, frame)
  const safeColumns = Math.max(1, columns)
  const col = safeFrame % safeColumns
  const row = Math.floor(safeFrame / safeColumns)

  return {
    col,
    row,
    backgroundPosition: `-${col * frameWidth}px -${row * frameHeight}px`,
  }
}

export function AnimatedSprite(props: AnimatedSpriteProps) {
  return props.pages ? <PagedAnimatedSprite {...props} pages={props.pages} /> : <AtlasAnimatedSprite {...props} />
}

export function AtlasAnimatedSprite({
  src,
  frameWidth,
  frameHeight,
  columns,
  rows,
  frameCount,
  startFrame = 0,
  fps: sourceFps,
  width,
  height,
  responsive = false,
  renderMode = 'css',
  durationMs: sourceDurationMs,
  playbackSpeed,
  loop = false,
  paused = false,
  holdBeforeFrame,
  replayKey = 0,
  waitForLoad = false,
  preserveFrameWhileLoading = false,
  className,
  style,
  onComplete,
  onReady,
  onStart,
  cueFrame,
  onCue,
  onError,
}: AnimatedSpriteProps) {
  const { reducedMotion, speed: preferenceSpeed } = useVfxPlaybackPreferences(`${src}:${replayKey}`, loop)
  const speed = playbackSpeed ?? preferenceSpeed
  const fps = sourceFps * speed
  const durationMs = sourceDurationMs === undefined ? undefined : sourceDurationMs / speed
  const playbackId = useId()
  const [frame, setFrame] = useState(0)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [held, setHeld] = useState(false)
  const [frameIdentity, setFrameIdentity] = useState(() => ({ src, replayKey }))
  const completeRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const onReadyRef = useRef(onReady)
  const readyIdentityRef = useRef<{ src: string; replayKey: number } | null>(null)
  const playbackIdentityRef = useRef({ src, replayKey })
  playbackIdentityRef.current = { src, replayKey }
  const onStartRef = useRef(onStart)
  const onCueRef = useRef(onCue)
  const onErrorRef = useRef(onError)
  const imageRef = useRef<{ src: string; image: HTMLImageElement } | null>(null)
  const canvasImageRef = useRef<{ src: string; image: CanvasImageSource; kind: 'bitmap' | 'image' } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasErrorIdentityRef = useRef<{ src: string; replayKey: number } | null>(null)
  const holdBeforeFrameRef = useRef(holdBeforeFrame)
  holdBeforeFrameRef.current = holdBeforeFrame
  const previousGateRef = useRef({ src, replayKey, holdBeforeFrame })
  const playbackClockRef = useRef<{ src: string; replayKey: number; clock: SpritePlaybackClock } | null>(null)
  const notifyFrameCueRef = useRef<{ src: string; replayKey: number; notify: (frame: number) => void } | null>(null)
  const ready = (!waitForLoad && renderMode === 'css') || loadedSrc === src
  // The first canvas draw is a layout effect, before passive callback updates.
  onReadyRef.current = onReady
  onErrorRef.current = onError
  onCueRef.current = onCue

  // A new source or replay starts at its own first frame before it can paint.
  if (frameIdentity.src !== src || frameIdentity.replayKey !== replayKey) {
    setFrameIdentity({ src, replayKey })
    setFrame(0)
    setFinished(false)
    setHeld(false)
  }

  const notifyReady = useCallback(() => {
    const current = playbackIdentityRef.current
    const notified = readyIdentityRef.current
    if (notified?.src === current.src && notified.replayKey === current.replayKey) return
    readyIdentityRef.current = current
    onReadyRef.current?.()
  }, [])

  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => { onStartRef.current = onStart }, [onStart])
  useEffect(() => {
    if (renderMode === 'css' && loadedSrc === src) notifyReady()
  }, [loadedSrc, src, replayKey, renderMode, notifyReady])

  useEffect(() => {
    const preparedImage = getPreparedImageAsset(src)
    const image = preparedImage ?? new Image()
    if (!preparedImage) image.decoding = 'async'
    let active = true
    let canvasImage: ReturnType<typeof createSpriteCanvasImage> | undefined
    if (renderMode === 'canvas') setLoadedSrc(null)
    const loadTimeout = waitForLoad ? window.setTimeout(() => {
      if (active) {
        if (renderMode !== 'canvas') notifyReady()
        onErrorRef.current?.()
      }
    }, 15000) : undefined
    const decoded = async () => {
      if (!active) return
      let drawable: CanvasImageSource | undefined = image
      if (renderMode === 'canvas') {
        canvasImage = createSpriteCanvasImage(image)
        drawable = await canvasImage.ready
      }
      if (!active || !drawable) return
      window.clearTimeout(loadTimeout)
      imageRef.current = { src, image }
      canvasImageRef.current = { src, image: drawable, kind: drawable === image ? 'image' : 'bitmap' }
      setLoadedSrc(src)
    }
    let decoding = false
    const loaded = () => {
      if (!active || decoding) return
      decoding = true
      if (typeof image.decode === 'function') void image.decode().then(decoded, () => {
        window.clearTimeout(loadTimeout)
        if (active) {
          if (renderMode !== 'canvas') notifyReady()
          onErrorRef.current?.()
        }
      })
      else void decoded()
    }
    if (preparedImage) void decoded()
    else {
      image.onload = loaded
      image.onerror = () => {
        window.clearTimeout(loadTimeout)
        if (active) {
          if (renderMode !== 'canvas') notifyReady()
          onErrorRef.current?.()
        }
      }
      image.src = src
      if (image.complete && image.naturalWidth > 0) loaded()
    }
    return () => {
      active = false
      canvasImage?.dispose()
      if (imageRef.current?.image === image) imageRef.current = null
      if (canvasImageRef.current?.src === src) canvasImageRef.current = null
      window.clearTimeout(loadTimeout)
      if (!preparedImage) {
        image.onload = null
        image.onerror = null
      }
    }
  }, [src, waitForLoad, renderMode, notifyReady])

  useSpriteLayoutEffect(() => {
    const previousGate = previousGateRef.current
    previousGateRef.current = { src, replayKey, holdBeforeFrame }
    if (holdBeforeFrame !== undefined || paused) return
    if (previousGate.src !== src || previousGate.replayKey !== replayKey || previousGate.holdBeforeFrame === undefined) return
    const playback = playbackClockRef.current
    if (playback?.src !== src || playback.replayKey !== replayKey) return
    const clock = playback.clock
    const reactionFrame = releaseSpriteReactionGate(clock, performance.now(), 1000 / Math.max(1, fps), previousGate.holdBeforeFrame)
    if (reactionFrame === undefined) return
    // Display the reaction in the same commit that releases the impact gate.
    setFrame(reactionFrame)
    setHeld(false)
    const cue = notifyFrameCueRef.current
    if (cue?.src === src && cue.replayKey === replayKey) cue.notify(reactionFrame)
  }, [fps, holdBeforeFrame, paused, replayKey, src])

  useEffect(() => {
    if (paused || !ready) return
    const totalFrames = Math.max(1, columns * rows)
    const safeStartFrame = Math.max(0, Math.min(startFrame, totalFrames - 1))
    const safeFrameCount = Math.max(
      1,
      Math.min(frameCount, totalFrames - safeStartFrame)
    )
    const frameDuration = 1000 / Math.max(1, fps)
    const playbackDuration = durationMs ?? safeFrameCount * frameDuration
    let animationFrame = 0
    let mounted = true
    let started = false
    const clock: SpritePlaybackClock = { startedAt: 0, hasStarted: false }
    playbackClockRef.current = { src, replayKey, clock }
    let cueReached = false
    const cue = cueFrame === undefined ? undefined : Math.max(0, Math.min(Math.floor(cueFrame), safeFrameCount - 1))
    const notifyCue = (currentFrame: number) => {
      if (cueReached || cue === undefined || currentFrame < cue) return
      cueReached = true
      onCueRef.current?.()
    }
    notifyFrameCueRef.current = { src, replayKey, notify: notifyCue }

    completeRef.current = false
    setFinished(false)
    setHeld(false)
    setFrame(0)

    const complete = () => {
      if (completeRef.current) return
      completeRef.current = true
      setFinished(true)
      onCompleteRef.current?.()
    }

    if (reducedMotion) {
      onStartRef.current?.()
      notifyCue(safeFrameCount - 1)
      setFrame(loop ? 0 : safeFrameCount - 1)
      complete()
      return
    }

    const update = () => {
      if (!mounted) return
      // A RAF timestamp belongs to the start of the frame. Another large sprite
      // can finish its first paint before this callback runs; start this clip's
      // clock when its own callback actually begins, so its cues share the
      // coordinator's live performance clock rather than that stale timestamp.
      const timestamp = performance.now()
      if (!started) {
        started = true
        clock.startedAt = timestamp
        clock.hasStarted = true
        onStartRef.current?.()
      }
      const gate = holdBeforeFrameRef.current
      const safeGate = gate === undefined ? undefined : Math.max(0, Math.min(Math.floor(gate), safeFrameCount - 1))
      const { elapsed, rawFrame, held: awaitingImpact } = getSpritePlaybackSample(clock, timestamp, frameDuration, safeGate)
      notifyCue(rawFrame)
      setHeld(awaitingImpact)

      if (awaitingImpact) {
        setFrame(rawFrame)
        animationFrame = requestAnimationFrame(update)
        return
      }

      if (loop) {
        setFrame(rawFrame % safeFrameCount)
        animationFrame = requestAnimationFrame(update)
        return
      }

      if (elapsed >= playbackDuration || rawFrame >= safeFrameCount) {
        setFrame(safeFrameCount - 1)
        complete()
        return
      }

      setFrame(rawFrame)
      animationFrame = requestAnimationFrame(update)
    }

    animationFrame = requestAnimationFrame(update)

    return () => {
      mounted = false
      cancelAnimationFrame(animationFrame)
      if (playbackClockRef.current?.clock === clock) playbackClockRef.current = null
      if (notifyFrameCueRef.current?.notify === notifyCue) notifyFrameCueRef.current = null
    }
  }, [columns, cueFrame, durationMs, fps, frameCount, loop, paused, ready, reducedMotion, replayKey, rows, src, startFrame])

  const totalFrames = Math.max(1, columns * rows)
  const safeStartFrame = Math.max(0, Math.min(startFrame, totalFrames - 1))
  const absoluteFrame = safeStartFrame + frame
  const { col, row } = getSpriteFramePosition(
    absoluteFrame,
    columns,
    frameWidth,
    frameHeight
  )
  const scaleX = width / frameWidth
  const scaleY = height / frameHeight
  const backgroundPosition = responsive
    ? `${columns > 1 ? col * 100 / (columns - 1) : 0}% ${rows > 1 ? row * 100 / (rows - 1) : 0}%`
    : `-${col * frameWidth * scaleX}px -${row * frameHeight * scaleY}px`

  useSpriteLayoutEffect(() => {
    if (renderMode !== 'canvas') return
    const canvas = canvasRef.current
    if (!canvas) return
    const failed = canvasErrorIdentityRef.current
    if (failed?.src === src && failed.replayKey === replayKey) return
    try {
      // Use a CPU-oriented surface to crop the current cell from a large atlas.
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Sprite canvas is unavailable')
      const drawStartedAt = performance.now()
      const decodedImage = canvasImageRef.current
      if (loadedSrc !== src || decodedImage?.src !== src) {
        if (!preserveFrameWhileLoading) context.clearRect(0, 0, frameWidth, frameHeight)
        return
      }
      // Transparent frames still replace the previous drawing, including a final KO.
      context.clearRect(0, 0, frameWidth, frameHeight)
      context.drawImage(
        decodedImage.image,
        col * frameWidth, row * frameHeight, frameWidth, frameHeight,
        0, 0, frameWidth, frameHeight
      )
      const drawMs = performance.now() - drawStartedAt
      const priorMax = canvas.dataset.spriteDrawSrc === src ? Number(canvas.dataset.spriteDrawMaxMs ?? 0) : 0
      canvas.dataset.spriteDrawSrc = src
      canvas.dataset.spriteDrawSource = decodedImage.kind
      canvas.dataset.spriteDrawMs = drawMs.toFixed(2)
      canvas.dataset.spriteDrawMaxMs = Math.max(priorMax, drawMs).toFixed(2)
      notifyReady()
    } catch {
      canvasErrorIdentityRef.current = { src, replayKey }
      // The owning renderer releases its fallback on error; no frame was painted.
      onErrorRef.current?.()
    }
  }, [col, frameHeight, frameWidth, loadedSrc, notifyReady, preserveFrameWhileLoading, renderMode, replayKey, row, src])

  return (
    <div
      className={className}
      data-sprite-frame={absoluteFrame}
      data-sprite-instance={playbackId}
      data-sprite-src={src}
      data-sprite-renderer={renderMode}
      data-sprite-paused={paused}
      data-sprite-held={held}
      data-sprite-hold-before-frame={holdBeforeFrame}
      data-sprite-ready={ready}
      data-sprite-fps={fps}
      data-sprite-frame-count={frameCount}
      data-sprite-playback={!ready ? 'loading' : paused ? 'paused' : finished ? 'complete' : 'playing'}
      style={{
        width: responsive ? '100%' : width,
        height: responsive ? '100%' : height,
        ...(renderMode === 'css' ? {
          backgroundImage: `url(${src})`,
          backgroundPosition,
          backgroundRepeat: 'no-repeat',
          backgroundSize: responsive
            ? `${columns * 100}% ${rows * 100}%`
            : `${columns * frameWidth * scaleX}px ${rows * frameHeight * scaleY}px`,
        } : {}),
        ...style,
      }}
      aria-hidden="true"
    >
      {renderMode === 'canvas' && (
        <canvas
          ref={canvasRef}
          width={frameWidth}
          height={frameHeight}
          style={{ display: 'block', width: '100%', height: '100%' }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
