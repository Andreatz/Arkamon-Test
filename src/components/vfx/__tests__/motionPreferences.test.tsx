import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { AtlasAnimatedSprite as AnimatedSprite } from '../AnimatedSprite'
import { GifVfx } from '../GifVfx'
import { MoveVfxLayer } from '../MoveVfxLayer'
import { SpriteMoveVfx } from '../SpriteMoveVfx'
import { useVfxPlaybackPreferences } from '../useVfxPlaybackPreferences'
import { FallbackVfx } from '../FallbackVfx'
import { ArkamonBattleSprite } from '@/components/arkamon/ArkamonBattleSprite'
import type { MoveVfxPlaybackCallbacks } from '@/components/MoveVfx'
import { CompositeMoveVfx } from '../CompositeMoveVfx'
import type { MoveVfxAsset, MoveVfxRecipe } from '../types'
import type { MoveVfxEvent } from '@/components/MoveVfx'

// Execute the presentation effects directly without a browser or atlas decoding.
const runtime = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  effects: [] as { callback: () => void | (() => void); dependencies?: unknown[] }[],
  preference: 'system' as 'system' | 'on' | 'off', systemReduced: false, speed: 1,
  raf: [] as FrameRequestCallback[],
}))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = runtime.cursor++
    const slots = runtime.slots
    if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial
    return [slots[slot], (value: unknown) => {
      slots[slot] = typeof value === 'function' ? value(slots[slot]) : value
    }]
  },
  useRef: (initial: unknown) => {
    const slot = runtime.cursor++
    if (!(slot in runtime.slots)) runtime.slots[slot] = { current: initial }
    return runtime.slots[slot]
  },
  useEffect: (callback: () => void | (() => void), dependencies?: unknown[]) => runtime.effects.push({ callback, dependencies }),
  useLayoutEffect: (callback: () => void | (() => void), dependencies?: unknown[]) => runtime.effects.push({ callback, dependencies }),
  useCallback: (callback: unknown) => callback,
  useId: () => 'motion-test',
  useContext: (context: { _currentValue: unknown }) => context._currentValue,
}))
vi.mock('framer-motion', () => ({
  motion: { div: 'motion-div', span: 'motion-span', img: 'motion-img' },
  useReducedMotion: () => runtime.systemReduced,
  useAnimation: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), set: vi.fn() }),
}))
vi.mock('@/settings/gamePreferences', () => ({
  useGamePreferences: (selector: (state: unknown) => unknown) => selector({ animationSpeed: runtime.speed === 2 ? 'fast' : 'normal', reducedMotion: runtime.preference }),
  useGameMotionPreferences: () => ({ reducedMotion: runtime.preference === 'system' ? runtime.systemReduced : runtime.preference === 'on', speed: runtime.speed }),
  getAnimationDuration: (duration: number) => Math.max(0, duration) / runtime.speed,
}))
vi.mock('@/store/adminStore', () => ({ useAdminStore: () => ({ playerSprite: { x: 10, y: 60, w: 20, h: 20 }, enemySprite: { x: 60, y: 10, w: 20, h: 20 } }) }))
vi.mock('../preloadVfxAssets', () => ({ prepareMoveVfxPlayback: () => Promise.resolve() }))
vi.mock('../resolveMoveVfxAsset', () => ({
  resolveMoveVfxAsset: () => ({ id: 'test', durationMs: 1200 }),
  resolveMoveVfxRecipe: () => undefined,
  getMoveVfxImpactDelayMs: () => 400,
}))
vi.mock('../vfxManifest', () => ({ MOVE_VFX_ASSETS: { test: { id: 'test', durationMs: 1200 } } }))

