import { describe, expect, it } from 'vitest'
import {
  applicaStato, calcolaAzioneSuprema, calcolaDanno, calcolaHPMax,
  èMossaSoloStato, getMossaAlLivello, scegliMossaIA,
} from '../battleEngine'
import { getMossa, getPokemon } from '@data/index'
import type { PokemonIstanza, StatoAlterato } from '@/types'

function pokemon(specieId: number, livello: number, hp?: number): PokemonIstanza {
  const instance: PokemonIstanza = { istanzaId: `status-${specieId}`, specieId, nome: getPokemon(specieId)!.nome, livello, hp: 0, xp: 0 }
  instance.hp = hp ?? calcolaHPMax(instance)
  return instance
}

describe('azione di sola paralisi', () => {
  it('applica paralisi senza danno, tiro o contraccolpo a qualsiasi livello', () => {
    for (const level of [5, 40, 100]) {
      const attacker = pokemon(27, level)
      const target = pokemon(1, 10)
      const result = calcolaDanno(attacker, target, 2, () => {
        throw new Error('Uno status puro non tira dadi offensivi')
      })!
      expect(result).toMatchObject({
        numDadi: 0, incremento: 0, tiriDado: [], dannoBase: 0, dannoFinale: 0,
        autodanno: 0, suprema: false, statoApplicato: 'Paralizzato', difensoreSvenuto: false,
      })
      expect(result.messaggi).toContain(`${target.nome} è ora Paralizzato!`)
      expect(result.messaggi.some((message) => message.includes('0 danni'))).toBe(false)
      expect(attacker.hp).toBe(calcolaHPMax(attacker))
      expect(target.hp).toBe(19)
      expect(target.stato).toBeUndefined()
    }
  })

  it('non applica un secondo stato né infligge danno quando il bersaglio è già affetto', () => {
    for (const status of ['Paralizzato', 'Confuso', 'Addormentato', 'Avvelenato'] as const) {
      const target = applicaStato(pokemon(1, 10), status)
      const result = calcolaDanno(pokemon(27, 5), target, 2)!
      expect(result.statoApplicato).toBeUndefined()
      expect(result.dannoFinale).toBe(0)
      expect(result.messaggi).toContain('Ma non ha funzionato...')
      expect(target.stato?.tipo).toBe(status)
    }
  })

  it('non applica paralisi a un bersaglio già KO', () => {
    expect(calcolaDanno(pokemon(27, 5), pokemon(1, 5, 0), 2)?.statoApplicato).toBeUndefined()
  })

  it('resta senza scaling e viene esclusa dalla Suprema', () => {
    const move = getMossa(225)!
    expect(èMossaSoloStato(move)).toBe(true)
    expect(èMossaSoloStato(getMossa(1)!)).toBe(false)
    expect(getMossaAlLivello(move, 100)).toEqual({ dadi: 0, incremento: 0 })
    expect(calcolaAzioneSuprema(pokemon(27, 5), pokemon(1, 5), 2)).toBeNull()
    const forced = calcolaDanno(pokemon(27, 5), pokemon(1, 5), 2, Math.random, true)!
    expect(forced.suprema).toBe(false)
    expect(forced.dannoFinale).toBe(0)
    expect(forced.autodanno).toBe(0)
  })
})

describe('IA e priorità per la paralisi', () => {
  it('usa la paralisi se il bersaglio più alto ha priorità e abbastanza HP', () => {
    expect(scegliMossaIA(pokemon(27, 5), pokemon(1, 10), () => 0)).toBe(2)
  })

  it('preferisce un attacco se ha già priorità o il bersaglio è a un HP', () => {
    expect(scegliMossaIA(pokemon(27, 10), pokemon(1, 5), () => 0)).not.toBe(2)
    expect(scegliMossaIA(pokemon(27, 5), pokemon(1, 10, 1), () => 0)).not.toBe(2)
  })

  it.each(['Paralizzato', 'Confuso', 'Addormentato', 'Avvelenato'] as StatoAlterato[])('non spreca un nuovo status contro %s', (status) => {
    expect(scegliMossaIA(pokemon(27, 5), applicaStato(pokemon(1, 10), status), () => 0)).not.toBe(2)
  })
})
