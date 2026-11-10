import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { PagedAnimatedSprite } from '../PagedAnimatedSprite'
import type { SpritePage } from '../spritePages'
import type { SpritePagePixels } from '@/utils/spritePageCache'
import type { AnimatedSpriteProps } from '../AnimatedSprite'

const runtime = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, effects: [] as { callback: () => void | (() => void); dependencies?: unknown[] }[],
  now: 0, raf: new Map<number, FrameRequestCallback>(), nextRaf: 0, speed: 1, reduced: false,
  resources: new Map<string, SpritePagePixels>(), pending: new Map<string, { ready: Promise<SpritePagePixels>; resolve: (pixels: SpritePagePixels) => void; reject: (error: Error) => void }>(),
  released: [] as string[], prepared: [] as string[], delay: new Set<string>(),
}))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => { const index = runtime.cursor++; const slots = runtime.slots; if (!(index in slots)) slots[index] = initial; return [slots[index], (next: unknown) => { slots[index] = next }] },
  useRef: (initial: unknown) => { const index = runtime.cursor++; if (!(index in runtime.slots)) runtime.slots[index] = { current: initial }; return runtime.slots[index] },
  useLayoutEffect: (callback: () => void | (() => void), dependencies?: unknown[]) => runtime.effects.push({ callback, dependencies }),
  useId: () => 'paged-test',
}))
vi.mock('@/settings/gamePreferences', () => ({ useGamePreferences: () => 'low', useGameMotionPreferences: () => ({ speed: runtime.speed, reducedMotion: runtime.reduced }) }))
vi.mock('@/utils/spritePageCache', () => ({
  getNativeSpriteBudget: () => 32 * 1024 * 1024,
  nativeSpritePageCache: {
    setBudget: vi.fn(), stats: () => ({ decodedBytes: 24 * 1024 * 1024, budgetBytes: 32 * 1024 * 1024 }),
    acquire: (page: SpritePage) => {
      const loaded = runtime.resources.get(page.src)
      if (loaded) return { pixels: loaded, ready: Promise.resolve(loaded), release: () => runtime.released.push(page.src) }
      let pending = runtime.pending.get(page.src)
      if (!pending) { let resolve!: (pixels: SpritePagePixels) => void, reject!: (error: Error) => void; const ready = new Promise<SpritePagePixels>((accept, fail) => { resolve = accept; reject = fail }); pending = { ready, resolve, reject }; runtime.pending.set(page.src, pending) }
      return { ready: pending.ready, release: () => runtime.released.push(page.src) }
    },
    prepare: async (page: SpritePage) => { runtime.prepared.push(page.src); if (!runtime.delay.has(page.src)) runtime.resources.set(page.src, { image: { src: page.src } as unknown as CanvasImageSource, kind: 'bitmap', dispose: vi.fn() }) },
  },
}))

const pages: SpritePage[] = Array.from({ length: 8 }, (_, index) => ({ src: `/page-${index}.webp`, firstFrame: index * 12, frameCount: 12,
  columns: 4, rows: 3, width: 2304, height: 1728, decodedBytes: 2304 * 1728 * 4 }))
const props = { src: '/original-13.webp', pages, frameWidth: 576, frameHeight: 576, columns: 10, rows: 10, frameCount: 96,
  fps: 24, width: 576, height: 576, preserveFrameWhileLoading: true }
