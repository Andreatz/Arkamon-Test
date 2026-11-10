import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  èMossaSuprema,
  autodannoSuprema,
  calcolaAzioneSuprema,
  calcolaDanno,
  calcolaHPMax,
  costoSuprema,
  esitoSquadre,
  risolviAttaccanteDopoMossa,
  scegliMossaIA,
} from '@engine/battleEngine'
import * as gameData from '@data/index'
import type { PokemonIstanza, MossaDef } from '@/types'

afterEach(() => vi.restoreAllMocks())

function mkIstanza(specieId: number, livello: number, hp?: number): PokemonIstanza {
  const istanza: PokemonIstanza = {
    istanzaId: `test-${specieId}-${livello}`,
    specieId,
    nome: 'Test',
    livello,
    hp: 0,
    xp: 0,
  }
  istanza.hp = hp ?? calcolaHPMax(istanza)
  return istanza
}

function mkMossa(
  effetto: string | null,
  valoreEffetto: number | null,
  tipo: MossaDef['tipo'] = 'Normale'
): MossaDef {
  return {
    id: 999,
    nome: 'Suprema Test',
    tipo,
    effetto,
    valoreEffetto,
    dadiPerLivello: { '5': 1 },
    incrementoPerLivello: { '5': 0 },
  }
}

describe('èMossaSuprema', () => {
  it('riconosce solo SUPREMA', () => {
    expect(èMossaSuprema(mkMossa('SUPREMA', 50))).toBe(true)
    expect(èMossaSuprema(mkMossa('CURA', 50))).toBe(false)
    expect(èMossaSuprema(mkMossa('VELENO', 30))).toBe(false)
    expect(èMossaSuprema(mkMossa(null, null))).toBe(false)
  })
})

describe('autodannoSuprema', () => {
  it('default 50% di hpMax se valoreEffetto è null', () => {
    const m = mkMossa('SUPREMA', null)
    expect(autodannoSuprema(m, 100)).toBe(50)
  })
  it('usa sempre il 50% degli HP massimi ignorando percentuali legacy diverse', () => {
    expect(autodannoSuprema(mkMossa('SUPREMA', 30), 100)).toBe(50)
    expect(autodannoSuprema(mkMossa('SUPREMA', 75), 80)).toBe(40)
  })
  it('arrotonda per difetto con HP massimi dispari', () => {
    expect(autodannoSuprema(mkMossa('SUPREMA', 50), 19)).toBe(9)
  })
  it('clamp min 1 anche con hpMax molto basso', () => {
    expect(autodannoSuprema(mkMossa('SUPREMA', 50), 1)).toBe(1)
  })
  it('mossa non suprema → 0', () => {
    expect(autodannoSuprema(mkMossa('CURA', 50), 100)).toBe(0)
  })
})

