import packed from 'virtual:arkamon-runtime-pages'
import type { PackedNativeClip, PackedNativeUniformView } from 'virtual:arkamon-runtime-pages'
import type { SpritePage } from '@/components/vfx/spritePages'

export interface NativeRuntimeClip {
  frameWidth: number
  frameHeight: number
  frameCount: number
  fps: number
  pages: readonly SpritePage[]
}
const clips = new Map<string, NativeRuntimeClip>()

function pageTokens(value: string): string[] {
  if (!value.startsWith('!')) return value.split(',')
  const bytes = atob(value.slice(1).replace(/-/g, '+').replace(/_/g, '/'))
  const tokens: string[] = []
  for (let start = 0; start < bytes.length; start += 8) {
    let token = ''
    for (let index = start; index < start + 8; index++) token += bytes.charCodeAt(index).toString(16).padStart(2, '0')
    tokens.push(token)
  }
  return tokens
}

/**
 * Lazy allocation, synchronous selection: a pending request can never select a
 * legacy full atlas. Each clip is expanded once from the small bundled index.
 */
export function getNativeRuntimeClip(source: string): NativeRuntimeClip | undefined {
  const cached = clips.get(source)
  if (cached) return cached
  const identity = /^\/sprites\/arkamon\/(\d+)\/(front|back)\/(idle|attack|hit|victory|ko)\.webp$/.exec(source)
  if (!identity) return undefined
  const actionIndex = ['idle', 'attack', 'hit', 'victory', 'ko'].indexOf(identity[3])
  const view = packed[identity[1]]?.[identity[2] === 'front' ? 0 : 1]
  if (!view) return undefined
  let entry: PackedNativeClip | null | undefined
  if (typeof view[1] === 'string') {
    const [grid, tokens] = view as PackedNativeUniformView
    const [width, height, count, fps, capacity, columns] = grid
    const length = Math.ceil(count / capacity)
    const selected = pageTokens(tokens).slice(actionIndex * length, (actionIndex + 1) * length)
    entry = [width, height, count, fps, [capacity, columns, selected.join(',')]]
  } else entry = (view as (PackedNativeClip | null)[])[actionIndex]
  if (!entry) return undefined
  const [frameWidth, frameHeight, frameCount, fps, pageData] = entry
  const packedPages = typeof pageData[0] === 'number'
    ? pageTokens((pageData as [number, number, string])[2]).map((token, index) => {
      const [capacity, columns] = pageData as [number, number, string]
      return [token, Math.min(capacity, frameCount - index * capacity), columns] as [string, number, number]
    })
    : pageData as [string, number, number][]
  const directory = source.replace('/sprites/arkamon/', '/sprites/arkamon-paged/').replace(/\.webp$/, '/')
  let nextFrame = 0
  const pages = packedPages.map(([token, count, columns], index) => {
    const png = token.endsWith('.png'), hash = png ? token.slice(0, -4) : token
    const file = `page-${String(index).padStart(2, '0')}${hash ? '-' + hash : ''}.${png ? 'png' : 'webp'}`
    const rows = Math.ceil(count / columns), width = columns * frameWidth, height = rows * frameHeight
    const firstFrame = nextFrame
    nextFrame += count
    return { src: directory + file, firstFrame, frameCount: count, columns, rows, width, height, decodedBytes: width * height * 4 }
  })
  const clip = { frameWidth, frameHeight, frameCount, fps, pages }
  clips.set(source, clip)
  return clip
}
