import { useState } from 'react'
import { getPokemon } from '@data/index'
import { calcolaHPMax } from '@engine/battleEngine'
import { scambia, type SlotRef } from '@engine/deposito'
import type { PokemonIstanza } from '@/types'
import { DepositView } from './DepositView'

type DepositPreview = {
  squadra: PokemonIstanza[]
  deposito: Record<string, PokemonIstanza>
}

function makePreviewPokemon(istanzaId: string, specieId: number, livello: number): PokemonIstanza {
  const specie = getPokemon(specieId)
  if (!specie) throw new Error(`Specie non presente nell'anteprima deposito: ${specieId}`)

  const pokemon: PokemonIstanza = {
    istanzaId,
    specieId,
    nome: specie.nome,
    livello,
    hp: 0,
    xp: 0,
  }
  return { ...pokemon, hp: calcolaHPMax(pokemon) }
}

export function createDepositPreview(): DepositPreview {
  const team: [number, number][] = [[6, 16], [42, 7], [47, 5], [56, 6], [46, 5], [103, 5]]
  return {
    squadra: team.map(([specieId, livello], index) => (
      makePreviewPokemon(`deposit-preview-team-${index + 1}`, specieId, livello)
    )),
    deposito: {
      '1:1': makePreviewPokemon('deposit-preview-box-1', 32, 5),
      '1:2': makePreviewPokemon('deposit-preview-box-2', 16, 5),
      '1:3': makePreviewPokemon('deposit-preview-box-3', 20, 5),
    },
  }
}

/** Preview the actual deposit view with a temporary team, without writing the game save. */
export function DepositLab() {
  const [preview, setPreview] = useState(createDepositPreview)
  const [revision, setRevision] = useState(0)

  const swap = (source: SlotRef, target: SlotRef) => {
    setPreview((current) => scambia(current.squadra, current.deposito, source, target))
  }

  const reset = () => {
    setPreview(createDepositPreview())
    setRevision((current) => current + 1)
  }

  return (
    <div className="arka-stage" data-deposit-preview="true">
      <DepositView
        key={revision}
        squadra={preview.squadra}
        deposito={preview.deposito}
        giocatoreNome="Anteprima"
        onSwap={swap}
        onBack={() => { window.location.hash = '' }}
      />
      <button
        type="button"
        className="deposit-preview-reset"
        title="Riporta la squadra e i box alla disposizione iniziale dell’anteprima."
        onClick={reset}
      >
        Ripristina anteprima
      </button>
    </div>
  )
}
