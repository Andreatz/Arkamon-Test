import { GameButton } from '@/components/ui/GameButton'
import { useSceneNavigation } from '@/components/transitions/SceneNavigationContext'
import { AdminLayoutItem } from '@/admin/AdminLayoutItem'
import { getBackground } from '@data/backgrounds'
import { getAllenatoriInLuogo, getPokemon } from '@data/index'
import { useAdminStore } from '@store/adminStore'
import { useGameStore } from '@store/gameStore'
import type { AdminLayoutRect, AdminLuogoLayoutKey } from '@/theme/adminThemeTypes'
import type { AllenatoreDef } from '@/types'
import { getLocalMap } from '@/data/localMaps'
import { LocalMapScene } from './LocalMapScene'
import { isTeamWithinLevelCap, teamCapMessage } from '@/engine/teamLevelCap'

const RICOMPENSA: Record<AllenatoreDef['tipo'], number> = {
  NPC: 200,
  Capopalestra: 1000,
  Superquattro: 0,
  Campione: 0,
  PVP: 0,
}

/**
 * Scena città: allenatori, Centro Pokémon e ritorno alla mappa.
 * Il layout admin è condiviso da tutte le città.
 */
export function CittaScene() {
  const scenaCorrente = useSceneNavigation()
  const giocatoreAttivo = useGameStore((s) => s.giocatoreAttivo)
  const giocatore = useGameStore((s) =>
    giocatoreAttivo === 1 ? s.giocatore1 : s.giocatore2
  )
  const vaiAScena = useGameStore((s) => s.vaiAScena)
  const iniziaBattagliaNPC = useGameStore((s) => s.iniziaBattagliaNPC)
  const curaSquadra = useGameStore((s) => s.curaSquadra)
  const consumaInterazione = useGameStore((s) => s.consumaInterazioneMappaLocale)
  const turno = useGameStore((s) => s.turnoOverworld)
  const fallbackActivity = useGameStore((s) => s.fallbackLocationActivity)
  const layoutEditing = useAdminStore((s) => s.layoutEditing)
  const luogoLayout = useAdminStore((s) => s.theme.layouts.luogo)
  const updateSceneLayout = useAdminStore((s) => s.updateSceneLayout)

  const luogo = (scenaCorrente.payload?.luogo as string) || 'Venezia'
  const localMap = getLocalMap(luogo)
  const interazioneDisponibile = localMap
    ? turno.giocatoreAttivo === giocatoreAttivo && turno.azioniRimaste > 0
    : fallbackActivity?.playerId === giocatoreAttivo && fallbackActivity.location === luogo
  const haPokemonVivi = giocatore.squadra.some((pokemon) => pokemon.hp > 0)
  const tutti = getAllenatoriInLuogo(luogo).filter((a) => a.tipo !== 'PVP')
  const allenatoriOrdinati = [...tutti].sort((a, b) => {
    if (a.tipo === b.tipo) return a.id - b.id
    return a.tipo === 'NPC' ? -1 : 1
  })

  const sfida = (allenatoreId: number) => {
    if (layoutEditing || !interazioneDisponibile || !haPokemonVivi || giocatore.allenatoriSconfitti.has(allenatoreId)) return
    if (!isTeamWithinLevelCap(giocatore.squadra)) { useGameStore.getState().aggiornaStato({ teamRuleMessage: teamCapMessage(giocatore.squadra) }); return }
    useGameStore.getState().eseguiTransazione(() => {
      if (!consumaInterazione(giocatoreAttivo, luogo)) return
      const ok = iniziaBattagliaNPC(allenatoreId, luogo)
      if (ok) vaiAScena('battaglia')
    })
  }

  const bg = getBackground(luogo)
  const updateLuogoLayout = (key: AdminLuogoLayoutKey, rect: AdminLayoutRect) =>
    updateSceneLayout({ scene: 'luogo', key, rect })

  const activities = (
    <div className="grid h-full w-full grid-cols-3 gap-4 overflow-y-auto p-1">
          {!haPokemonVivi && (
            <p role="status" className="arka-panel col-span-3 p-3 text-center text-amber-200">
              La squadra è esausta. Curala al Centro Pokémon per tornare a combattere.
            </p>
          )}
          <GameButton
            disabled={layoutEditing || !interazioneDisponibile}
            onClick={() => {
              useGameStore.getState().eseguiTransazione(() => {
                if (!consumaInterazione(giocatoreAttivo, luogo)) return
                curaSquadra(giocatoreAttivo)
              })
            }}
            className="col-span-1 flex cursor-pointer flex-col items-center justify-center p-6 hover:border-arka-accent"
          >
            <span className="arka-layout-content mb-2 text-6xl">🏥</span>
            <h3 className="arka-layout-content text-xl font-bold">Centro Pokémon</h3>
            <p className="arka-layout-content mt-1 text-center text-xs text-arka-text-muted">
              Cura tutta la squadra
            </p>
          </GameButton>

          {allenatoriOrdinati.map((a) => {
            const sconfitto = giocatore.allenatoriSconfitti.has(a.id)
            const primoPkmn = getPokemon(a.squadra[0]?.pokemonId)
            const isCapo = a.tipo === 'Capopalestra'
            const ricompensa = RICOMPENSA[a.tipo]
            return (
              <GameButton
                key={a.id}
                disabled={layoutEditing || !interazioneDisponibile || sconfitto || !haPokemonVivi}
                onClick={() => sfida(a.id)}
                className={`flex flex-col items-center justify-center p-6
                  ${sconfitto ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:border-arka-accent'}
                  ${isCapo && !sconfitto ? 'border-yellow-400 shadow-lg shadow-yellow-500/20' : ''}
                `}
              >
                <span className="arka-layout-content mb-2 text-6xl">
                  {sconfitto ? '✅' : isCapo ? '👑' : '🥋'}
                </span>
                <h3 className={`arka-layout-content text-xl font-bold ${isCapo && !sconfitto ? 'text-yellow-300' : ''}`}>
                  {a.nome}
                </h3>
                {isCapo && !sconfitto && (
                  <span className="arka-layout-content mt-0.5 text-[10px] uppercase tracking-wider text-yellow-300">
                    Capopalestra
                  </span>
                )}
                <p className="arka-layout-content mt-1 text-center text-xs text-arka-text-muted">
                  {sconfitto
                    ? 'Già sconfitto'
                    : primoPkmn
                    ? `Squadra: ${a.squadra.length}× (lv ${a.squadra[0].livello})`
                    : 'Allenatore'}
                </p>
                {!sconfitto && (
                  <span
                    className={`arka-layout-content mt-2 text-xs ${isCapo ? 'font-bold text-yellow-300' : 'text-yellow-400/80'}`}
                  >
                    +{ricompensa}₳ se vinci
                  </span>
                )}
              </GameButton>
            )
          })}

          {allenatoriOrdinati.length === 0 && (
            <div className="arka-panel col-span-2 flex items-center justify-center p-6">
              <p className="arka-layout-content italic text-arka-text-muted">
                Nessun allenatore in questa città
              </p>
            </div>
          )}
        </div>
  )

  if (localMap) return <LocalMapScene key={luogo} map={localMap} activities={activities} />

  return (
    <div
      data-citta-layout-root
      className="relative h-full w-full overflow-hidden bg-gradient-to-b from-rose-900 via-rose-700 to-amber-700 bg-cover bg-center"
      style={bg ? { backgroundImage: `url(${bg})` } : undefined}
    >
      <AdminLayoutItem
        rootSelector="[data-citta-layout-root]"
        label="Indietro"
        rect={luogoLayout.backButton}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('backButton', rect)}
      >
        <GameButton
          className="arka-layout-content h-full w-full px-3 py-2 text-sm"
          onClick={() => vaiAScena('mappa-principale')}
        >
          ← Torna alla mappa
        </GameButton>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-citta-layout-root]"
        label="Turno"
        rect={luogoLayout.turnPanel}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('turnPanel', rect)}
      >
        <div className="arka-panel flex h-full w-full items-center justify-center px-3 py-2">
          <span className="arka-layout-content text-xs text-arka-text-muted">Turno di:</span>
          <span className="arka-layout-content ml-2 font-bold text-arka-accent">
            {giocatore.nome}
          </span>
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-citta-layout-root]"
        label="Monete"
        rect={luogoLayout.coinsPanel}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('coinsPanel', rect)}
      >
        <div className="arka-panel flex h-full w-full items-center justify-center px-3 py-2">
          <span className="arka-layout-content text-xs text-arka-text-muted">Monete:</span>
          <span className="arka-layout-content ml-2 font-bold text-yellow-300">
            ₳ {giocatore.monete}
          </span>
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-citta-layout-root]"
        label="Titolo"
        rect={luogoLayout.title}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('title', rect)}
      >
        <h2 className="arka-layout-content arka-readable-title flex h-full w-full items-center justify-center text-center text-4xl font-bold text-white">
          {luogo}
        </h2>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-citta-layout-root]"
        label="Sottotitolo"
        rect={luogoLayout.subtitle}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('subtitle', rect)}
      >
        <p className="arka-layout-content arka-readable-text flex h-full w-full items-center justify-center text-center italic text-arka-text-muted">
          Sfida gli allenatori o cura la tua squadra al Centro Pokémon
        </p>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-citta-layout-root]"
        label="Attività"
        rect={luogoLayout.contentGrid}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('contentGrid', rect)}
        zIndex={10}
      >
        {activities}
      </AdminLayoutItem>
    </div>
  )
}
