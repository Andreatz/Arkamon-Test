/** A layout wrapper is not necessarily the element that paints the widget. */
export function uiAssetSurface(element: HTMLElement | SVGElement): HTMLElement | SVGElement {
  const frame = element.querySelector<HTMLElement>(':scope>.pu-frame,:scope>.game-button-frame')
  if (frame) return frame
  if (element.matches('[data-ui-asset-surface],img,svg,.pu-kit-icon')) return element
  const surfaces = element.querySelectorAll<HTMLElement>(':scope>[data-ui-asset-surface]')
  if (surfaces.length === 1) return surfaces[0]
  // Follow transparent layout wrappers only. Never pick one of several independent controls.
  const children = [...element.children].filter(child => !child.matches('[data-ui-runtime-owned]'))
  if (children.length === 1 && children[0] instanceof HTMLElement) {
    const child = children[0]
    if (child.matches('[data-ui-asset-surface],.pu-kit-icon') || child.querySelector(':scope>.pu-frame,:scope>.game-button-frame')) return uiAssetSurface(child)
  }
  return element
}
