import { efficaciaTipo } from '@/data/index'
import { getMossaAlLivello, èMossaCura, èMossaSoloStato } from '@/engine/battleEngine'
import type { MossaDef, TipoPokemon } from '@/types'

export function battleMoveFacts(move: MossaDef, level: number, defenderType?: TipoPokemon) {
  if (èMossaCura(move)) {
    const amount = move.valoreEffetto ?? 0
    const label = move.effetto === 'CURA_PCT' ? `Cura ${amount}% HP` : `Cura ${amount} HP`
    return { label, detail: `${label}. Rimuove veleno e paralisi; conserva sonno e confusione. Nessun tiro offensivo.`, kind: 'heal' as const }
  }
  if (èMossaSoloStato(move)) {
    return { label: 'Status', detail: `${move.effetto ?? 'Status'}. Nessun danno o tiro offensivo; non può diventare Suprema.`, kind: 'status' as const }
  }
  const { dadi, incremento } = getMossaAlLivello(move, level)
  const label = `${dadi}d6${incremento ? ` ${incremento > 0 ? '+' : '−'} ${Math.abs(incremento)}` : ''}`
  const multiplier = defenderType ? efficaciaTipo(move.tipo, defenderType) : undefined
  const effectiveness = multiplier === undefined ? '' : ` Efficacia contro ${defenderType}: ×${multiplier}.`
  return { label, detail: `${label}.${effectiveness} Suprema: danno doppio, poi contraccolpo di metà degli HP massimi.`, kind: 'attack' as const }
}
