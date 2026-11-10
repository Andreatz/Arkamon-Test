import { describe, expect, it } from 'vitest'
import {
  applicaStato, applicaXPDopoKO, calcolaAzioneSuprema, calcolaHPMax,
  risolviAttaccanteDopoMossa, risolviStatoInizioTurno,
} from '../battleEngine'
import type { PokemonIstanza } from '@/types'

function pokemon(id: string, livello = 10, hp = 5): PokemonIstanza {
  return { istanzaId: id, specieId: 1, nome: id, livello, hp, xp: 0 }
}

describe('progressione simmetrica dopo KO da status o contraccolpo', () => {
  it.each(['A', 'B'] as const)('premia il lato sopravvissuto quando %s cade per veleno', (lato) => {
    const vincitore = pokemon(lato === 'A' ? 'B' : 'A', 14, 5)
    const prima = applicaStato(pokemon(lato, 10, 1), 'Avvelenato')
    const dopo = risolviStatoInizioTurno(prima, calcolaHPMax(prima)).istanza
    const progressione = applicaXPDopoKO(vincitore, prima, dopo)
    expect(progressione).toMatchObject({
      xpAssegnata: 1, livelliGuadagnati: 1,
      istanza: { livello: 15, hp: 5, xp: 0 },
      evoluzionePendente: { nuovaSpecieId: 2 },
    })
    expect(vincitore.livello).toBe(14)
    expect(prima.hp).toBe(1)
  })

  it.each(['A', 'B'] as const)('premia l’avversario quando %s si colpisce da confuso', (lato) => {
    const prima = applicaStato(pokemon(lato, 10, 1), 'Confuso')
    const dopo = risolviStatoInizioTurno(prima, calcolaHPMax(prima), () => 0).istanza
    expect(applicaXPDopoKO(pokemon(lato === 'A' ? 'B' : 'A'), prima, dopo))
      .toMatchObject({ xpAssegnata: 1, istanza: { livello: 11, hp: 5 } })
  })

  it.each(['A', 'B'] as const)('premia il bersaglio sopravvissuto al contraccolpo di %s', (lato) => {
    const attaccante = pokemon(lato, 10, 1)
    const bersaglio = pokemon(lato === 'A' ? 'B' : 'A', 20, 20)
    const mossa = calcolaAzioneSuprema(attaccante, bersaglio, 0, () => 0)!
    const dopoAttacco = risolviAttaccanteDopoMossa(mossa)
    const dopoDifesa = { ...bersaglio, hp: bersaglio.hp - mossa.dannoFinale }
    expect(dopoAttacco.xpAssegnata).toBe(0)
    expect(dopoAttacco.istanza.hp).toBe(0)
    expect(dopoDifesa.hp).toBeGreaterThan(0)
    const premio = applicaXPDopoKO(dopoDifesa, attaccante, dopoAttacco.istanza)
    expect(premio.xpAssegnata).toBe(1)
    expect(premio.istanza.livello).toBe(21)
    expect(premio.istanza.hp).toBe(dopoDifesa.hp)
  })

  it('nel doppio KO premia solo chi abbatte il bersaglio prima del contraccolpo', () => {
    const attaccante = pokemon('A', 14, 13)
    const bersaglio = pokemon('B', 5, 1)
    const mossa = calcolaAzioneSuprema(attaccante, bersaglio, 0, () => 0)!
    const dopoAttacco = risolviAttaccanteDopoMossa(mossa)
    const dopoDifesa = { ...bersaglio, hp: 0 }
    expect(dopoAttacco.xpAssegnata).toBe(1)
    expect(dopoAttacco.istanza).toMatchObject({ livello: 15, hp: 0 })
    expect(applicaXPDopoKO(dopoDifesa, attaccante, dopoAttacco.istanza).xpAssegnata).toBe(0)
  })

  it('non premia nuovamente un KO già salvato né una sostituzione di istanza', () => {
    const vincitore = pokemon('B')
    const sconfitto = pokemon('A', 10, 0)
    expect(applicaXPDopoKO(vincitore, sconfitto, sconfitto).xpAssegnata).toBe(0)
    expect(applicaXPDopoKO(vincitore, pokemon('A'), pokemon('riserva', 10, 0)).xpAssegnata).toBe(0)
    expect(applicaXPDopoKO(vincitore, pokemon('A'), pokemon('A', 10, 1)).xpAssegnata).toBe(0)
  })

  it('rispetta il cap di livello100 senza curare o cancellare PAR', () => {
    const vincitore = applicaStato(pokemon('B', 100, 4), 'Paralizzato')
    const premio = applicaXPDopoKO(vincitore, pokemon('A'), pokemon('A', 10, 0))
    expect(premio).toMatchObject({
      xpAssegnata: 1, livelliGuadagnati: 0,
      istanza: { livello: 100, hp: 4, xp: 0, stato: vincitore.stato },
    })
  })
})