const frameMs = 1000 / 24
const context = { clearRect: vi.fn(), drawImage: vi.fn() }
const canvas = { dataset: {} as Record<string, string>, parentElement: { dataset: {} as Record<string, string> }, getContext: () => context }
let effects: { dependencies?: unknown[]; cleanup?: () => void }[] = []
function render(properties: AnimatedSpriteProps & { pages: SpritePage[] } = props) {
  runtime.cursor = 0; runtime.effects = []
  const element = PagedAnimatedSprite(properties)
  const child = element.props.children as ReactElement & { ref: { current: unknown } }
  child.ref.current = canvas
  runtime.effects.forEach((effect, index) => {
    const previous = effects[index]
    if (previous && JSON.stringify(previous.dependencies) === JSON.stringify(effect.dependencies)) return
    previous?.cleanup?.()
    const cleanup = effect.callback()
    effects[index] = { dependencies: effect.dependencies, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
  })
  return element
}
function tick(time: number) {
  runtime.now = time
  const callbacks = [...runtime.raf.values()]; runtime.raf.clear()
  callbacks.forEach(callback => callback(time))
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve() }
function finishPage(index: number) {
  const resource = { image: { src: pages[index].src } as unknown as CanvasImageSource, kind: 'bitmap', dispose: vi.fn() } as SpritePagePixels
  runtime.resources.set(pages[index].src, resource); runtime.pending.get(pages[index].src)?.resolve(resource)
}
beforeEach(() => {
  effects = []; runtime.slots = []; runtime.cursor = 0; runtime.now = 0; runtime.raf.clear(); runtime.nextRaf = 0; runtime.speed = 1; runtime.reduced = false
  runtime.resources.clear(); runtime.pending.clear(); runtime.released = []; runtime.prepared = []; runtime.delay.clear()
  context.clearRect.mockClear(); context.drawImage.mockClear(); canvas.dataset = {}; canvas.parentElement.dataset = {}
  vi.stubGlobal('performance', { now: () => runtime.now })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++runtime.nextRaf; runtime.raf.set(id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => runtime.raf.delete(id))
})
afterEach(() => { effects.forEach(effect => effect.cleanup?.()); vi.unstubAllGlobals() })

describe('paged native playback keeps source clocks and visible ownership', () => {
  it('draws every source frame, releases at frame 48 and completes after the final frame with next-page warm-up', async () => {
    const onStart = vi.fn(), onCue = vi.fn(), onComplete = vi.fn(), onReady = vi.fn()
    render({ ...props, cueFrame: 48, onStart, onCue, onComplete, onReady })
    finishPage(0); await flush(); tick(0)
    for (let frame = 1; frame <= 96; frame++) { tick(frame * frameMs + 0.01); await flush() }
    const frames = context.drawImage.mock.calls.map(call => {
      const page = pages.find(entry => entry.src === call[0].src)!
      return page.firstFrame + call[2] / 576 * page.columns + call[1] / 576
    })
    expect(frames).toEqual(Array.from({ length: 96 }, (_, frame) => frame))
    expect(onStart).toHaveBeenCalledOnce(); expect(onReady).toHaveBeenCalledOnce(); expect(onCue).toHaveBeenCalledOnce(); expect(onComplete).toHaveBeenCalledOnce()
    expect(runtime.prepared).toEqual(pages.slice(1).map(page => page.src))
    expect(Number(canvas.dataset.spriteDecodedBytes)).toBeLessThanOrEqual(Number(canvas.dataset.spriteDecodedBudget))
  })

  it('keeps the last painted frame and freezes the native clock while a boundary page is late', async () => {
    runtime.delay.add(pages[1].src)
    const onComplete = vi.fn()
    render({ ...props, onComplete }); finishPage(0); await flush(); tick(0)
    tick(11 * frameMs + 0.01)
    expect(canvas.dataset.spriteFrame).toBe('11')
    context.clearRect.mockClear(); context.drawImage.mockClear()
    tick(12 * frameMs + 0.01); tick(4000)
    expect(context.clearRect).not.toHaveBeenCalled(); expect(context.drawImage).not.toHaveBeenCalled(); expect(onComplete).not.toHaveBeenCalled()
    finishPage(1); await flush(); tick(5000)
    expect(canvas.dataset.spriteFrame).toBe('12')
    expect(context.drawImage).toHaveBeenCalledOnce()
  })

  it('holds at reactionFrame minus one and paints the actual reaction only after impact', async () => {
    const onCue = vi.fn()
    render({ ...props, holdBeforeFrame: 32, cueFrame: 32, onCue }); finishPage(0); await flush(); tick(0)
    for (let frame = 1; frame <= 48; frame++) { tick(frame * frameMs + 0.01); await flush() }
    expect(canvas.dataset.spriteFrame).toBe('31'); expect(onCue).not.toHaveBeenCalled()
    render({ ...props, holdBeforeFrame: undefined, cueFrame: 32, onCue })
    expect(canvas.dataset.spriteFrame).toBe('32'); expect(onCue).toHaveBeenCalledOnce()
    tick(49 * frameMs); expect(Number(canvas.dataset.spriteFrame)).toBeLessThan(36)
  })

  it('loads only the final KO page for reduced motion and paints its final transparent frame', async () => {
    runtime.reduced = true
    const onReady = vi.fn()
    render({ ...props, startFrame: 95, frameCount: 1, paused: true, onReady })
    expect([...runtime.pending.keys()]).toEqual([pages[7].src])
    finishPage(7); await flush(); tick(0)
    expect(canvas.dataset.spriteFrame).toBe('95'); expect(onReady).toHaveBeenCalledOnce()
    expect(context.clearRect).toHaveBeenCalledOnce(); expect(context.drawImage).toHaveBeenCalledOnce()
    expect(runtime.prepared).toEqual([])
  })

  it('does not repaint duplicate frames at a refresh rate above the native fps', async () => {
    render({ ...props, loop: true }); finishPage(0); await flush(); tick(0)
    tick(8); tick(16); tick(24); tick(32)
    expect(context.drawImage).toHaveBeenCalledOnce()
    tick(frameMs + 0.01)
    expect(context.drawImage).toHaveBeenCalledTimes(2)
  })

  it('stops scheduling while paused and resumes its original clock without a jump', async () => {
    render({ ...props, loop: true }); finishPage(0); await flush(); tick(0); tick(frameMs + 0.01)
    render({ ...props, loop: true, paused: true }); tick(80)
    const painted = context.drawImage.mock.calls.length
    expect(runtime.raf.size).toBe(0)
    tick(5000)
    expect(context.drawImage).toHaveBeenCalledTimes(painted)
    render({ ...props, loop: true, paused: false }); tick(5080)
    expect(canvas.dataset.spriteFrame).toBe('1')
    tick(5080 + frameMs)
    expect(canvas.dataset.spriteFrame).toBe('2')
  })

  it('reports a missing page once and releases it without clearing the creature raster', async () => {
    const onError = vi.fn()
    render({ ...props, onError })
    runtime.pending.get(pages[0].src)!.reject(new Error('Missing')); await flush()
    tick(4000)
    expect(onError).toHaveBeenCalledOnce(); expect(runtime.released).toEqual([pages[0].src]); expect(context.clearRect).not.toHaveBeenCalled()
  })

  it('rejects stale loaded pixels after a creature identity is replaced', async () => {
    const onReady = vi.fn()
    render({ ...props, onReady })
    effects.forEach(effect => effect.cleanup?.()); effects = []; runtime.slots = []
    render({ ...props, src: '/new-creature.webp', pages: pages.map(page => ({ ...page, src: page.src.replace('page', 'new') })), onReady })
    finishPage(0); await flush(); tick(0)
    expect(onReady).not.toHaveBeenCalled(); expect(context.drawImage).not.toHaveBeenCalled()
  })
})
