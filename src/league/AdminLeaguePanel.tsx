import { useState } from 'react'
import { POKEMON_BASE, ALLENATORI } from '@/data'
import { useGameStore } from '@/store/gameStore'
import { draftLeagueConfiguration, leagueConfigurationProblems, type LeagueConfiguration, type LeagueOpponent } from './leagueModel'

export function AdminLeaguePanel() {
  const league = useGameStore((s) => s.league)
  const [draft, setDraft] = useState<LeagueConfiguration>(() => structuredClone(league.config ?? draftLeagueConfiguration()))
  const [message, setMessage] = useState('')
  const locked = league.players[1].attempt > 0 || league.players[2].attempt > 0
  function updateOpponent(index: number, opponent: LeagueOpponent) {
    setDraft((previous) => index === 4 ? { ...previous, champion: opponent } : { ...previous, opponents: previous.opponents.map((p, i) => i === index ? opponent : p) as LeagueConfiguration['opponents'] })
  }
  const opponents = draft.championEnabled ? [...draft.opponents, draft.champion ?? { name: '', team: [] }] : draft.opponents
  return <section aria-label="Configurazione Lega" className="space-y-5">
    <div><h3 className="text-lg font-bold">Lega e Campione della regione</h3><p className="mt-2">Quattro battaglie consecutive nello stesso turno. I nomi e le squadre vengono definiti qui; nessun avversario viene inventato dal gioco.</p></div>
    <fieldset disabled={locked} className="space-y-5"><legend className="sr-only">Regole e avversari della Lega</legend>
      <label className="block">Dopo una sconfitta<select className="block mt-2 w-full rounded border bg-[var(--arka-bg)] p-2" aria-label="Regola sconfitta Lega" value={draft.defeat ?? ''} onChange={(e) => setDraft({ ...draft, defeat: e.target.value === 'restart' ? 'restart' : e.target.value === 'retry-stage' ? 'retry-stage' : null })}><option value="">Da confermare</option><option value="restart">Nuovo tentativo dal primo incontro</option><option value="retry-stage">Riprendi dall’incontro raggiunto</option></select></label>
      <p>Le cure restano esplicite: puoi usare gli oggetti già presenti nella tua borsa fra gli incontri. Nessuna cura automatica e nessun negozio nella Lega.</p>
      <label className="block">Campione dopo i quattro Superquattro<select className="block mt-2 w-full rounded border bg-[var(--arka-bg)] p-2" aria-label="Campione finale Lega" value={draft.championEnabled === null ? '' : String(draft.championEnabled)} onChange={(e) => setDraft({ ...draft, championEnabled: e.target.value === '' ? null : e.target.value === 'true' })}><option value="">Da confermare</option><option value="false">La vittoria arriva dopo il quarto incontro</option><option value="true">Aggiungi un quinto incontro con il Campione</option></select></label>
      {opponents.map((opponent, index) => <fieldset key={index} className="space-y-3 rounded border border-[var(--arka-border)] p-3"><legend className="px-2 font-bold">{index === 4 ? 'Campione' : `Superquattro ${index + 1}`}</legend>
        <label className="block">Nome<input className="block mt-2 w-full rounded border bg-[var(--arka-bg)] p-2" aria-label={`Nome avversario Lega ${index + 1}`} value={opponent.name} maxLength={80} onChange={(e) => updateOpponent(index, { ...opponent, name: e.target.value })} /></label>
        <label className="block">Copia una squadra esistente<select className="block mt-2 w-full rounded border bg-[var(--arka-bg)] p-2" aria-label={`Squadra modello Lega ${index + 1}`} defaultValue="" onChange={(e) => { const trainer = ALLENATORI.find((p) => p.id === Number(e.target.value)); if (trainer) updateOpponent(index, { ...opponent, team: structuredClone(trainer.squadra) }) }}><option value="">Scegli un modello, oppure aggiungi Arkamon</option>{ALLENATORI.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.nome}</option>)}</select></label>
        {opponent.team.map((member, slot) => <div key={slot} className="grid grid-cols-[1fr_70px_auto] gap-2"><select className="min-w-0 rounded border bg-[var(--arka-bg)] p-2" aria-label={`Arkamon ${slot + 1} avversario Lega ${index + 1}`} value={member.pokemonId} onChange={(e) => updateOpponent(index, { ...opponent, team: opponent.team.map((p, i) => i === slot ? { ...p, pokemonId: Number(e.target.value) } : p) })}><option value={0}>Scegli specie</option>{POKEMON_BASE.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.nome}</option>)}</select>
          <input className="min-w-0 rounded border bg-[var(--arka-bg)] p-2" aria-label={`Livello Arkamon ${slot + 1} avversario Lega ${index + 1}`} type="number" min={5} max={100} value={member.livello} onChange={(e) => updateOpponent(index, { ...opponent, team: opponent.team.map((p, i) => i === slot ? { ...p, livello: Number(e.target.value) } : p) })} />
          <button className="rounded border px-2" aria-label={`Rimuovi Arkamon ${slot + 1} avversario Lega ${index + 1}`} onClick={() => updateOpponent(index, { ...opponent, team: opponent.team.filter((_, i) => i !== slot) })}>×</button></div>)}
        <button className="rounded border px-3 py-2" disabled={opponent.team.length >= 6} onClick={() => updateOpponent(index, { ...opponent, team: [...opponent.team, { pokemonId: 0, livello: 5 }] })}>Aggiungi Arkamon</button>
      </fieldset>)}
      <button className="rounded border px-3 py-2 font-bold" onClick={() => setMessage(useGameStore.getState().configuraLega(draft).message)}>Salva configurazione Lega</button>
    </fieldset>
    {locked && <p>Il primo tentativo è già iniziato. Regole e squadre restano fisse per entrambi i giocatori.</p>}
    <div role="status"><p>{message}</p>{leagueConfigurationProblems(league.config).length > 0 && <p className="mt-2">La Lega salvata è incompleta: non può ancora iniziare.</p>}</div>
  </section>
}
