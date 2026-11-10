import metadata from './portraitMetadata.json'

export interface PortraitSourceGeometry {
  width: number
  height: number
  alphaBounds: readonly number[]
}

const sources: Record<string, PortraitSourceGeometry> = metadata

/** Frame the complete opaque artwork, excluding only unused transparent padding. */
export function getPortraitFraming(source: string) {
  const geometry = sources[source] ?? { width: 512, height: 512, alphaBounds: [0, 0, 512, 512] }
  const [left, top, right, bottom] = geometry.alphaBounds
  const size = Math.max(right - left, bottom - top) * 1.16
  const x = (left + right - size) / 2
  const y = (top + bottom - size) / 2
  return { width: geometry.width, height: geometry.height, viewBox: `${x} ${y} ${size} ${size}` }
}
