import { describe, expect, it } from 'vitest'
import { calcolaHPMax } from '@/engine/battleEngine'
import type { PokemonIstanza } from '@/types'
import { resolveItemEffect } from '../itemEffects'

function pokemon(patch: Partial<PokemonIstanza> = {}): PokemonIstanza {
  return { istanzaId: 'one', specieId: 1, nome: 'Vyrath', livello: 5, hp: 1, xp: 0, ...patch }
}

describe('effetti espliciti degli oggetti', () => {
  it.each([['potion', 3], ['super-potion', 6]] as const)('%s recovers its declared HP fraction while preserving levels, XP and statuses', (item, recovered) => {
    const target = pokemon({ stato: { tipo: 'Paralizzato', turniRimanenti: -1 } })
    const before = structuredClone(target)
    const result = resolveItemEffect(target, item)
    expect(result).toMatchObject({ ok: true, recoveredHp: recovered, pokemon: { ...target, hp: 1 + recovered } })
    expect(target).toEqual(before)
  })

  it('rounds percentages up and caps recovery at HP maximum', () => {
    const target = pokemon({ livello: 6 })
    expect(calcolaHPMax(target)).toBe(13)
    expect(resolveItemEffect(target, 'potion').recoveredHp).toBe(4)
    expect(resolveItemEffect({ ...target, hp: 12 }, 'super-potion').pokemon?.hp).toBe(13)
    expect(resolveItemEffect({ ...target, hp: 13 }, 'potion').ok).toBe(false)
  })

  it('does not heal KO Arkamon and revives only KO without an implicit status cure', () => {
    const target = pokemon({ hp: 0, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } })
    expect(resolveItemEffect(target, 'potion').ok).toBe(false)
    expect(resolveItemEffect(target, 'super-potion').ok).toBe(false)
    expect(resolveItemEffect(target, 'revive').pokemon).toEqual({ ...target, hp: 6 })
    expect(resolveItemEffect(pokemon({ livello: 6, hp: 0 }), 'revive').pokemon?.hp).toBe(7)
    expect(resolveItemEffect(pokemon(), 'revive').ok).toBe(false)
  })

  it.each([['antidote', 'Avvelenato'], ['paralysis-heal', 'Paralizzato'], ['awakening', 'Addormentato']] as const)('%s removes only %s without healing HP', (item, status) => {
    const target = pokemon({ hp: 4, stato: { tipo: status, turniRimanenti: status === 'Addormentato' ? 3 : -1, turniTrascorsi: 2 } })
    const result = resolveItemEffect(target, item)
    expect(result.ok).toBe(true)
    expect(result.pokemon).toEqual(pokemon({ hp: 4 }))
    expect(target.stato?.tipo).toBe(status)
    expect(resolveItemEffect(pokemon(), item).ok).toBe(false)
    expect(resolveItemEffect(pokemon({ stato: { tipo: 'Confuso', turniRimanenti: 2 } }), item).ok).toBe(false)
    expect(resolveItemEffect({ ...target, hp: 0 }, item).ok).toBe(false)
  })

  it('does not consume a Masterball as a normal healing item or recognize invented items', () => {
    expect(resolveItemEffect(pokemon(), 'masterball').ok).toBe(false)
    expect(resolveItemEffect(pokemon(), 'unknown').ok).toBe(false)
  })

  it.each([{ hp: -1 }, { hp: Infinity }, { hp: 999 }, { livello: 101 }, { livello: 4 }, { livello: 5.5 }, { specieId: 1000 }])('rejects invalid targets %j without mutation', (patch) => {
    const target = pokemon(patch)
    const before = structuredClone(target)
    const result = resolveItemEffect(target, 'potion')
    expect(result.ok).toBe(false)
    expect(result.pokemon).toBeUndefined()
    expect(target).toEqual(before)
  })
})
