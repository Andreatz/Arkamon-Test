/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Tiny generated build constant; the full game and asset catalogs stay out of assetUrl. */
  readonly VITE_LOCAL_FRONT_SPRITE_IDS: readonly number[]
}

declare module 'virtual:arkamon-runtime-pages' {
  type PackedNativePage = [fileToken: string, frameCount: number, columns: number]
  /** Comma-separated legacy tokens, or ! followed by eight-byte hashes in base64url. */
  type PackedNativeGrid = [capacity: number, columns: number, fileTokens: string]
  export type PackedNativeClip = [frameWidth: number, frameHeight: number, frameCount: number, fps: number, pages: PackedNativePage[] | PackedNativeGrid]
  export type PackedNativeUniformView = [grid: [frameWidth: number, frameHeight: number, frameCount: number, fps: number, capacity: number, columns: number], fileTokens: string]
  type PackedNativeView = (PackedNativeClip | null)[] | PackedNativeUniformView
  const sets: Record<string, [front: PackedNativeView | null, back?: PackedNativeView | null] | undefined>
  export default sets
}
