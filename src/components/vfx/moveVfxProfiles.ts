import type { MossaDef, TipoPokemon } from '@/types'
import type { MoveVfxAssetId } from './vfxManifest'
import { getCuratedBattleAssetId } from './vfxCuration'
import { getMoveVfxAssignment } from './moveVfxAssignments'
import type {
  MoveVfxFeedback,
  MoveVfxProfile,
  VfxArchetype,
  VfxIntensity,
  VfxProfileSource,
} from './types'

type NameRule = {
  archetype: VfxArchetype
  pattern: RegExp
  intensity?: VfxIntensity
}

const FEEDBACK: Record<VfxIntensity, MoveVfxFeedback> = {
  subtle: {
    targetShakePx: 0,
    targetShakeMs: 0,
    targetFlashMs: 90,
    cameraShakePx: 0,
    cameraShakeMs: 0,
    hitStopMs: 0,
  },
  light: {
    targetShakePx: 4,
    targetShakeMs: 170,
    targetFlashMs: 90,
    cameraShakePx: 1,
    cameraShakeMs: 140,
    hitStopMs: 20,
  },
  medium: {
    targetShakePx: 8,
    targetShakeMs: 260,
    targetFlashMs: 120,
    cameraShakePx: 3,
    cameraShakeMs: 210,
    hitStopMs: 45,
  },
  heavy: {
    targetShakePx: 12,
    targetShakeMs: 360,
    targetFlashMs: 170,
    cameraShakePx: 6,
    cameraShakeMs: 300,
    hitStopMs: 75,
  },
}

const EXPLICIT_ARCHETYPE_BY_MOVE_ID: Partial<
  Record<number, { archetype: VfxArchetype; intensity?: VfxIntensity }>
> = {
  1: { archetype: 'beam', intensity: 'light' },
  // Initial visual tiers for the curated families; these do not affect damage.
  6: { archetype: 'electric', intensity: 'heavy' },
  29: { archetype: 'blunt', intensity: 'light' },
  37: { archetype: 'fire', intensity: 'medium' },
  38: { archetype: 'electric', intensity: 'light' },
  42: { archetype: 'plant', intensity: 'medium' },
  44: { archetype: 'psychic', intensity: 'heavy' },
  70: { archetype: 'slash', intensity: 'light' },
  101: { archetype: 'aura', intensity: 'light' },
  118: { archetype: 'psychic', intensity: 'light' },
  119: { archetype: 'psychic', intensity: 'medium' },
  126: { archetype: 'storm', intensity: 'light' },
  130: { archetype: 'slash', intensity: 'medium' },
  162: { archetype: 'plant', intensity: 'medium' },
  180: { archetype: 'slash', intensity: 'light' },
  181: { archetype: 'slash', intensity: 'medium' },
  190: { archetype: 'plant', intensity: 'light' },
  200: { archetype: 'storm', intensity: 'medium' },
}

