import playerTemplate from './templates/hp-bar.svg?raw'
import enemyTemplate from './templates/hp-bar-enemy.svg?raw'
import type { UiFit, UiRect } from './types'

const templates: Record<string, string> = {
  '/ui/studio/Comuni/hp-bar.svg': playerTemplate,
  '/ui/studio/Comuni/hp-bar-enemy.svg': enemyTemplate,
}
const cached = new Map<string, string>()

/** Known HP artwork has a static sample level and track; the live widget owns both. */
export function hpAssetSkin(source: string): string | undefined {
  if (!templates[source]) return undefined
  if (!cached.has(source)) {
    const svg = templates[source]
      .replace('width="100%" height="100%"', 'width="1020" height="220" preserveAspectRatio="none"')
      .replace(/fill="url\(#(?:subBarCore5|subFillGreenGrey7)\)"/g, 'fill="#0f172a"')
      .replace(/<text\b[^>]*>Lv\. 10<\/text>/g, '')
      .replace('<svg ', `<svg data-ui-template-source="${source}" `)
    cached.set(source, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  }
  return cached.get(source)
}

/** Coordinates of the painted template within the selected element, in percent. */
export function hpAssetArea(width: number, height: number, fit: UiFit = 'contain'): UiRect {
  if (fit === 'fill' || width <= 0 || height <= 0) return { x: 0, y: 0, w: 100, h: 100 }
  const scale = (fit === 'cover' ? Math.max : Math.min)(width / 1020, height / 220)
  const w = 1020 * scale / width * 100, h = 220 * scale / height * 100
  return { x: (100 - w) / 2, y: (100 - h) / 2, w, h }
}
