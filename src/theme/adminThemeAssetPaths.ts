import { isSafeUiAssetSource } from '@/ui-studio/designModel'

/** Legacy theme slots resolve public files; imported UI media uses its own resolver. */
export function isSafeThemeAssetPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && isSafeUiAssetSource(value)
}