const NAME_RULES: NameRule[] = [
  { archetype: 'slash', pattern: /taglio|lama|artig|fendente|squarcio|falcid|sferz|zampata|spazzata/, intensity: 'medium' },
  { archetype: 'bite', pattern: /fauci|morso|divor|morsa|predigest|leccata/, intensity: 'medium' },
  { archetype: 'charge', pattern: /assalto|carica|scatto|sprint|corsa|avanzata|arrembaggio|picchiata|scontro|sbattimuso|testata|zoccolata|salto|emersione|affondare|immersione|agguato|avanguardia|marcia|passo furtivo|volo furtivo/, intensity: 'medium' },
  { archetype: 'beam', pattern: /soffio|alito|sbuffo|laser|cannone|dardo|scarica pulsar|boro breath|getto del peso|lancio di libri|bombardamento/, intensity: 'medium' },
  { archetype: 'storm', pattern: /tempesta|tormenta|temporale|stormo|pioggia|maremoto|alluvione|valanga|tornado|turbinio|vortice|sciame|maestrale|bora|polverone/, intensity: 'heavy' },
  { archetype: 'wave', pattern: /onda|marea|spruzzo|spruzzata|cascata|spirale|cerchio ondoso|idroscarica|fangospruzzo/, intensity: 'medium' },
  { archetype: 'eruption', pattern: /cratere|detonazione|fornace|lapillo|roccia fusa|sotterr|sepolt|baratro|canyon|movimento continentale|battito terrestre|scossa d'assestamento/, intensity: 'heavy' },
  { archetype: 'aura', pattern: /aura|mantello|presenza|pressione spirituale|fioritura|gemma|sfolgorio|pulviscolo|fumo|fiammella|cerino|braciere|fiamma nera|fiamma celestiale|fiamma sotterranea|fiamma futuristica|scintilla lunare|ombra rossa|luna rossa|luna storta|materia oscura|buio pesto|abisso tenebroso|piaga|eclissi|lana magica/, intensity: 'light' },
  { archetype: 'psychic', pattern: /mentale|psich|psion|mente|illus|visione|occhio|sesto senso|paradosso|angoscia|terrore|spavento|sguardo|sussurro|conoscenza|area 51|viaggio temporale|ritorno al futuro|ordine|cucu|controllo|collasso nervoso|assorbianima|gufata|jumpscare|penna arcobaleno|ali elusive/, intensity: 'medium' },
  { archetype: 'blunt', pattern: /pugno|colpo|impatto|legnata|lotta|ruggito|ringhio|urlo|spauracchio|rivolta|guerriglia|scontro colossale/, intensity: 'medium' },
  { archetype: 'plant', pattern: /foglia|liana|germogl|bosco|silvano|fiori|florilegio|erboso|cespuglio|ciuffo verde|radic|natura|smeraldina|fienile|contadino|rugiada|brezza profumata|trappola saltellante|abbraccio traballante/, intensity: 'light' },
  { archetype: 'fire', pattern: /fuoco|fiamma|brace|bruci|ardent|incandescent|magmatic|lavic|fuliggine|carbone|surriscald|scottatura|incendio|cerino|fornace|ardemonio/, intensity: 'medium' },
  { archetype: 'electric', pattern: /fulmin|tuono|tensione|voltaggio|elettro|scossa|lampo|conduttore|circuito|magnetica|ionizz|scintill/, intensity: 'medium' },
  { archetype: 'water', pattern: /acqua|idr|umid|fradicio|fondali|nevischio|glaciale|ghiacci|fredda|rugiada|abissi|nuotata/, intensity: 'medium' },
  { archetype: 'dark', pattern: /ombra|tenebr|oscura|crepuscolo|inquiet|sangue|funerale|cimitero|custode|guardiano/, intensity: 'medium' },
]

const TYPE_FALLBACK: Record<TipoPokemon, VfxArchetype> = {
  Fuoco: 'fire',
  Acqua: 'water',
  Erba: 'plant',
  Elettro: 'electric',
  Terra: 'eruption',
  Psico: 'psychic',
  Oscurità: 'dark',
  Normale: 'blunt',
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function defaultIntensity(archetype: VfxArchetype): VfxIntensity {
  if (archetype === 'supreme' || archetype === 'storm' || archetype === 'eruption') return 'heavy'
  if (archetype === 'heal' || archetype === 'status' || archetype === 'aura' || archetype === 'plant') return 'light'
  return 'medium'
}

function buildProfile(
  archetype: VfxArchetype,
  source: VfxProfileSource,
  intensity = defaultIntensity(archetype)
): MoveVfxProfile {
  return {
    archetype,
    intensity,
    source,
    feedback: FEEDBACK[intensity],
  }
}

function inferMoveVfxProfile(move: MossaDef): MoveVfxProfile {
  if (move.effetto === 'CURA' || move.effetto === 'CURA_PCT') {
    return buildProfile('heal', 'effect', 'subtle')
  }
  if (move.soloStato === true || move.effetto === 'PARALISI' || move.effetto === 'PARALIZZATO') {
    return buildProfile('status', 'effect', 'subtle')
  }
  if (move.effetto === 'SUPREMA') {
    return buildProfile('supreme', 'effect', 'heavy')
  }
  if (move.effetto === 'CONFUSIONE' || move.effetto === 'SONNO' || move.effetto === 'VELENO') {
    return buildProfile('status', 'effect', 'light')
  }

  const explicit = EXPLICIT_ARCHETYPE_BY_MOVE_ID[move.id]
  if (explicit) {
    return buildProfile(
      explicit.archetype,
      'explicit',
      explicit.intensity ?? defaultIntensity(explicit.archetype)
    )
  }

  const name = normalize(move.nome)
  const rule = NAME_RULES.find((candidate) => candidate.pattern.test(name))
  if (rule) {
    return buildProfile(
      rule.archetype,
      'name',
      rule.intensity ?? defaultIntensity(rule.archetype)
    )
  }

  const fallback = TYPE_FALLBACK[move.tipo] ?? 'blunt'
  return buildProfile(fallback, 'type-fallback')
}

export function resolveMoveVfxProfile(move: MossaDef): MoveVfxProfile {
  const profile = inferMoveVfxProfile(move)
  const assignment = getMoveVfxAssignment(move)
  if (!assignment) return profile
  const intensity = assignment.tier === 'status' ? 'subtle' : assignment.tier
  return {
    ...profile,
    archetype: assignment.tier === 'status' && profile.archetype !== 'heal' ? 'status' : profile.archetype,
    intensity,
    // Healing/status animation size must not introduce physical hit reactions.
    feedback: FEEDBACK[profile.archetype === 'heal' ? 'subtle' : intensity],
  }
}

const BEAM_BY_TYPE: Record<TipoPokemon, MoveVfxAssetId> = {
  Fuoco: 'fireballGif',
  Acqua: 'waterGif',
  Erba: 'shimmer',
  Elettro: 'energyGif',
  Terra: 'guardBreakGif',
  Psico: 'psychicGif',
  Oscurità: 'debuff',
  Normale: 'thrust',
}

const HEAVY_BY_TYPE: Record<TipoPokemon, MoveVfxAssetId> = {
  Fuoco: 'fireWaveGif',
  Acqua: 'waterTorrentGif',
  Erba: 'shimmer',
  Elettro: 'lightningGif',
  Terra: 'guardBreakGif',
  Psico: 'psychicBurstGif',
  Oscurità: 'burst',
  Normale: 'gutsPunchGif',
}

export function resolveProfileAssetId(
  move: MossaDef,
  profile = resolveMoveVfxProfile(move)
): MoveVfxAssetId {
  const curatedAssetId = getCuratedBattleAssetId(profile.archetype, profile.intensity)
  if (curatedAssetId) return curatedAssetId

  switch (profile.archetype) {
    case 'heal':
      return 'cure'
    case 'status':
      if (move.effetto === 'VELENO') return 'poisonGif'
      if (move.effetto === 'CONFUSIONE') return 'confuseGif'
      return 'debuff'
    case 'supreme':
      return 'burst'
    case 'slash':
      return 'slash'
    case 'bite':
      return profile.intensity === 'heavy' ? 'guardBreakGif' : 'gutsPunchGif'
    case 'charge':
      return 'thrust'
    case 'beam':
      return BEAM_BY_TYPE[move.tipo]
    case 'wave':
    case 'storm':
    case 'eruption':
      return HEAVY_BY_TYPE[move.tipo]
    case 'aura':
      if (move.tipo === 'Fuoco') return 'firePulseGif'
      if (move.tipo === 'Elettro') return 'energyGif'
      if (move.tipo === 'Psico') return 'psychicGif'
      if (move.tipo === 'Oscurità') return 'debuff'
      if (move.tipo === 'Terra') return 'barrier'
      if (move.tipo === 'Normale') return 'buff'
      return 'shimmer'
    case 'psychic':
      return profile.intensity === 'heavy' ? 'psychicBurstGif' : 'psychicGif'
    case 'plant':
      return profile.intensity === 'heavy' ? 'slash' : 'shimmer'
    case 'fire':
      return profile.intensity === 'heavy' ? 'fireWaveGif' : 'firePulseGif'
    case 'electric':
      return profile.intensity === 'heavy' ? 'lightningGif' : 'energyGif'
    case 'water':
      return profile.intensity === 'heavy' ? 'waterTorrentGif' : 'waterGif'
    case 'dark':
      return profile.intensity === 'heavy' ? 'burst' : 'debuff'
    case 'blunt':
    default:
      return profile.intensity === 'heavy' ? 'gutsPunchGif' : 'punch'
  }
}
