import { assetUrl } from '@/utils/assetUrl'
import { prepareImageAsset } from '@/utils/prepareImageAsset'
import { getArkamonAnimationAsset, getArkamonRuntimeAsset, type ArkamonBattleAnimation, type ArkamonSpriteSide } from './arkamonAnimationManifest'
import { nativeSpritePageCache } from '@/utils/spritePageCache'

export function prepareArkamonAnimationPlayback(
  speciesId: number,
  side: ArkamonSpriteSide,
  animation: ArkamonBattleAnimation,
): Promise<void> {
  const asset = getArkamonAnimationAsset(speciesId, side, animation)
  if (!asset) return Promise.resolve()
  const runtime = getArkamonRuntimeAsset(asset)
  return runtime.pages?.length ? nativeSpritePageCache.prepare(runtime.pages[0]) : prepareImageAsset(assetUrl(asset.src))
}
