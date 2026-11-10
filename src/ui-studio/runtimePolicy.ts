import type { UiDesignDocument, UiScreenDesign } from './types'

/** Norwester is already declared by the product; an untouched document is a no-op. */
export function hasRuntimeDesign(design: UiDesignDocument): boolean {
  if (Object.values(design.screens).some(screen => !!screen.background || !!screen.typography || requiresElementPass(screen))) return true
  return Object.values(design.typography).some(font => Object.entries(font).some(([key, value]) => value !== undefined && !(key === 'family' && value === 'norwester')))
}
export function requiresElementPass(screen?: UiScreenDesign): boolean {
  return !!screen && (Object.keys(screen.elements).length > 0 || screen.layers.length > 0)
}
