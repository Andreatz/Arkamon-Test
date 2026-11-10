import { describe, expect, it } from 'vitest'
import {
  calcolaVariazioneMonete,
  DURATA_STATO,
} from '@engine/battleEngine'
import {
  ALLENATORI,
  INCONTRI,
  MAPPE,
  MOSSE,
} from '@data/index'
import {
  CESPUGLI_STANDARD,
  ECONOMIA_BILANCIAMENTO,
  PROGRESSIONE_MAPPE,
  RANGE_INCONTRI_PERCORSO,
  RANGE_LIVELLI_ALLENATORI,
  SOGLIE_EFFETTI_SPECIALI,
} from '@data/bilanciamento'

describe('bilanciamento progressione', () => {
  it('copre tutte le mappe storiche nello stesso ordine di mappe.json', () => {
    expect(PROGRESSIONE_MAPPE).toEqual(MAPPE.map((m) => m.nome))
  })

  it('blocca i range livello di ogni allenatore della run principale', () => {
    for (const allenatore of ALLENATORI) {
      const range = RANGE_LIVELLI_ALLENATORI[allenatore.id]
      expect(range, `Range mancante per allenatore ${allenatore.id}`).toBeTruthy()

      const livelli = allenatore.squadra.map((p) => p.livello)
      expect(Math.min(...livelli)).toBeGreaterThanOrEqual(range.min)
      expect(Math.max(...livelli)).toBeLessThanOrEqual(range.max)
    }
  })

  it('mantiene i capipalestra in crescita lungo la progressione', () => {
    const gymAces = ALLENATORI.filter((a) => a.tipo === 'Capopalestra').map(
      (a) => Math.max(...a.squadra.map((p) => p.livello))
    )

    for (let i = 1; i < gymAces.length; i++) {
      expect(gymAces[i]).toBeGreaterThan(gymAces[i - 1])
    }
  })
})

describe('bilanciamento incontri selvatici', () => {
  it('ogni percorso ha i cespugli standard A-F o il set storico previsto', () => {
    for (const [luogo] of Object.entries(RANGE_INCONTRI_PERCORSO)) {
      const cespugli = new Set(
        INCONTRI.filter((i) => i.luogo === luogo).map((i) => i.cespuglio)
      )
      const attesi =
        luogo === 'Percorso_1'
          ? new Set([...CESPUGLI_STANDARD, 'G'])
          : new Set(CESPUGLI_STANDARD)
      expect(cespugli).toEqual(attesi)
    }
  })

  it('i livelli degli incontri restano nel range definito per ogni percorso', () => {
    for (const incontro of INCONTRI) {
      const range = RANGE_INCONTRI_PERCORSO[incontro.luogo]
      expect(range, `Range mancante per ${incontro.luogo}`).toBeTruthy()
      expect(incontro.livelloMin).toBeGreaterThanOrEqual(range.min)
      expect(incontro.livelloMax).toBeLessThanOrEqual(range.max)
      expect(incontro.livelloMin).toBeLessThanOrEqual(incontro.livelloMax)
    }
  })

  it('ogni cespuglio offre almeno un incontro Comune e uno non Comune', () => {
    for (const [luogo] of Object.entries(RANGE_INCONTRI_PERCORSO)) {
      const cespugli =
        luogo === 'Percorso_1' ? [...CESPUGLI_STANDARD, 'G'] : CESPUGLI_STANDARD

      for (const cespuglio of cespugli) {
        const incontri = INCONTRI.filter(
          (i) => i.luogo === luogo && i.cespuglio === cespuglio
        )
        expect(incontri.some((i) => i.probabilita === 'Comune')).toBe(true)
        expect(incontri.some((i) => i.probabilita !== 'Comune')).toBe(true)
      }
    }
  })
})

describe('bilanciamento economia', () => {
  it('mantiene il rapporto premio capopalestra / NPC a 5x', () => {
    expect(calcolaVariazioneMonete('vittoria', 'NPC')).toBe(
      ECONOMIA_BILANCIAMENTO.premioNpc
    )
    expect(calcolaVariazioneMonete('vittoria', 'Capopalestra')).toBe(
      ECONOMIA_BILANCIAMENTO.premioCapopalestra
    )
    expect(
      calcolaVariazioneMonete('vittoria', 'Capopalestra') /
        calcolaVariazioneMonete('vittoria', 'NPC')
    ).toBe(ECONOMIA_BILANCIAMENTO.rapportoCapopalestraNpc)
  })

  it('la penalita sconfitta resta uguale per NPC e capopalestra', () => {
    expect(calcolaVariazioneMonete('sconfitta', 'NPC')).toBe(
      ECONOMIA_BILANCIAMENTO.penalitaSconfittaTrainer
    )
    expect(calcolaVariazioneMonete('sconfitta', 'Capopalestra')).toBe(
      ECONOMIA_BILANCIAMENTO.penalitaSconfittaTrainer
    )
  })

  it('una run completa ha una ricompensa totale positiva ma non esplosiva', () => {
    const totale = ALLENATORI.reduce((somma, a) => {
      if (a.tipo === 'NPC') return somma + calcolaVariazioneMonete('vittoria', 'NPC')
      if (a.tipo === 'Capopalestra') {
        return somma + calcolaVariazioneMonete('vittoria', 'Capopalestra')
      }
      return somma
    }, 0)

    expect(totale).toBeGreaterThan(0)
    expect(totale).toBeLessThanOrEqual(15000)
  })
})

describe('bilanciamento stati, cure e Supreme', () => {
  it('mantiene durate stato entro soglie compatte', () => {
    expect(DURATA_STATO.Confuso).toBe(2)
    expect(DURATA_STATO.Addormentato).toBe(3)
    expect(DURATA_STATO.Avvelenato).toBe(-1)
  })

  it('limita cure percentuali, status value e autodanno Supreme', () => {
    for (const mossa of MOSSE) {
      if (mossa.effetto === 'CURA_PCT') {
        expect(mossa.valoreEffetto).toBeGreaterThanOrEqual(
          SOGLIE_EFFETTI_SPECIALI.curaPctMin
        )
        expect(mossa.valoreEffetto).toBeLessThanOrEqual(
          SOGLIE_EFFETTI_SPECIALI.curaPctMax
        )
      }

      if (
        mossa.effetto === 'CONFUSIONE' ||
        mossa.effetto === 'SONNO' ||
        mossa.effetto === 'VELENO'
      ) {
        expect(mossa.valoreEffetto).toBeGreaterThanOrEqual(
          SOGLIE_EFFETTI_SPECIALI.statoValoreMin
        )
        expect(mossa.valoreEffetto).toBeLessThanOrEqual(
          SOGLIE_EFFETTI_SPECIALI.statoValoreMax
        )
      }

      if (mossa.effetto === 'SUPREMA') {
        expect(mossa.valoreEffetto).toBe(
          SOGLIE_EFFETTI_SPECIALI.supremaAutodannoPct
        )
      }
    }
  })
})