describe('azione Suprema esplicita con dati reali', () => {
  it('raddoppia una mossa ordinaria di Vyrath e conserva dadi, tipo e bonus', () => {
    const att = mkIstanza(1, 5)
    const dif = mkIstanza(13, 5)
    const normale = calcolaDanno(att, dif, 0, () => 0, false)!
    const suprema = calcolaAzioneSuprema(att, dif, 0, () => 0)!
    expect(normale.dannoFinale).toBe(2)
    expect(suprema.dannoFinale).toBe(4)
    expect(suprema.tiriDado).toEqual([1])
    expect(suprema.incremento).toBe(normale.incremento)
    expect(suprema.moltiplicatoreTipo).toBe(normale.moltiplicatoreTipo)
    expect(suprema.mossa).toBe(normale.mossa)
    expect(suprema.autodanno).toBe(6)
    expect(suprema.suprema).toBe(true)
    expect(normale.suprema).toBe(false)
  })

  it('raddoppia il danno normale già arrotondato contro una resistenza', () => {
    const att = mkIstanza(1, 5)
    const dif = mkIstanza(32, 5) // Brezza Profumata Erba contro Blazion Fuoco: ×0.5.
    const normale = calcolaDanno(att, dif, 1, () => 0.2, false)!
    const suprema = calcolaAzioneSuprema(att, dif, 1, () => 0.2)!
    expect(normale.dannoBase).toBe(3)
    expect(normale.moltiplicatoreTipo).toBe(0.5)
    expect(normale.dannoFinale).toBe(2)
    expect(suprema.dannoFinale).toBe(4)
  })

  it('usa gli HP massimi dispari anche se gli HP correnti non bastano al costo', () => {
    const att = mkIstanza(1, 10, 1)
    const dif = mkIstanza(13, 5)
    const suprema = calcolaAzioneSuprema(att, dif, 0, () => 0)!
    expect(calcolaHPMax(att)).toBe(19)
    expect(suprema.autodanno).toBe(9)
    // Il motore restituisce il costo; la scena applica danno e contraccolpo nell'ordine previsto.
    expect(att.hp).toBe(1)
    expect(dif.hp).toBe(12)
  })

  it('esclude le cure senza tirare dadi o cambiare il loro effetto', () => {
    const att = mkIstanza(95, 5, 4) // Assorbilinfa, CURA_PCT.
    const cura = gameData.getMossa(gameData.getPokemon(95)!.mosse[0])!
    expect(cura.effetto).toBe('CURA_PCT')
    expect(calcolaAzioneSuprema(att, mkIstanza(13, 5), 0, () => {
      throw new Error('Una cura non deve tirare dadi per la Suprema')
    })).toBeNull()
    expect(cura.effetto).toBe('CURA_PCT')
    expect(att.hp).toBe(4)
  })

  it('preserva lo status di una mossa offensiva senza modificare i dati', () => {
    const att = mkIstanza(47, 5) // Predigestione applica veleno.
    const dif = mkIstanza(13, 5)
    const normale = calcolaDanno(att, dif, 0, () => 0, false)!
    const suprema = calcolaAzioneSuprema(att, dif, 0, () => 0)!
    expect(normale.statoApplicato).toBe('Avvelenato')
    expect(suprema.statoApplicato).toBe(normale.statoApplicato)
    expect(suprema.mossa.effetto).toBe('VELENO')
    expect(suprema.dannoFinale).toBe(normale.dannoFinale * 2)
    expect(dif.stato).toBeUndefined()
  })

  it('rifiuta uno slot vuoto o una specie mancante', () => {
    expect(calcolaAzioneSuprema(mkIstanza(1, 5), mkIstanza(13, 5), 2)).toBeNull()
    expect(calcolaAzioneSuprema(mkIstanza(999, 5), mkIstanza(13, 5), 0)).toBeNull()
  })
})

describe('costoSuprema per la UI', () => {
  it('restituisce lo stesso costo fisso per HP massimi pari, dispari e minimi', () => {
    expect(costoSuprema(12)).toBe(6)
    expect(costoSuprema(19)).toBe(9)
    expect(costoSuprema(1)).toBe(1)
  })
})

