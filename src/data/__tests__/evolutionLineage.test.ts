import { describe, expect, it } from 'vitest'
import { getPokemon } from '../index'
import { applicaXP } from '@/engine/battleEngine'
import { teamProgressionLimit } from '@/engine/teamLevelCap'
import type { PokemonIstanza } from '@/types'

const grimbolt = (): PokemonIstanza => ({
  istanzaId: 'grimbolt-evolving', specieId: 24, nome: 'Grimbolt', livello: 25, hp: 7, xp: 0,
  stato: { tipo: 'Avvelenato', turniRimanenti: -1, turniTrascorsi: 2 },
})

describe('linea evolutiva di Grimbolt', () => {
  it('raggiunge Grimbolt 25 al livello 26 conservando HP, status e istanza iniziale', () => {
    const original = grimbolt()
    const before = structuredClone(original)
    const result = applicaXP(original, 1)
    expect(result.evoluzionePendente).toEqual({ nuovaSpecieId: 25 })
    expect(result.istanza).toEqual({ ...before, livello: 26 })
    expect(result).toMatchObject({ livelliGuadagnati: 1, xpScartata: 0 })
    expect(original).toEqual(before)
    const evolved = getPokemon(result.evoluzionePendente!.nuovaSpecieId)!
    expect(evolved).toMatchObject({ nome: 'Grimbolt', categoria: 'Lenta', tipo: 'Elettro', hpBase: 12,
      evoluzioneId: 0, livelloEvoluzione: 0 })
  })

  it('rispetta il cap anche con il compagno KO e richiede nuova EXP dopo lo sblocco', () => {
    const original = grimbolt()
    const teammate: PokemonIstanza = { istanzaId: 'teammate-ko', specieId: 1, nome: 'Compagno', livello: 20, hp: 0, xp: 0 }
    const limit = teamProgressionLimit([original, teammate], original.istanzaId)
    expect(limit).toBe(25)
    const capped = applicaXP(original, 1, limit)
    expect(capped).toMatchObject({ istanza: original, livelliGuadagnati: 0, xpScartata: 1, evoluzionePendente: null })
    const unlockedLimit = teamProgressionLimit([original, { ...teammate, livello: 21 }], original.istanzaId)
    const withoutReward = applicaXP(capped.istanza, 0, unlockedLimit)
    expect(withoutReward).toMatchObject({ istanza: original, livelliGuadagnati: 0, evoluzionePendente: null })
    expect(applicaXP(withoutReward.istanza, 1, unlockedLimit)).toMatchObject({
      istanza: { ...original, livello: 26 }, livelliGuadagnati: 1, xpScartata: 0, evoluzionePendente: { nuovaSpecieId: 25 },
    })
  })

  it('non ripete evoluzioni dopo la forma finale e non conserva vecchi residui EXP', () => {
    const evolved = { ...grimbolt(), specieId: 25, livello: 26, xp: 9 }
    const result = applicaXP(evolved, 1)
    expect(result).toMatchObject({ istanza: { ...evolved, livello: 27, xp: 0 },
      livelliGuadagnati: 1, xpScartata: 0, evoluzionePendente: null })
    expect(evolved).toMatchObject({ livello: 26, xp: 9, hp: 7, stato: grimbolt().stato })
  })
})
