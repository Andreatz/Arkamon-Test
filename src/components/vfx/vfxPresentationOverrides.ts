import type { MoveVfxAsset } from './types'

// These GIFs advertise alpha but retain an opaque dark backdrop in their frames.
// Preserve the source files and apply an explicit presentation correction.
export const VFX_PRESENTATION_OVERRIDES: Readonly<Record<string, Pick<MoveVfxAsset, 'blendMode'>>> = {
  'gif:a1becbd5b329954a2063f352beceef35': { blendMode: 'screen' },
  'gif:dmitry-sarkisov-ezgif-3-f01075eaae7b': { blendMode: 'screen' },
  'gif:ea2cac5105a57c00c4385321a5d36392': { blendMode: 'screen' },
  'gif:original-b289dc8f58de9dc37b042e9896d81b41': { blendMode: 'screen' },
}

export function applyVfxPresentationOverride(asset: MoveVfxAsset): MoveVfxAsset {
  const override = VFX_PRESENTATION_OVERRIDES[asset.id]
  return override ? { ...asset, ...override } : asset
}