describe('KO del bersaglio, XP e contraccolpo Suprema', () => {
  it('assegna il livello prima del costo nuovo, senza curare, anche se il contraccolpo manda KO', () => {
    const att = mkIstanza(1, 6, 6)
    const dif = mkIstanza(13, 5, 1)
    const ris = calcolaAzioneSuprema(att, dif, 0, () => 0)!
    expect(ris.difensoreSvenuto).toBe(true)
    expect(ris.autodanno).toBe(6)

    const risolto = risolviAttaccanteDopoMossa(ris)
    expect(risolto.xpAssegnata).toBe(1)
    expect(risolto.livelliGuadagnati).toBe(1)
    expect(risolto.istanzaPrimaDelContraccolpo).toMatchObject({ livello: 7, xp: 0, hp: 6 })
    expect(calcolaHPMax(risolto.istanzaPrimaDelContraccolpo)).toBe(15)
    expect(risolto.autodanno).toBe(7)
    expect(risolto.istanza).toMatchObject({ livello: 7, xp: 0, hp: 0 })
    expect(risolto.evoluzionePendente).toBeNull()
    const messaggioKO = `${dif.nome} non può più combattere!`
    const messaggioLivello = `${att.nome} è salito al livello 7!`
    const messaggioCosto = `${att.nome} si scarica e perde 7 HP!`
    expect(risolto.messaggi.indexOf(messaggioKO)).toBeLessThan(risolto.messaggi.indexOf(messaggioLivello))
    expect(risolto.messaggi.indexOf(messaggioLivello)).toBeLessThan(risolto.messaggi.indexOf(messaggioCosto))
    expect(risolto.messaggi.filter((messaggio) => messaggio.includes('si scarica'))).toEqual([messaggioCosto])
  })

  it('conserva l’evoluzione pendente dopo XP e KO, usando il massimo della specie ancora attuale', () => {
    const att = mkIstanza(1, 14, 13)
    const ris = calcolaAzioneSuprema(att, mkIstanza(13, 5, 1), 0, () => 0)!
    expect(calcolaHPMax(att)).toBe(25)
    expect(ris.autodanno).toBe(12)

    const risolto = risolviAttaccanteDopoMossa(ris)
    expect(risolto.istanzaPrimaDelContraccolpo).toMatchObject({ specieId: 1, livello: 15, hp: 13 })
    expect(calcolaHPMax(risolto.istanzaPrimaDelContraccolpo)).toBe(27)
    expect(risolto.autodanno).toBe(13)
    expect(risolto.istanza).toMatchObject({ specieId: 1, livello: 15, hp: 0 })
    expect(risolto.evoluzionePendente).toEqual({ nuovaSpecieId: 2 })
    expect(risolto.messaggi.some((messaggio) => messaggio.includes('evolvendo'))).toBe(false)
  })

  it('senza KO del bersaglio mantiene il livello, azzera XP legacy e applica soltanto il costo corrente', () => {
    const att = { ...mkIstanza(1, 10, 5), xp: 0.5 }
    const dif = mkIstanza(13, 40)
    const ris = calcolaAzioneSuprema(att, dif, 0, () => 0)!
    expect(ris.difensoreSvenuto).toBe(false)

    const risolto = risolviAttaccanteDopoMossa(ris)
    expect(risolto.istanza).toMatchObject({ livello: 10, xp: 0, hp: 0 })
    expect(risolto.xpAssegnata).toBe(0)
    expect(risolto.livelliGuadagnati).toBe(0)
    expect(risolto.autodanno).toBe(9)
    expect(risolto.evoluzionePendente).toBeNull()
    expect(risolto.messaggi.some((messaggio) => messaggio.includes('salito al livello'))).toBe(false)
    expect(dif.hp).toBe(64)
    expect(dif.xp).toBe(0)
  })

  it('un attacco normale assegna XP senza introdurre costo o Suprema dai metadati legacy', () => {
    const att = mkIstanza(107, 5, 6)
    const ris = calcolaDanno(att, mkIstanza(1, 5, 1), 0, () => 0, false)!
    expect(ris.mossa.effetto).toBe('SUPREMA')
    const risolto = risolviAttaccanteDopoMossa(ris)
    expect(risolto.istanza).toMatchObject({ livello: 6, hp: 6, xp: 0 })
    expect(risolto.xpAssegnata).toBe(1)
    expect(risolto.autodanno).toBe(0)
    expect(risolto.messaggi.some((messaggio) => messaggio.includes('si scarica'))).toBe(false)
  })

  it('gestisce livello massimo e conserva gli input e lo stato alterato', () => {
    const att = { ...mkIstanza(1, 100, 3), stato: { tipo: 'Avvelenato' as const, turniRimanenti: -1, turniTrascorsi: 2 } }
    const dif = mkIstanza(13, 5, 1)
    const ris = calcolaAzioneSuprema(att, dif, 0, () => 0)!
    const inputAtt = structuredClone(att)
    const inputDif = structuredClone(dif)
    const inputMessaggi = [...ris.messaggi]
    Object.freeze(att.stato)
    Object.freeze(att)
    Object.freeze(dif)
    Object.freeze(ris.messaggi)
    Object.freeze(ris)

    const risolto = risolviAttaccanteDopoMossa(ris)
    expect(risolto.istanza).toMatchObject({ livello: 100, hp: 0, xp: 0, stato: inputAtt.stato })
    expect(risolto.livelliGuadagnati).toBe(0)
    expect(risolto.evoluzionePendente).toBeNull()
    expect(risolto.autodanno).toBe(Math.floor(calcolaHPMax(att) / 2))
    expect(att).toEqual(inputAtt)
    expect(dif).toEqual(inputDif)
    expect(ris.messaggi).toEqual(inputMessaggi)
    expect(risolto.istanza).not.toBe(att)
  })

  it('non assegna XP per un bersaglio già KO o un attaccante già esausto', () => {
    const att = mkIstanza(1, 6)
    const risBersaglioGiaKO = calcolaDanno(att, mkIstanza(13, 5, 0), 0, () => 0, false)!
    expect(risolviAttaccanteDopoMossa(risBersaglioGiaKO).xpAssegnata).toBe(0)
    const risAttaccanteGiaKO = calcolaDanno(mkIstanza(1, 6, 0), mkIstanza(13, 5, 1), 0, () => 0, false)!
    expect(risolviAttaccanteDopoMossa(risAttaccanteGiaKO).xpAssegnata).toBe(0)
  })

  it.each(['A', 'B'] as const)('nel doppio ultimo KO vince l’attaccante %s', (lato) => {
    const att = mkIstanza(1, 14, 13)
    const dif = mkIstanza(13, 5, 1)
    const ris = calcolaAzioneSuprema(att, dif, 0, () => 0)!
    const dopoAttacco = risolviAttaccanteDopoMossa(ris).istanza
    const dopoDifesa = { ...dif, hp: Math.max(0, dif.hp - ris.dannoFinale) }
    const squadraA = [lato === 'A' ? dopoAttacco : dopoDifesa]
    const squadraB = [lato === 'B' ? dopoAttacco : dopoDifesa]
    expect(esitoSquadre(squadraA, squadraB, lato)).toBe(lato === 'A' ? 'vittoria' : 'sconfitta')
  })

  it.each(['A', 'B'] as const)('l’attaccante %s esausto perde se il difensore conserva riserve', (lato) => {
    const att = mkIstanza(1, 14, 13)
    const dif = mkIstanza(13, 5, 1)
    const ris = calcolaAzioneSuprema(att, dif, 0, () => 0)!
    const dopoAttacco = risolviAttaccanteDopoMossa(ris).istanza
    const dopoDifesa = { ...dif, hp: 0 }
    const riserva = mkIstanza(5, 5, 9)
    const squadraA = lato === 'A' ? [dopoAttacco] : [dopoDifesa, riserva]
    const squadraB = lato === 'B' ? [dopoAttacco] : [dopoDifesa, riserva]
    expect(esitoSquadre(squadraA, squadraB, lato)).toBe(lato === 'A' ? 'sconfitta' : 'vittoria')
    const entrambeConRiserve = lato === 'A' ? [[...squadraA, riserva], squadraB] : [squadraA, [...squadraB, riserva]]
    expect(esitoSquadre(entrambeConRiserve[0], entrambeConRiserve[1], lato)).toBeNull()
  })
})

