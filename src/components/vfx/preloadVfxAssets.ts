import { assetUrl } from '@/utils/assetUrl'
import { getMossa, getPokemon } from '@data/index'
import {
  resolveMoveVfxAsset,
  resolveMoveVfxRecipe,
} from './resolveMoveVfxAsset'
import { getMoveVfxAsset } from './vfxManifest'
import type { MossaDef } from '@/types'
import type { MoveVfxAsset } from './types'
import { prepareImageAsset } from '@/utils/prepareImageAsset'
import { getGifRuntimeSrc } from './GifVfx'

const preloaded = new Set<string>()

function playbackSource(asset: MoveVfxAsset, effectId: number, replay: boolean): string {
  const src = assetUrl(asset.src)
  return !replay || asset.kind === 'sprite-sheet' ? src : getGifRuntimeSrc(src, effectId)
}

/** The exact URLs rendered by this event, including GIF replay cache keys. */
export function getMoveVfxPlaybackSources(move: MossaDef, effectId: number, replay = true): string[] {
  const recipe = resolveMoveVfxRecipe(move)
  if (!recipe) return [playbackSource(resolveMoveVfxAsset(move), effectId, replay)]
  return recipe.steps.flatMap((step, index) => {
    const asset = getMoveVfxAsset(step.assetId)
    return asset ? [playbackSource(asset, effectId * 100 + index, replay)] : []
  })
}

export async function prepareMoveVfxPlayback(move: MossaDef, effectId: number, replay = false): Promise<void> {
  // The GIF's unique replay URL is prepared at release, so its clock does not
  // run invisibly through the creature's wind-up while the base image loads.
  await Promise.all(getMoveVfxPlaybackSources(move, effectId, replay).map(prepareImageAsset))
}

export function preloadVfxAssets(assetIds: string[]) {
  if (typeof Image === 'undefined') return

  for (const assetId of assetIds) {
    const asset = getMoveVfxAsset(assetId)
    if (!asset || preloaded.has(asset.src)) continue
    preloaded.add(asset.src)
    const image = new Image()
    image.decoding = 'async'
    image.src = assetUrl(asset.src)
  }
}

export function preloadMoveVfxForPokemon(speciesIds: number[]) {
  const assetIds = new Set<string>()

  for (const speciesId of speciesIds) {
    const species = getPokemon(speciesId)
    if (!species) continue
    for (const moveId of species.mosse) {
      if (!moveId) continue
      const move = getMossa(moveId)
      if (!move) continue

      const recipe = resolveMoveVfxRecipe(move)
      if (recipe) {
        for (const step of recipe.steps) assetIds.add(step.assetId)
      } else {
        assetIds.add(resolveMoveVfxAsset(move).id)
      }
    }
  }

  preloadVfxAssets([...assetIds])
}
