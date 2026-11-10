import type { Locator } from '@playwright/test'
export interface SplashBounds { left: number; top: number; right: number; bottom: number }

export async function splashGeometry(root: Locator, screen: 'squadra' | 'arkadex', normalized: SplashBounds) {
  return root.evaluate(async (element, { screen, normalized }) => {
    const box = (target: Element) => {
      const rect = target.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }
    }
    const desktopBackdrop = element.querySelector('.pu-splash-backdrop') ?? element
    const card = getComputedStyle(desktopBackdrop).display === 'none'
    const backdrop = card ? element.querySelector('.pu-splash-hero-presence')! : desktopBackdrop
    const shell = box(element), computed = getComputedStyle(backdrop), background = card ? computed : getComputedStyle(backdrop, '::before'), duplicate = getComputedStyle(backdrop, '::after')
    const backdropBox=box(backdrop)
    const source = element.querySelector('[data-splash-source]')?.getAttribute('data-splash-source')
    if (!source) throw new Error('Decoded splash source is absent from the selected hero')
    const image = new Image()
    image.src = source
    await image.decode()
    const paint = {
      x: backdropBox.x + parseFloat(computed.borderLeftWidth || '0') + (card ? 0 : parseFloat(background.left) || 0),
      y: backdropBox.y + parseFloat(computed.borderTopWidth || '0') + (card ? 0 : parseFloat(background.top) || 0),
      width: parseFloat(background.width) || element.clientWidth,
      height: parseFloat(background.height) || element.clientHeight,
    }
    const scale = background.backgroundSize === 'contain' ? Math.min(paint.width / image.naturalWidth, paint.height / image.naturalHeight) : Math.max(paint.width / image.naturalWidth, paint.height / image.naturalHeight)
    const renderedWidth = image.naturalWidth * scale, renderedHeight = image.naturalHeight * scale
    const position = background.backgroundPosition.split(/\s+/)
    const offset = (value: string, free: number) => value.endsWith('%') ? free * parseFloat(value) / 100 : value === 'center' ? free / 2 : parseFloat(value) || 0
    const startX = paint.x + offset(position[0], paint.width - renderedWidth)
    const startY = paint.y + offset(position[1] || position[0], paint.height - renderedHeight)
    const paintedImage = { x: startX, y: startY, width: renderedWidth, height: renderedHeight, right: startX + renderedWidth, bottom: startY + renderedHeight }
    const transform = new DOMMatrix(background.transform === 'none' ? undefined : background.transform)
    const centerX=paint.x+paint.width/2,centerY=paint.y+paint.height/2
    const projectedX=(fraction:number)=>centerX+(startX+fraction*renderedWidth-centerX)*transform.a+transform.e
    const projectedY=(fraction:number)=>centerY+(startY+fraction*renderedHeight-centerY)*transform.d+transform.f
    const creature = {
      x: projectedX(normalized.left), y: projectedY(normalized.top),
      right: projectedX(normalized.right), bottom: projectedY(normalized.bottom),
      width: (normalized.right - normalized.left) * renderedWidth * transform.a, height: (normalized.bottom - normalized.top) * renderedHeight * transform.d,
    }
    const selectors = screen === 'squadra'
      ? ['.pu-reference-roster', '.pu-reference-team-dossier', '.pu-screen-heading', '.pu-team-cap', '.pu-topbar', '.pu-nav', '.pu-footer', '.pu-reference-hero-title', '.pu-team-screen .pu-hero-caption', '.pu-reference-hero-caption']
      : ['.pu-dex-index', '.pu-dex-detail', '.pu-screen-toolbar', '.pu-topbar', '.pu-nav', '.pu-footer', '.pu-dex-hero .pu-hero-caption', '.pu-animation-toggle']
    const panels = selectors.flatMap(selector => [...element.querySelectorAll(selector)].filter(target => {
      const rect = target.getBoundingClientRect(), style = getComputedStyle(target)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    }).map(target => {
      const panel = box(target)
      const overlap = { width: Math.max(0, Math.min(creature.right, panel.right) - Math.max(creature.x, panel.x)), height: Math.max(0, Math.min(creature.bottom, panel.bottom) - Math.max(creature.y, panel.y)) }
      return { selector, ...panel, overlap }
    }))
    const content = element.querySelector('.pu-content')!
    const information = element.querySelector(screen === 'squadra' ? '.pu-reference-team-dossier' : '.pu-dex-detail')!
    return {
      source, normalized, image: { width: image.naturalWidth, height: image.naturalHeight }, shell, paint, paintedImage, creature, panels,
      background: { presentation: card ? 'card' : 'backdrop', image: background.backgroundImage, size: background.backgroundSize, position: background.backgroundPosition, opacity: background.opacity, transform: background.transform, filter: background.filter, mask: background.maskImage, duplicateContent: duplicate.content, duplicateImage: duplicate.backgroundImage },
      layout: { rootClientWidth: element.clientWidth, rootScrollWidth: element.scrollWidth, contentClientHeight: content.clientHeight, contentScrollHeight: content.scrollHeight, contentClientWidth: content.clientWidth, contentScrollWidth: content.scrollWidth },
      information: [...information.querySelectorAll('h2,dt,dd,[role="tab"],.pu-dex-detail-tabs button')].filter(target => target.getBoundingClientRect().height > 0).map(target => {
        const style = getComputedStyle(target)
        return { text: target.textContent?.trim(), fontSize: parseFloat(style.fontSize), color: style.color, opacity: Number(style.opacity), bounds: box(target) }
      }),
    }
  }, { screen, normalized })
}
