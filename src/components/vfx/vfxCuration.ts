import type { MoveVfxAsset, VfxAnchor, VfxArchetype, VfxIntensity } from './types'
import movesetCatalog from '@/data/vfx-curation-runtime.json'

export const VFX_CURATION_CATEGORIES = [
  'physical',
  'slash',
  'impact',
  'beam',
  'fire',
  'water',
  'electric',
  'psychic',
  'dark',
  'heal',
  'buff',
  'debuff',
  'status',
  'aura',
  'screen',
  'supreme',
  'plant',
  'earth',
] as const

export type VfxCurationCategory = typeof VFX_CURATION_CATEGORIES[number]

export interface VfxCurationEntry {
  categories: readonly VfxCurationCategory[]
  priority?: 'candidate' | 'preferred' | 'special'
  reviewed?: boolean
  recommendation?: 'proposed' | 'reserve'
  intensity?: VfxIntensity
  // Explicit battle role: semantic tags alone cannot distinguish slash from blunt.
  battleArchetype?: VfxArchetype
  preview?: {
    anchor?: VfxAnchor
    scaleMultiplier?: number
  }
  notes?: string
}

// Reviewed selections and remaining candidates; reviewed entries are user-confirmed.
// Keep editorial metadata here: generatedVfxAssets.ts belongs to the asset pipeline.
const LEGACY_VFX_CURATION: Readonly<Partial<Record<string, VfxCurationEntry>>> = {
  // Second review round: proposals are preview-only until the user confirms them.
  'generated:highmountain-img_effect_mitra_aura_f_2-images_nested_sheet': {
    categories: ['fire', 'aura'],
    priority: 'candidate',
    recommendation: 'proposed',
    intensity: 'light',
    preview: { anchor: 'target', scaleMultiplier: 1.25 },
    notes: 'Proposta Fuoco leggero: piccola fiamma verticale, sul bersaglio a 1.25×. Verificare la leggibilità della coda breve.',
  },
  'generated:basiceff-img_cannonjump-images_nested_sheet': {
    categories: ['fire', 'impact'],
    priority: 'candidate',
    recommendation: 'proposed',
    intensity: 'medium',
    preview: { anchor: 'target', scaleMultiplier: 1.25 },
    notes: 'Proposta Fuoco medio: esplosione verticale arancione, sul bersaglio a 1.25×. Animazione rapida (292 ms).',
  },
  'generated:highmountain-img_effect_mitra_aura_f_0-images_nested_sheet': {
    categories: ['fire', 'impact'],
    priority: 'candidate',
    recommendation: 'proposed',
    intensity: 'heavy',
    preview: { anchor: 'target', scaleMultiplier: 1.25 },
    notes: 'Proposta Fuoco forte: esplosione ampia con fiamme residue, sul bersaglio a 1.25×. Da confrontare con CannonJump.',
  },
  'gif:59ad165cefdf8a14f3b4e35ad7e8e8a8': {
    categories: ['water'],
    priority: 'candidate',
    recommendation: 'proposed',
    intensity: 'medium',
    preview: { anchor: 'target', scaleMultiplier: 1.25 },
    notes: 'Proposta Acqua medio: vortice circolare azzurro, sul bersaglio a 1.25×. Il fondo nero usa screen.',
  },
  'gif:shark-kick-effect': {
    categories: ['water', 'slash'],
    priority: 'candidate',
    recommendation: 'proposed',
    intensity: 'heavy',
    preview: { anchor: 'target', scaleMultiplier: 1.25 },
    notes: 'Proposta Acqua forte: ampio arco acquatico con spruzzi e sagome di pinne, sul bersaglio a 1.25×. Valutare se riservarlo ai tagli Acqua. Fondo nero gestito con screen.',
  },
  'generated:anglercompany-img_finalboss_minitail_hit-images_flat_sheet': {
    battleArchetype: 'psychic',
    categories: ['psychic', 'impact'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'light',
    preview: { anchor: 'target', scaleMultiplier: 1.25 },
    notes: 'Confermato per mosse Psico leggere: sul bersaglio, zoom 1.25×.',
  },
  'generated:basiceff-img_tjrjump-images_nested_sheet': {
    battleArchetype: 'blunt',
    categories: ['physical', 'impact'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'light',
    preview: { anchor: 'target', scaleMultiplier: 1 },
    notes: 'Confermato per impatti fisici leggeri: sul bersaglio, zoom 1×.',
  },
  'gif:27c650209255d638948a6215ffea9c78': {
    battleArchetype: 'slash',
    categories: ['slash', 'physical'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'medium',
    preview: { anchor: 'target', scaleMultiplier: 1.25 },
    notes: 'Confermato per Slash medi: tre artigli sul bersaglio, zoom 1.25×. Fondo nero gestito con screen.',
  },
  'generated:anglercompany-img_ladderpuzzle_shock-images_nested_sheet': {
    battleArchetype: 'psychic',
    categories: ['psychic', 'impact'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'heavy',
    preview: { anchor: 'center', scaleMultiplier: 1.5 },
    notes: 'Confermato per mosse Psico forti: allineamento centrale, zoom 1.5×.',
  },
  'generated:anglercompany-img_subboss_chargedcannon_blue_hit-images_nested_sheet': {
    battleArchetype: 'electric',
    categories: ['electric', 'impact'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'light',
    preview: { anchor: 'target', scaleMultiplier: 1.25 },
    notes: 'Confermato per mosse Elettro leggere: sul bersaglio, zoom 1.25×.',
  },
  'generated:anglercompany-img_subboss_chargedcannon_red_hit-images_nested_sheet': {
    categories: ['beam', 'fire', 'impact'],
    priority: 'candidate',
  },
  'generated:anglercompany-img_subboss_railcannon_discharge-images_nested_sheet': {
    categories: ['beam'],
    priority: 'preferred',
  },
  'generated:anglercompany-img_subboss_railcannon_hit-images_nested_sheet': {
    categories: ['impact', 'beam'],
    priority: 'candidate',
  },
  'generated:basiceff-img_itemlevelup-images_nested_sheet': {
    categories: ['buff', 'aura'],
    priority: 'candidate',
    recommendation: 'reserve',
    notes: 'Riserva UI: contiene la scritta LEVEL UP, non adatto a una mossa generica.',
  },
  'generated:basiceff-img_psychicworkupward-images_nested_sheet': {
    categories: ['psychic', 'aura'],
    priority: 'candidate',
  },
  'generated:championraid-img_stackdebuff_acid_pre-images_nested_sheet': {
    categories: ['debuff', 'status'],
    priority: 'candidate',
  },
  'generated:championraid-img_stackdebuff_flame_pre-images_nested_sheet': {
    categories: ['fire', 'debuff', 'status'],
    priority: 'candidate',
  },
  'generated:championraid-img_stackdebuff_frozen_pre-images_nested_sheet': {
    categories: ['water', 'debuff', 'status'],
    priority: 'candidate',
  },
  'generated:debuffeffect-img_dropbloodingcurse_end-images_nested_sheet': {
    categories: ['dark', 'debuff'],
    priority: 'candidate',
  },
  'generated:direction-img_effect_skill_spark_0-images_nested_sheet': {
    battleArchetype: 'electric',
    categories: ['electric', 'impact'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'medium',
    preview: { anchor: 'target', scaleMultiplier: 1.5 },
    notes: 'Confermato per mosse Elettro medie: sul bersaglio, zoom 1.5×.',
  },
  'generated:direction1-img_effect_skill_overswingdouble_0-images_nested_sheet': {
    battleArchetype: 'slash',
    categories: ['slash', 'physical'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'light',
    preview: { anchor: 'target', scaleMultiplier: 1 },
    notes: 'Confermato per Slash leggeri: doppio arco sul bersaglio, zoom 1×.',
  },
  'generated:fieldgimmickeff-img_thunder-images_nested_sheet': {
    categories: ['electric'],
    priority: 'preferred',
    recommendation: 'reserve',
    notes: 'Alternativa: fulmine stretto con nuvola e detriti. Meno neutro dei tre Elettro selezionati.',
  },
  'generated:hekatoneff_1001-img_explosion-images_nested_sheet': {
    battleArchetype: 'psychic',
    categories: ['psychic', 'impact'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'medium',
    preview: { anchor: 'target', scaleMultiplier: 1.25 },
    notes: 'Confermato per mosse Psico medie: sul bersaglio, zoom 1.25×.',
  },
  'generated:hekatoneff_1011-img_hit-images_nested_sheet': {
    categories: ['psychic', 'aura'],
    priority: 'candidate',
    recommendation: 'reserve',
    notes: 'Portale con sagoma scura: riservare a evocazioni, non a impatti fisici generici.',
  },
  'generated:highmountain-img_effect_tynus_lightning_2-images_nested_sheet': {
    battleArchetype: 'electric',
    categories: ['electric', 'impact'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'heavy',
    preview: { anchor: 'target', scaleMultiplier: 1.5 },
    notes: 'Confermato per mosse Elettro forti: sul bersaglio, zoom 1.5×.',
  },
  'generated:lynn-img_skill_heal_effect-images_nested_sheet': {
    categories: ['heal', 'aura'],
    priority: 'candidate',
    recommendation: 'proposed',
    intensity: 'medium',
    preview: { anchor: 'self', scaleMultiplier: 1 },
    notes: 'Proposta cura ampia: vegetazione e luce verde sull’utilizzatore, zoom 1×. Valutare se adatta a tutte le cure o solo a quelle Erba.',
  },
  'generated:lynn-img_skill_heal_specialaffected-images_nested_sheet': {
    categories: ['heal', 'buff'],
    priority: 'candidate',
    recommendation: 'proposed',
    intensity: 'light',
    preview: { anchor: 'self', scaleMultiplier: 1.25 },
    notes: 'Proposta cura leggera: scie verdi sottili sull’utilizzatore, zoom 1.25×. Alternativa breve e meno vegetale a Heal Effect.',
  },
  'generated:lynn-img_skill_hithard_hit-images_nested_sheet': {
    battleArchetype: 'blunt',
    categories: ['impact', 'physical'],
    priority: 'preferred',
    reviewed: true,
    intensity: 'medium',
    preview: { anchor: 'target', scaleMultiplier: 1 },
    notes: 'Confermato per impatti fisici medi: sul bersaglio, zoom 1×.',
  },
  'generated:lynn-img_skill_sneakattackhit-images_nested_sheet': {
    categories: ['dark', 'impact'],
    priority: 'candidate',
    recommendation: 'reserve',
    notes: 'Impatto nero, viola e verde; conservare per Oscurità, non come taglio neutro.',
  },
  'generated:mobeff-img_apcrevive_0-images_nested_sheet': {
    categories: ['heal', 'buff'],
    priority: 'candidate',
  },
  'generated:onusereff-img_eventeffect_watersmash1-images_nested_sheet': {
    categories: ['water', 'impact'],
    priority: 'candidate',
    recommendation: 'proposed',
    intensity: 'light',
    preview: { anchor: 'target', scaleMultiplier: 1.5 },
    notes: 'Proposta Acqua leggero: piccolo impatto azzurro con gocce, sul bersaglio a 1.5×. La sorgente è compatta (130 × 114).',
  },
  'generated:basiceff-img_jobchangedkain-images_nested_sheet': {
    categories: ['aura', 'supreme'],
    priority: 'special',
    notes: 'Effetto lungo: usare solo per mosse Supreme/cinematiche.',
  },
  'generated:elitemobeff-img_grandisindividualelitebosseffect-images_nested_sheet': {
    categories: ['screen', 'supreme'],
    priority: 'special',
  },
  'generated:highmountain-img_effect_fevertime-images_nested_sheet': {
    categories: ['screen', 'supreme'],
    priority: 'special',
  },
}

// The new sheets have passed asset review; their in-game calibration is still a
// proposal. reviewed=true remains reserved for choices confirmed by the user.
const MOVESET_VFX_CURATION: Record<string, VfxCurationEntry> = Object.fromEntries(
  movesetCatalog.assets.map((entry) => [entry.id, {
    categories: entry.categories as VfxCurationCategory[],
    priority: 'candidate' as const,
    recommendation: 'proposed' as const,
    intensity: entry.intensity as VfxIntensity,
    preview: { anchor: entry.anchor as VfxAnchor, scaleMultiplier: 1 },
    notes: movesetCatalog.notes[entry.noteIndex],
  }])
)

export const VFX_CURATION: Readonly<Partial<Record<string, VfxCurationEntry>>> = {
  ...LEGACY_VFX_CURATION,
  ...MOVESET_VFX_CURATION,
}

export function getVfxCuration(assetId: string): VfxCurationEntry | undefined {
  return Object.prototype.hasOwnProperty.call(VFX_CURATION, assetId)
    ? VFX_CURATION[assetId]
    : undefined
}

export function getVfxReviewLabel(entry: VfxCurationEntry | undefined): string {
  if (entry?.reviewed) return 'Confermato'
  if (entry?.recommendation === 'proposed') return 'Proposta'
  if (entry?.recommendation === 'reserve') return 'Riserva'
  return 'Da valutare'
}

// Only explicitly assigned, confirmed effects can replace a battle fallback.
export function getCuratedBattleAssetId(
  archetype: VfxArchetype,
  intensity: VfxIntensity
): string | undefined {
  return Object.entries(VFX_CURATION).find(([, entry]) =>
    entry?.reviewed && entry.priority === 'preferred'
    && entry.battleArchetype === archetype && entry.intensity === intensity
  )?.[0]
}

// Apply saved visual decisions without mutating the generated manifest.
// Explicit Lab controls replace saved values, so choosing 1.5× never applies it twice.
export function getVfxCurationPreviewAsset(
  asset: MoveVfxAsset,
  { anchor = 'default', scale = 'default' }: {
    anchor?: VfxAnchor | 'default'
    scale?: number | 'default'
  } = {}
): MoveVfxAsset {
  const preview = getVfxCuration(asset.id)?.preview
  return {
    ...asset,
    anchor: anchor === 'default' ? preview?.anchor ?? asset.anchor : anchor,
    scale: (asset.scale ?? 1) * (scale === 'default' ? preview?.scaleMultiplier ?? 1 : scale),
  }
}

export function filterVfxAssetIds(
  assets: Readonly<Record<string, MoveVfxAsset>>,
  { search = '', category = 'all', curatedOnly = false, recommendedOnly = false }: {
    search?: string
    category?: VfxCurationCategory | 'all'
    curatedOnly?: boolean
    recommendedOnly?: boolean
  } = {}
): string[] {
  const query = search.trim().toLowerCase()

  return Object.keys(assets).filter((assetId) => {
    const asset = assets[assetId]
    const curation = getVfxCuration(assetId)

    // All entries are shortlisted, including preferred and special effects.
    if (curatedOnly && !curation) return false
    if (recommendedOnly && !curation?.reviewed && curation?.recommendation !== 'proposed') return false
    if (category !== 'all' && !curation?.categories.includes(category)) return false

    return !query || [assetId, asset.label, asset.kind, ...(curation?.categories ?? [])]
      .some((value) => value.toLowerCase().includes(query))
  })
}
