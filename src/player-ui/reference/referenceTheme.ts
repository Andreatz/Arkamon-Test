import { MENU_SVG_ARTWORK_ENABLED } from '../uiAppearancePolicy'

/** One coherent direction from the supplied references; old concepts remain explicit previews. */
export function isReferenceUi(): boolean {
  if (MENU_SVG_ARTWORK_ENABLED) return false
  if (typeof window === 'undefined') return true
  const concept = new URLSearchParams(window.location.search).get('uiConcept')
  return !concept || concept === 'aurora'
}
