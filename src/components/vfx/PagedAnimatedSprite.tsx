import { useId, useLayoutEffect, useRef, useState } from 'react'
import { getSpritePlaybackSample, releaseSpriteReactionGate, type AnimatedSpriteProps, type SpritePlaybackClock } from './AnimatedSprite'
import { locateSpritePage, validateSpritePages, type SpritePage } from './spritePages'
import { nativeSpritePageCache, getNativeSpriteBudget, type SpritePageLease, type SpritePagePixels } from '@/utils/spritePageCache'
import { useVfxPlaybackPreferences } from './useVfxPlaybackPreferences'
import { useGamePreferences } from '@/settings/gamePreferences'

/** Native pages share one bounded decoder; the visible canvas survives slow page handovers. */
export function PagedAnimatedSprite(props: AnimatedSpriteProps & { pages: readonly SpritePage[] }) {
  const { src, pages, frameWidth, frameHeight, frameCount, startFrame = 0, loop = false, paused = false,
    replayKey = 0, holdBeforeFrame, preserveFrameWhileLoading = false, className, style, responsive = false, width, height } = props
  const preferences = useVfxPlaybackPreferences(`${src}:${replayKey}`, loop)
  const speed = props.playbackSpeed ?? preferences.speed
  const memoryMode = useGamePreferences(state => state.graphicsMemory)
  const instanceId = useId()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  const pauseRef = useRef(paused), reducedRef = useRef(preferences.reducedMotion), gateRef = useRef(holdBeforeFrame)
  pauseRef.current = paused; reducedRef.current = preferences.reducedMotion; gateRef.current = holdBeforeFrame
  const playback = useRef<{ releaseGate: (marker: number) => void; wake: () => void } | null>(null)
  const previousGate = useRef({ src, replayKey, marker: holdBeforeFrame })
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const update = () => nativeSpritePageCache.setBudget(getNativeSpriteBudget(memoryMode))
    update()
    const query = typeof window === 'undefined' ? undefined : window.matchMedia?.('(max-width: 768px)')
    if (memoryMode !== 'auto' || !query) return
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [memoryMode])

  useLayoutEffect(() => {
    const previous = previousGate.current
    previousGate.current = { src, replayKey, marker: holdBeforeFrame }
    if (previous.src === src && previous.replayKey === replayKey && previous.marker !== undefined && holdBeforeFrame === undefined) {
      playback.current?.releaseGate(previous.marker)
    }
  }, [src, replayKey, holdBeforeFrame])

  useLayoutEffect(() => { playback.current?.wake() }, [paused, preferences.reducedMotion])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context || !validateSpritePages(pages, pages.reduce((sum, page) => sum + page.frameCount, 0), frameWidth, frameHeight)) {
      callbacks.current.onError?.(); return
    }
    let active = true, raf = 0, started = false, completed = false, cueReached = false, readyNotified = false
    let currentLease: SpritePageLease | null = null, currentPage = -1, pixels: SpritePagePixels | undefined
    let stalledAt: number | undefined, pausedAt: number | undefined, nextPrepared = -1
    let frame = 0
    let painted: { frame: number; pixels: SpritePagePixels } | undefined
    const wake = () => { if (active && !raf) raf = requestAnimationFrame(tick) }
    const totalFrames = pages.reduce((sum, page) => sum + page.frameCount, 0)
    const safeStart = Math.max(0, Math.min(startFrame, totalFrames - 1))
    const count = Math.max(1, Math.min(frameCount, totalFrames - safeStart))
    const frameMs = 1000 / Math.max(1, props.fps * speed)
    const durationMs = props.durationMs === undefined ? count * frameMs : props.durationMs / speed
    const clock: SpritePlaybackClock = { startedAt: 0, hasStarted: false }
    const cue = props.cueFrame === undefined ? undefined : Math.max(0, Math.min(props.cueFrame, count - 1))
    const updateMetrics = () => {
      const stats = nativeSpritePageCache.stats()
      canvas.dataset.spriteDecodedBytes = String(stats.decodedBytes)
      canvas.dataset.spriteDecodedBudget = String(stats.budgetBytes)
      canvas.dataset.spritePage = String(currentPage)
      canvas.dataset.spriteFrame = String(safeStart + frame)
      if (canvas.parentElement) {
        canvas.parentElement.dataset.spriteFrame = String(safeStart + frame)
        canvas.parentElement.dataset.spritePage = String(currentPage)
        canvas.parentElement.dataset.spriteHeld = canvas.dataset.spriteHeld ?? 'false'
      }
    }
    const fail = () => {
      if (!active) return
      active = false; cancelAnimationFrame(raf); currentLease?.release(); currentLease = null
      callbacks.current.onError?.()
    }
    const ensurePage = (absolute: number) => {
      const located = locateSpritePage(pages, absolute)
      if (located.pageIndex !== currentPage) {
        currentLease?.release()
        currentPage = located.pageIndex; pixels = undefined
        currentLease = nativeSpritePageCache.acquire(located.page)
        pixels = currentLease.pixels
        const requestedPage = currentPage
        void currentLease.ready.then(resource => {
          if (!active || requestedPage !== currentPage) return
          pixels = resource
          wake()
        }, fail)
      }
      return located
    }
    const draw = (candidate: number) => {
      const absolute = safeStart + candidate
      const located = ensurePage(absolute)
      if (!pixels) return false
      if (painted?.frame === absolute && painted.pixels === pixels) return true
      const startedAt = performance.now()
      try {
        context.clearRect(0, 0, frameWidth, frameHeight)
        context.drawImage(pixels.image, located.col * frameWidth, located.row * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight)
      } catch { fail(); return false }
      frame = candidate
      painted = { frame: absolute, pixels }
      canvas.dataset.spriteDrawSource = pixels.kind
      canvas.dataset.spriteDrawSrc = located.page.src
      canvas.dataset.spriteDrawMs = (performance.now() - startedAt).toFixed(2)
      updateMetrics()
      if (!readyNotified) { readyNotified = true; setReady(true); callbacks.current.onReady?.() }
      const next = (located.pageIndex + 1) % pages.length
      if (next !== nextPrepared && (loop || next > located.pageIndex) && !pauseRef.current && !reducedRef.current) {
        nextPrepared = next
        // Only one next page is warmed; every renderer shares and evicts through the same budget.
        void nativeSpritePageCache.prepare(pages[next])
      }
      return true
    }
    const notifyCue = (candidate: number) => {
      if (cueReached || cue === undefined || candidate < cue) return
      cueReached = true; callbacks.current.onCue?.()
    }
    const complete = () => {
      if (completed) return
      completed = true; canvas.dataset.spritePlayback = 'complete'
      if (canvas.parentElement) canvas.parentElement.dataset.spritePlayback = 'complete'
      callbacks.current.onComplete?.()
    }
    const onStart = () => { if (started) return; started = true; clock.hasStarted = true; clock.startedAt = performance.now(); callbacks.current.onStart?.() }
    const tick = () => {
      raf = 0
      if (!active) return
      const timestamp = performance.now()
      const resting = pauseRef.current || reducedRef.current
      if (resting) {
        pausedAt ??= timestamp
        const target = reducedRef.current && !loop && !pauseRef.current ? count - 1 : frame
        if (draw(target) && reducedRef.current && !pauseRef.current) { onStart(); notifyCue(target); complete() }
        return
      }
      if (pausedAt !== undefined) { if (clock.hasStarted) clock.startedAt += timestamp - pausedAt; pausedAt = undefined }
      if (completed) return
      if (!started) {
        if (!draw(0)) return
        onStart()
        // The first draw can be slow; do not sample an older timestamp against its later start clock.
        raf = requestAnimationFrame(tick); return
      }
      if (stalledAt !== undefined && !pixels) return
      if (stalledAt !== undefined && pixels) {
        const delay = timestamp - stalledAt
        clock.startedAt += delay
        if (clock.resumedAt !== undefined) clock.resumedAt += delay
        stalledAt = undefined
      }
      const gate = gateRef.current === undefined ? undefined : Math.max(0, Math.min(gateRef.current, count - 1))
      const sample = getSpritePlaybackSample(clock, timestamp, frameMs, gate)
      const candidate = loop ? sample.rawFrame % count : Math.min(count - 1, sample.rawFrame)
      if (!draw(candidate)) { stalledAt ??= timestamp; return }
      canvas.dataset.spriteHeld = String(sample.held)
      if (canvas.parentElement) canvas.parentElement.dataset.spriteHeld = String(sample.held)
      notifyCue(candidate)
      if (!loop && !sample.held && (sample.elapsed >= durationMs || sample.rawFrame >= count)) { complete(); return }
      raf = requestAnimationFrame(tick)
    }
    const state = { wake, releaseGate: (marker: number) => {
      const reaction = releaseSpriteReactionGate(clock, performance.now(), frameMs, marker)
      if (reaction !== undefined && draw(reaction)) { canvas.dataset.spriteHeld = 'false'; notifyCue(reaction) }
    } }
    playback.current = state
    setReady(false)
    if (!preserveFrameWhileLoading) context.clearRect(0, 0, frameWidth, frameHeight)
    ensurePage(safeStart)
    raf = requestAnimationFrame(tick)
    return () => { active = false; cancelAnimationFrame(raf); currentLease?.release(); if (playback.current === state) playback.current = null }
  }, [src, replayKey, pages, frameWidth, frameHeight, frameCount, startFrame, loop, props.fps, props.durationMs, props.cueFrame, speed, preserveFrameWhileLoading])

  return <div className={className} data-sprite-instance={instanceId} data-sprite-src={src} data-sprite-renderer="paged-canvas"
    data-sprite-frame={startFrame} data-sprite-fps={props.fps * speed} data-sprite-frame-count={frameCount}
    data-sprite-paused={paused} data-sprite-ready={ready} data-sprite-hold-before-frame={holdBeforeFrame}
    data-sprite-playback={!ready ? 'loading' : paused ? 'paused' : 'playing'}
    style={{ width: responsive ? '100%' : width, height: responsive ? '100%' : height, ...style }} aria-hidden="true">
    <canvas ref={canvasRef} width={frameWidth} height={frameHeight} style={{ display: 'block', width: '100%', height: '100%' }} aria-hidden="true" />
  </div>
}