describe('compatibilità delle mosse legacy SUPREMA', () => {
  it.each([107, 110])('potenzia una sola volta la specie %i anche con attivazione esplicita', (id) => {
    const att = mkIstanza(id, 5)
    const dif = mkIstanza(1, 5)
    const normale = calcolaDanno(att, dif, 0, () => 0, false)!
    const legacy = calcolaDanno(att, dif, 0, () => 0)!
    const esplicita = calcolaAzioneSuprema(att, dif, 0, () => 0)!
    expect(normale.dannoFinale).toBe(2)
    expect(legacy.dannoFinale).toBe(4)
    expect(esplicita.dannoFinale).toBe(4)
    expect(legacy.autodanno).toBe(6)
    expect(esplicita.autodanno).toBe(6)
    expect(normale.autodanno).toBe(0)
    expect(normale.suprema).toBe(false)
    expect(normale.messaggi).not.toContain('💥 MOSSA SUPREMA! 💥')
  })

  it('raddoppia anche il minimo di 1 di Cannone Infernale senza ×4', () => {
    const att = mkIstanza(81, 5)
    const dif = mkIstanza(13, 5)
    const normale = calcolaDanno(att, dif, 1, () => 0, false)!
    expect(normale.numDadi).toBe(0)
    expect(normale.dannoFinale).toBe(1)
    expect(normale.autodanno).toBe(0)
    expect(calcolaDanno(att, dif, 1, () => 0)?.dannoFinale).toBe(2)
    expect(calcolaAzioneSuprema(att, dif, 1, () => 0)?.dannoFinale).toBe(2)
  })
})

describe('scegliMossaIA — euristica Suprema', () => {
  it('sceglie la Suprema di Ao-shin a HP pieni e la evita con HP insufficienti', () => {
    const dif = mkIstanza(1, 5)
    expect(scegliMossaIA(mkIstanza(107, 5), dif, () => 0)).toBe(0)
    expect(scegliMossaIA(mkIstanza(107, 5, 5), dif, () => 0)).toBe(1)
  })

  it.each([
    { valoreLegacy: 30, hp: 5, mossaAttesa: 1 },
    { valoreLegacy: 75, hp: 8, mossaAttesa: 0 },
  ])('valuta il costo fisso50 anche se il dato legacy vale $valoreLegacy', ({ valoreLegacy, hp, mossaAttesa }) => {
    const getMossaOriginale = gameData.getMossa
    vi.spyOn(gameData, 'getMossa').mockImplementation((id) => {
      const mossa = getMossaOriginale(id)
      return mossa?.effetto === 'SUPREMA' ? { ...mossa, valoreEffetto: valoreLegacy } : mossa
    })
    expect(scegliMossaIA(mkIstanza(107, 5, hp), mkIstanza(1, 5), () => 0)).toBe(mossaAttesa)
  })
})