const sprite = { src: '/test.webp', columns: 2, rows: 2, frameWidth: 10, frameHeight: 10, frameCount: 4, fps: 24, width: 10, height: 10 }
const asset = { id: 'test', kind: 'gif', src: '/test.gif', width: 32, height: 32, durationMs: 1200, anchor: 'target', layer: 'over-pokemon' } as MoveVfxAsset
const effect = { id: 7, side: 'A', move: { id: 1 } } as MoveVfxEvent
const recipe = { id: 'recipe', durationMs: 1200, steps: [{ id: 'delayed', assetId: 'test', startAtMs: 400 }] } as unknown as MoveVfxRecipe

function beginRender() { runtime.cursor = 0; runtime.effects = [] }
async function readyVfx(callbacks: MoveVfxPlaybackCallbacks) {
  beginRender()
  SpriteMoveVfx({ effect, ...callbacks })
  runtime.effects[0].callback()
  await Promise.resolve()
  beginRender()
  return SpriteMoveVfx({ effect, ...callbacks })
}
function spritePlaybackEffect() {
  const effect = runtime.effects.find(entry => entry.dependencies?.length === 13)
  expect(effect, 'sprite playback effect').toBeDefined()
  return effect!.callback
}

beforeEach(() => {
  vi.useFakeTimers()
  runtime.slots = []; runtime.cursor = 0; runtime.effects = []; runtime.raf = []
  runtime.preference = 'system'; runtime.systemReduced = false; runtime.speed = 1
  vi.stubGlobal('window', { setTimeout, clearTimeout, matchMedia: () => ({ matches: runtime.systemReduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { runtime.raf.push(callback); return runtime.raf.length }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('game motion preference across native frames and VFX', () => {
  it('plays native frames when movement reduction is disabled on a reduced-motion device', () => {
    runtime.preference = 'off'; runtime.systemReduced = true
    const complete = vi.fn()
    AnimatedSprite({ ...sprite, onComplete: complete })
    const dispose = spritePlaybackEffect()()
    expect(requestAnimationFrame).toHaveBeenCalledOnce()
    expect(complete).not.toHaveBeenCalled()
    if (typeof dispose === 'function') dispose()
  })

  it('keeps native frames static when movement reduction is enabled on a normal device', () => {
    runtime.preference = 'on'
    const complete = vi.fn()
    AnimatedSprite({ ...sprite, onComplete: complete })
    spritePlaybackEffect()()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledOnce()
  })

  it.each([['off', true, 'img'], ['on', false, 'span'], ['system', true, 'span'], ['system', false, 'img']] as const)(
    'uses %s on a system reduced=%s for GIF presentation', (preference, system, type) => {
      runtime.preference = preference; runtime.systemReduced = system
      expect(GifVfx({ asset, effectId: 7 }).type).toBe(type)
    },
  )

  it('scales a layer once and passes the native duration to its frame player', () => {
    runtime.speed = 2
    const sheet = { ...asset, kind: 'sprite-sheet', sprite: { ...sprite } } as MoveVfxAsset
    const layer = MoveVfxLayer({ asset: sheet, effectId: 7, side: 'A' })
    const visual = layer.props.children as ReactElement<{ transition: { duration: number }; children: ReactElement<{ durationMs: number }> }>
    expect(visual.props.transition.duration).toBe(0.6)
    expect(visual.props.children.props.durationMs).toBe(1200)
  })

  it('covers the viewport without width-relative vertical margins for screen effects', () => {
    const layer = MoveVfxLayer({ asset: { ...asset, anchor: 'screen' }, effectId: 7, side: 'A' })
    const visual = layer.props.children as ReactElement<{ style: { marginTop: number; marginLeft: number; width: string; height: string }; animate: { left: string; top: string } }>
    expect(visual.props.style).toMatchObject({ width: '100%', height: '100%', marginTop: 0, marginLeft: 0 })
    expect(visual.props.animate).toMatchObject({ left: '0%', top: '0%' })
  })

  it.each([1, 2])('schedules the visible impact and completion on the same clock at speed %i', async speed => {
    runtime.speed = speed
    const onStart = vi.fn(), onImpact = vi.fn(), onComplete = vi.fn()
    await readyVfx({ onStart, onImpact, onComplete })
    const clock = runtime.effects.find(entry => entry.dependencies?.length === 4 && entry.dependencies[1] === effect.id)!
    const dispose = clock.callback()
    runtime.raf[0](0)
    expect(onStart).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(400 / speed - 1)
    expect(onImpact).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onImpact).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(800 / speed)
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onImpact).toHaveBeenCalledOnce()
    if (typeof dispose === 'function') dispose()
  })

  it('shows a stable reduced-motion cue for 180 ms and resolves impact exactly once', async () => {
    runtime.preference = 'on'
    const onStart = vi.fn(), onImpact = vi.fn(), onComplete = vi.fn()
    const cue = await readyVfx({ onStart, onImpact, onComplete })
    expect(cue?.props['data-vfx-reduced-cue']).toBe(true)
    expect(cue?.props.style).toMatchObject({ left: '70%', top: '20%' })
    const clock = runtime.effects.find(entry => entry.dependencies?.length === 4 && entry.dependencies[1] === effect.id)!
    const dispose = clock.callback()
    runtime.raf[0](0)
    vi.advanceTimersByTime(0)
    expect(onImpact).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(179)
    expect(onComplete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledOnce()
    if (typeof dispose === 'function') dispose()
  })

  it('cancels pending fast impact and completion callbacks when unmounted', async () => {
    runtime.speed = 2
    const onImpact = vi.fn(), onComplete = vi.fn()
    await readyVfx({ onImpact, onComplete })
    const dispose = runtime.effects.find(entry => entry.dependencies?.length === 4 && entry.dependencies[1] === effect.id)!.callback()
    runtime.raf[0](0)
    if (typeof dispose === 'function') dispose()
    vi.runAllTimers()
    expect(onImpact).not.toHaveBeenCalled(); expect(onComplete).not.toHaveBeenCalled()
  })

  it.each([1, 2])('starts a composite layer at its relative native delay at speed %i', speed => {
    runtime.speed = speed
    const composite = CompositeMoveVfx({ effect, recipe })
    const step = composite.props.children[0]
    beginRender()
    step.type(step.props)
    const dispose = runtime.effects[0].callback()
    vi.advanceTimersByTime(400 / speed - 1)
    expect(runtime.slots[1]).toBe(false)
    vi.advanceTimersByTime(1)
    expect(runtime.slots[1]).toBe(true)
    if (typeof dispose === 'function') dispose()
  })

  it('keeps current one-shot clocks unchanged when speed changes and uses the new speed on replay', () => {
    expect(useVfxPlaybackPreferences(7).speed).toBe(1)
    runtime.speed = 2; beginRender()
    expect(useVfxPlaybackPreferences(7).speed).toBe(1)
    beginRender()
    expect(useVfxPlaybackPreferences(8).speed).toBe(2)
    runtime.speed = 1; beginRender()
    expect(useVfxPlaybackPreferences(8, true).speed).toBe(1)
  })

  it('keeps a delayed layer on its owning event speed after the setting changes', () => {
    runtime.speed = 2
    const sheet = { ...asset, kind: 'sprite-sheet', sprite: { ...sprite } } as MoveVfxAsset
    const layer = MoveVfxLayer({ asset: sheet, effectId: 7, side: 'A', playbackSpeed: 1 })
    const visual = layer.props.children as ReactElement<{ transition: { duration: number }; children: ReactElement<{ playbackSpeed: number }> }>
    expect(visual.props.transition.duration).toBe(1.2)
    expect(visual.props.children.props.playbackSpeed).toBe(1)
  })

  it('does not restart the VFX clock or repeat its callbacks on a preference change', async () => {
    const onStart = vi.fn(), onImpact = vi.fn(), onComplete = vi.fn()
    await readyVfx({ onStart, onImpact, onComplete })
    const clock = runtime.effects.find(entry => entry.dependencies?.length === 4 && entry.dependencies[1] === effect.id)!
    const dispose = clock.callback()
    runtime.raf[0](0)
    vi.advanceTimersByTime(200)
    runtime.speed = 2; beginRender()
    SpriteMoveVfx({ effect, onStart, onImpact, onComplete })
    const unchangedClock = runtime.effects.find(entry => entry.dependencies?.length === 4 && entry.dependencies[1] === effect.id)!
    expect(unchangedClock.dependencies).toEqual(clock.dependencies)
    vi.advanceTimersByTime(1000)
    expect(onStart).toHaveBeenCalledOnce(); expect(onImpact).toHaveBeenCalledOnce(); expect(onComplete).toHaveBeenCalledOnce()
    if (typeof dispose === 'function') dispose()
  })

  it('uses the selected movement preference and event speed for a missing-asset fallback', () => {
    runtime.preference = 'off'; runtime.systemReduced = true; runtime.speed = 2
    const moving = FallbackVfx({ effectId: 7 })
    expect(moving.props.animate.scale).toEqual([0.2, 1.18, 1.8])
    expect(moving.props.transition.duration).toBe(0.31)
    runtime.preference = 'on'; runtime.systemReduced = false; beginRender()
    const still = FallbackVfx({ effectId: 7 })
    expect(still.props.animate.scale).toBeUndefined()
    expect(still.props.transition.duration).toBe(0)
  })
})

describe('native canvas source handover', () => {
  it('shows the matching initial creature PNG until its native frame is actually painted', async () => {
    const onAnimationReady = vi.fn()
    const outer = ArkamonBattleSprite({ speciesId: 13, name: 'Sparkly', side: 'front', animation: 'attack', onAnimationReady })
    const nativeElement = outer.props.children
    runtime.slots = []; beginRender()
    const initial = nativeElement.type(nativeElement.props)
    const nativeSlots = runtime.slots
    const [fallback, nativeSprite] = initial.props.children.props.children
    expect(fallback.props.src).toBe('/sprites/front_sprites/13.png')
    expect(fallback.props['data-arkamon-first-frame-fallback']).toBe(true)

    const images: { src: string; onload?: () => void }[] = []
    vi.stubGlobal('Image', class {
      src = ''; decoding = 'async'; complete = false; naturalWidth = 5760; naturalHeight = 5760
      onload?: () => void; onerror?: () => void
      constructor() { images.push(this) }
      decode() { return Promise.resolve() }
    })
    vi.stubGlobal('createImageBitmap', undefined)
    const context = { clearRect: vi.fn(), drawImage: vi.fn() }
    runtime.slots = []; beginRender()
    const firstCanvas = AnimatedSprite(nativeSprite.props)
    const spriteSlots = runtime.slots
    const canvasElement = firstCanvas.props.children as ReactElement & { ref: { current: unknown } }
    canvasElement.ref.current = { dataset: {}, getContext: () => context }
    runtime.effects[runtime.effects.length - 1]!.callback()
    expect(context.drawImage).not.toHaveBeenCalled()
    expect(onAnimationReady).not.toHaveBeenCalled()
    const load = runtime.effects.find(entry => entry.dependencies?.length === 4 && entry.dependencies[0] === nativeSprite.props.src)!
    const dispose = load.callback()
    images[0].onload?.()
    for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
    runtime.slots = nativeSlots; beginRender()
    expect(nativeElement.type(nativeElement.props).props.children.props.children[0]).toBeTruthy()
    expect(onAnimationReady).not.toHaveBeenCalled()

    runtime.slots = spriteSlots; beginRender()
    AnimatedSprite(nativeSprite.props)
    runtime.effects[runtime.effects.length - 1]!.callback()
    expect(context.drawImage).toHaveBeenCalledOnce()
    expect(onAnimationReady).toHaveBeenCalledWith('attack', 0)
    runtime.slots = nativeSlots; beginRender()
    expect(nativeElement.type(nativeElement.props).props.children.props.children[0]).toBe(false)
    nativeSprite.props.onError()
    beginRender()
    const failed = nativeElement.type(nativeElement.props)
    expect(failed.props.children.type).toBe('img')
    expect(failed.props.children.props.src).toBe('/sprites/front_sprites/13.png')
    nativeSprite.props.onComplete()
    beginRender()
    const resumed = nativeElement.type(nativeElement.props)
    expect(resumed.props.children.props.children[0].props['data-arkamon-first-frame-fallback']).toBe(true)
    expect(resumed.props.children.props.children[0].props.src).toBe('/sprites/front_sprites/13.png')
    if (typeof dispose === 'function') dispose()
  })

  it.each([true, false])('preserves the previous pixels during loading only when explicitly enabled=%s', async preserveFrameWhileLoading => {
    const images: { src: string; onload?: () => void }[] = []
    vi.stubGlobal('Image', class {
      src = ''; decoding = 'async'; complete = false; naturalWidth = 20; naturalHeight = 20
      onload?: () => void; onerror?: () => void
      constructor() { images.push(this) }
      decode() { return Promise.resolve() }
    })
    vi.stubGlobal('createImageBitmap', undefined)
    const context = { clearRect: vi.fn(), drawImage: vi.fn() }
    const canvas = { dataset: {}, getContext: () => context }
    const onReady = vi.fn()
    const props = { ...sprite, src: '/creature-idle.webp', renderMode: 'canvas' as const, waitForLoad: true, preserveFrameWhileLoading, onReady }
    const first = AnimatedSprite(props)
    const canvasElement = first.props.children as ReactElement & { ref: { current: unknown } }
    canvasElement.ref.current = canvas
    const load = runtime.effects.find(entry => entry.dependencies?.length === 4 && entry.dependencies[0] === props.src)!
    const dispose = load.callback()
    images[0].onload?.()
    for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
    beginRender()
    AnimatedSprite(props)
    runtime.effects[runtime.effects.length - 1]!.callback()
    expect(context.drawImage).toHaveBeenCalledOnce()
    expect(onReady).toHaveBeenCalledOnce()
    context.clearRect.mockClear(); context.drawImage.mockClear(); onReady.mockClear()

    beginRender()
    AnimatedSprite({ ...props, src: '/creature-hit.webp' })
    runtime.effects[runtime.effects.length - 1]!.callback()
    expect(context.clearRect).toHaveBeenCalledTimes(preserveFrameWhileLoading ? 0 : 1)
    expect(context.drawImage).not.toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()

    const nextLoad = runtime.effects.find(entry => entry.dependencies?.length === 4 && entry.dependencies[0] === '/creature-hit.webp')!
    const nextDispose = nextLoad.callback()
    images[1].onload?.()
    for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
    context.clearRect.mockClear()
    beginRender()
    AnimatedSprite({ ...props, src: '/creature-hit.webp' })
    runtime.effects[runtime.effects.length - 1]!.callback()
    expect(context.clearRect).toHaveBeenCalledOnce()
    expect(context.drawImage).toHaveBeenCalledOnce()
    expect(onReady).toHaveBeenCalledOnce()
    if (typeof dispose === 'function') dispose()
    if (typeof nextDispose === 'function') nextDispose()
  })

  it('does not declare a native frame ready when the canvas cannot draw it', () => {
    const onReady = vi.fn(), onError = vi.fn()
    const first = AnimatedSprite({ ...sprite, renderMode: 'canvas', waitForLoad: true, preserveFrameWhileLoading: true, onReady, onError })
    const canvasElement = first.props.children as ReactElement & { ref: { current: unknown } }
    canvasElement.ref.current = { getContext: () => null }
    runtime.effects[runtime.effects.length - 1]!.callback()
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
  })
})
