import { useSceneInputBlocked } from '@/components/transitions/SceneNavigationContext'
/**
 * Scena overworld a griglia (Fasi E.3 → E.5).
 *
 * Registry di mappe dummy hardcoded: la scena legge la mappa corrente da
 * `posizione[N].mappaId` (giocatore attivo). Le caselle `uscita` con
 * `versoMappaId` corrispondente a un'altra mappa del registry triggerano una
 * transizione interna alla scena (con fade); le uscite verso
 * `mappa-principale` vanno alla vecchia scena 2D.
 *
 * Controlli:
 *   - click su casella adiacente calpestabile → muove
 *   - click su casella interagibile adiacente → interagisce
 *   - WASD / frecce → muovono nella direzione corrispondente
 *   - barra spaziatrice → tenta interazione sulla casella di fronte
 *   - tasto "Passa il turno" forza lo swap
 */
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@store/gameStore'
import { useAdminStore } from '@store/adminStore'
import { AdminLayoutItem } from '@/admin/AdminLayoutItem'
import {
  caselleAdiacenti,
  chiaveCasellaConsumata,
  puòInteragire,
  puòMuoversi,
} from '@engine/movimento'
import type { RisultatoInterazione } from '@engine/movimento'
import { calcolaHPMax, determinaIniziativa } from '@engine/battleEngine'
import { generaIncontroDaCespuglio } from '@engine/encounters'
import { getIncontri } from '@data/index'
import { MAPPE_GRIGLIA, PERCORSO_1 } from '@data/mappe-griglia'
import { assetUrl } from '@/utils/assetUrl'
import type { AdminLayoutRect, AdminMapGridLayoutKey } from '@/theme/adminThemeTypes'
import type {
  Casella,
  MappaGriglia,
  PokemonIstanza,
  PosizioneAvatar,
  StatoBattaglia,
  StatoGiocatore,
} from '@/types'

// ----------------------------------------------------------------
// DUMMY MAP 10x10
// ----------------------------------------------------------------

/** Registry delle mappe-griglia disponibili (Fase E.6 → src/data/mappe-griglia). */
const REGISTRY: Record<string, MappaGriglia> = MAPPE_GRIGLIA

/** Mappa di partenza se l'avatar è su una mappa non registrata. */
const MAPPA_DI_DEFAULT = PERCORSO_1

// Etichette breve per overlay nelle celle
function etichettaCasella(c: Casella): string {
  switch (c.tipo) {
    case 'cespuglio':
      return 'ERBA'
    case 'allenatore':
      return 'NPC'
    case 'edificio':
      return c.edificioId === 'centro'
        ? 'PKMN'
        : c.edificioId === 'deposito'
        ? 'BOX'
        : c.edificioId === 'palestra'
        ? 'GYM'
        : 'LAB'
    case 'uscita':
      return 'EXIT'
    case 'ostacolo':
      return ''
    default:
      return ''
  }
}

function coloreCasella(c: Casella): string {
  switch (c.tipo) {
    case 'ostacolo':
      return 'bg-slate-900'
    case 'cespuglio':
      return 'bg-emerald-700/40'
    case 'allenatore':
      return 'bg-rose-700/40'
    case 'edificio':
      return 'bg-amber-700/40'
    case 'uscita':
      return 'bg-indigo-700/40'
    default:
      return 'bg-emerald-900/30'
  }
}

function useViewportSize() {
  const [size, setSize] = useState({ width: 1280, height: 720 })

  useEffect(() => {
    const update = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return size
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function nomeDirezione(d: PosizioneAvatar['direzione']): string {
  switch (d) {
    case 'N':
      return 'N'
    case 'S':
      return 'S'
    case 'E':
      return 'E'
    case 'O':
      return 'O'
  }
}

// ----------------------------------------------------------------
// AVATAR
// ----------------------------------------------------------------

/** Restituisce il "leader" della squadra: primo Pokémon vivo (o primo). */
function leaderSquadra(g: StatoGiocatore): PokemonIstanza | null {
  return g.squadra.find((p) => p.hp > 0) ?? g.squadra[0] ?? null
}

interface AvatarSlotProps {
  giocatoreId: 1 | 2
  pos: PosizioneAvatar
  cella: number
  attivo: boolean
  leader: PokemonIstanza | null
}

/**
 * Avatar di un giocatore: usa lo sprite back del leader della squadra
 * (analogamente al Pokémon "che ti segue" dei Pokémon GBA). Se la squadra
 * è vuota, fallback a un cerchio colorato con il numero del giocatore.
 * Ring colorato (rosa G1 / azzurro G2) e pulsante luminoso quando il
 * giocatore è attivo.
 */
function AvatarSlot({ giocatoreId, pos, cella, attivo, leader }: AvatarSlotProps) {
  const ringColor = giocatoreId === 1 ? 'ring-rose-400' : 'ring-sky-400'
  const bgColor = giocatoreId === 1 ? 'bg-rose-500' : 'bg-sky-500'
  const textColor = giocatoreId === 1 ? 'text-rose-100' : 'text-sky-100'
  const avatarSize = Math.max(24, cella - 8)

  return (
    <motion.div
      className="absolute pointer-events-none flex items-center justify-center"
      style={{ width: cella, height: cella }}
      animate={{ x: pos.x * cella, y: pos.y * cella }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      <motion.div
        className={[
          'relative flex items-center justify-center rounded-full border-2 border-white shadow-xl',
          'ring-2 ring-offset-2 ring-offset-black/40',
          ringColor,
          attivo ? 'shadow-white/40' : 'opacity-90',
        ].join(' ')}
        style={{ width: avatarSize, height: avatarSize }}
        animate={attivo ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={
          attivo
            ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }
        }
      >
        <div className="absolute inset-0 overflow-hidden rounded-full bg-black/45">
          {leader ? (
            <img
              src={assetUrl(`/sprites/back_sprites/${leader.specieId}.png`)}
              alt={leader.nome}
              className="h-full w-full object-contain"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
              draggable={false}
            />
          ) : (
            <div
              className={`h-full w-full ${bgColor} flex items-center justify-center text-xs font-bold text-white`}
            >
              {giocatoreId}
            </div>
          )}
        </div>
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow">
          G{giocatoreId}
        </div>
        <div
          className={`absolute -bottom-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full ${bgColor} border border-white px-1 text-[10px] font-bold text-white shadow`}
        >
          {nomeDirezione(pos.direzione)}
        </div>
        {attivo && (
          <div
            className={`absolute -bottom-6 left-1/2 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-bold leading-none ${textColor} shadow`}
          >
            ATTIVO
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ----------------------------------------------------------------
// SCENA
// ----------------------------------------------------------------

export function MappaGrigliaScene() {
  const sceneInputBlocked = useSceneInputBlocked()
  const vaiAScena = useGameStore((s) => s.vaiAScena)
  const posizione1 = useGameStore((s) => s.posizione1)
  const posizione2 = useGameStore((s) => s.posizione2)
  const turno = useGameStore((s) => s.turnoOverworld)
  const giocatore1 = useGameStore((s) => s.giocatore1)
  const giocatore2 = useGameStore((s) => s.giocatore2)
  const muoviAvatar = useGameStore((s) => s.muoviAvatar)
  const interagisciCasella = useGameStore((s) => s.interagisciCasella)
  const passaTurnoOverworld = useGameStore((s) => s.passaTurnoOverworld)
  const iniziaBattaglia = useGameStore((s) => s.iniziaBattaglia)
  const iniziaBattagliaNPC = useGameStore((s) => s.iniziaBattagliaNPC)
  const curaSquadra = useGameStore((s) => s.curaSquadra)
  const viewport = useViewportSize()
  const layoutEditing = useAdminStore((s) => s.layoutEditing)
  const mapGridLayout = useAdminStore((s) => s.theme.layouts.mapGrid)
  const updateSceneLayout = useAdminStore((s) => s.updateSceneLayout)

  const [mostraDebug, setMostraDebug] = useState(false)
  const [transizione, setTransizione] = useState<{
    da: string
    a: string
    giocatoreId: 1 | 2
  } | null>(null)
  const [log, setLog] = useState<string[]>([
    "Benvenuto nell'overworld a griglia.",
    'Movimento: WASD/frecce o click. Spazio per interagire.',
  ])
  const updateMapGridLayout = (key: AdminMapGridLayoutKey, rect: AdminLayoutRect) =>
    updateSceneLayout({ scene: 'mapGrid', key, rect })

  // La mappa visualizzata segue il giocatore attivo. In assenza di una mappa
  // valida nel registry (es. avatar ancora su `mappa-principale`), usa il
  // default e allinea le posizioni nel useEffect sotto.
  const posAttivo = turno.giocatoreAttivo === 1 ? posizione1 : posizione2
  const mappa = REGISTRY[posAttivo.mappaId] ?? MAPPA_DI_DEFAULT
  const giocatoreAttivo =
    turno.giocatoreAttivo === 1 ? giocatore1 : giocatore2
  const nomeGiocatore = (giocatoreId: 1 | 2) =>
    giocatoreId === 1 ? giocatore1.nome : giocatore2.nome

  useEffect(() => {
    if (!transizione) return
    const id = window.setTimeout(() => setTransizione(null), 1600)
    return () => window.clearTimeout(id)
  }, [transizione])

  // Allinea le posizioni degli avatar al registry al primo mount: se uno dei
  // due avatar è su una mappa non disponibile (es. `mappa-principale`),
  // viene riportato sullo spawn della mappa di default.
  useEffect(() => {
    if (!REGISTRY[posizione1.mappaId]) {
      useGameStore.getState().aggiornaStato({
        posizione1: {
          mappaId: MAPPA_DI_DEFAULT.id,
          ...MAPPA_DI_DEFAULT.spawnDefault,
          direzione: 'S',
        },
      })
    }
    if (!REGISTRY[posizione2.mappaId]) {
      useGameStore.getState().aggiornaStato({
        posizione2: {
          mappaId: MAPPA_DI_DEFAULT.id,
          x: MAPPA_DI_DEFAULT.larghezza - 1,
          y: MAPPA_DI_DEFAULT.altezza - 1,
          direzione: 'N',
        },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Caselle adiacenti che il giocatore attivo può raggiungere/interagire
  const adiacenti = useMemo(
    () => caselleAdiacenti(posAttivo, mappa),
    [posAttivo, mappa]
  )
  const movibili = useMemo(
    () =>
      adiacenti.filter((a) =>
        puòMuoversi(posAttivo, a, mappa)
      ),
    [adiacenti, posAttivo, mappa]
  )
  const interagibili = useMemo(
    () =>
      adiacenti.filter((a) => {
        const c = mappa.caselle[a.y]?.[a.x]
        if (!c) return false
        return puòInteragire(mappa.id, a.x, a.y, c, {
          caselleConsumate: giocatoreAttivo.caselleConsumate,
          allenatoriSconfitti: giocatoreAttivo.allenatoriSconfitti,
        })
      }),
    [adiacenti, mappa, giocatoreAttivo.caselleConsumate, giocatoreAttivo.allenatoriSconfitti]
  )

  const isMovibile = (x: number, y: number) =>
    movibili.some((m) => m.x === x && m.y === y)
  const isInteragibile = (x: number, y: number) =>
    interagibili.some((m) => m.x === x && m.y === y)

  const aggiungiLog = (msg: string) =>
    setLog((l) => [...l.slice(-4), msg])

  const direzioneVerso = (
    dx: number,
    dy: number
  ): PosizioneAvatar['direzione'] => {
    if (dy < 0) return 'N'
    if (dy > 0) return 'S'
    if (dx > 0) return 'E'
    return 'O'
  }

  const tentaMovimento = (dx: number, dy: number) => {
    if (layoutEditing) return
    const nuova: PosizioneAvatar = {
      mappaId: mappa.id,
      x: posAttivo.x + dx,
      y: posAttivo.y + dy,
      direzione: direzioneVerso(dx, dy),
    }
    const ok = muoviAvatar(turno.giocatoreAttivo, nuova, mappa)
    if (!ok) aggiungiLog('Non puoi muoverti lì.')
  }

  const cellaClick = (x: number, y: number) => {
    if (layoutEditing) return
    if (isInteragibile(x, y)) {
      eseguiInterazione(x, y)
      return
    }
    if (isMovibile(x, y)) {
      tentaMovimento(x - posAttivo.x, y - posAttivo.y)
    }
  }

  /**
   * Sequenza interazione (E.4):
   *   1. Pre-check: se è una battaglia, il giocatore attivo deve avere
   *      almeno un Pokémon vivo (altrimenti niente, log d'errore).
   *   2. Allinea `giocatoreAttivo` al `turnoOverworld.giocatoreAttivo`
   *      (lo store delle battaglie ne ha bisogno per attribuire la squadra).
   *   3. Chiama `interagisciCasella` (consuma casella, chiude turno overworld).
   *   4. In base al risultato, scatena la scena vera o l'effetto.
   */
  const eseguiInterazione = (x: number, y: number) => {
    if (layoutEditing) return
    const giocatoreId = turno.giocatoreAttivo
    const casella = mappa.caselle[y]?.[x]
    if (!casella) return

    // Pre-check: niente battaglia senza un Pokémon vivo
    if (
      (casella.tipo === 'cespuglio' || casella.tipo === 'allenatore') &&
      !giocatoreAttivo.squadra.some((p) => p.hp > 0)
    ) {
      aggiungiLog(
        `${nomeGiocatore(giocatoreId)} non ha Pokémon vivi: impossibile combattere.`
      )
      return
    }

    // Allinea il giocatoreAttivo "di battaglia" al turno overworld
    useGameStore.getState().eseguiTransazione(read => {
      read().aggiornaStato({ giocatoreAttivo: giocatoreId })
      const r = interagisciCasella(giocatoreId, mappa, x, y)
      handleRisultato(r, read())
    })
  }

  const handleRisultato = (r: RisultatoInterazione, state: ReturnType<typeof useGameStore.getState>) => {
    switch (r.tipo) {
      case 'battaglia-selvatica': {
        const incontri = getIncontri(mappa.id, r.cespuglioId)
        const selvatico = generaIncontroDaCespuglio(incontri)
        const giocId = state.giocatoreAttivo
        const g = giocId === 1 ? state.giocatore1 : state.giocatore2
        const primo = g.squadra.find((p) => p.hp > 0)
        if (!selvatico || !primo) {
          aggiungiLog('Nessun Pokémon nel cespuglio.')
          return
        }
        const battaglia: StatoBattaglia = {
          tipo: 'Selvatico',
          pokemonA: primo,
          pokemonB: selvatico,
          hpMaxA: calcolaHPMax(primo),
          hpMaxB: calcolaHPMax(selvatico),
          turnoCorrente: determinaIniziativa(primo.livello, selvatico.livello, Math.random, primo.stato?.tipo, selvatico.stato?.tipo),
          luogoRitorno: 'mappa-griglia',
          log: [`Appare ${selvatico.nome} selvatico!`],
          evoluzioneInAttesa: null,
        }
        iniziaBattaglia(battaglia)
        vaiAScena('battaglia')
        break
      }
      case 'battaglia-npc': {
        const ok = iniziaBattagliaNPC(r.allenatoreId, 'mappa-griglia')
        if (!ok) {
          aggiungiLog(`Impossibile sfidare l'allenatore #${r.allenatoreId}.`)
          return
        }
        vaiAScena('battaglia')
        break
      }
      case 'edificio': {
        const giocId = state.giocatoreAttivo
        if (r.edificioId === 'centro') {
          curaSquadra(giocId)
          aggiungiLog(
            `Centro Pokémon: la squadra di ${nomeGiocatore(giocId)} è stata curata.`
          )
        } else if (r.edificioId === 'deposito') {
          vaiAScena('deposito')
        } else {
          aggiungiLog(`Edificio ${r.edificioId}: non ancora implementato.`)
        }
        break
      }
      case 'transizione-mappa':
        if (r.versoMappaId === 'mappa-principale') {
          setTransizione({
            da: mappa.id,
            a: 'mappa-principale',
            giocatoreId: state.giocatoreAttivo,
          })
          aggiungiLog('Uscita verso la mappa principale.')
          vaiAScena('mappa-principale')
        } else if (REGISTRY[r.versoMappaId]) {
          // Transizione interna alla scena: lo store ha già spostato l'avatar
          // sullo spawn della mappa di destinazione. La scena reagisce al
          // cambio di `mappa.id` con un fade automatico.
          setTransizione({
            da: mappa.id,
            a: r.versoMappaId,
            giocatoreId: state.giocatoreAttivo,
          })
          aggiungiLog(`Sei entrato in: ${r.versoMappaId}.`)
        } else {
          aggiungiLog(`Mappa "${r.versoMappaId}" non disponibile.`)
        }
        break
      case 'dialogo':
        aggiungiLog(`Dialogo: ${r.dialogoId}.`)
        break
      default:
        aggiungiLog('Niente da fare qui.')
    }
  }

  const tentaInterazioneFronte = () => {
    const dx =
      posAttivo.direzione === 'E' ? 1 : posAttivo.direzione === 'O' ? -1 : 0
    const dy =
      posAttivo.direzione === 'S' ? 1 : posAttivo.direzione === 'N' ? -1 : 0
    const tx = posAttivo.x + dx
    const ty = posAttivo.y + dy
    if (!isInteragibile(tx, ty)) {
      aggiungiLog("Niente da interagire di fronte a te.")
      return
    }
    eseguiInterazione(tx, ty)
  }

  // Tastiera
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sceneInputBlocked || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, button, a, [role="tab"], [contenteditable="true"], .arka-admin-panel, [role="dialog"]')) return
      const k = e.key.toLowerCase()
      if (k === 'w' || k === 'arrowup') {
        e.preventDefault()
        tentaMovimento(0, -1)
      } else if (k === 's' || k === 'arrowdown') {
        e.preventDefault()
        tentaMovimento(0, 1)
      } else if (k === 'a' || k === 'arrowleft') {
        e.preventDefault()
        tentaMovimento(-1, 0)
      } else if (k === 'd' || k === 'arrowright') {
        e.preventDefault()
        tentaMovimento(1, 0)
      } else if (k === ' ' || k === 'spacebar') {
        e.preventDefault()
        tentaInterazioneFronte()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posAttivo, turno, mappa, sceneInputBlocked])

  const areaMappa = useMemo(
    () => ({
      width: Math.max(320, viewport.width - 96),
      height: Math.max(260, viewport.height - 220),
    }),
    [viewport]
  )

  const CELLA = useMemo(() => {
    const lato = Math.min(
      areaMappa.width / mappa.larghezza,
      areaMappa.height / mappa.altezza
    )
    return Math.floor(Math.max(28, Math.min(64, lato)))
  }, [areaMappa, mappa.larghezza, mappa.altezza])

  const dimensioniGriglia = useMemo(
    () => ({
      width: mappa.larghezza * CELLA,
      height: mappa.altezza * CELLA,
    }),
    [mappa.larghezza, mappa.altezza, CELLA]
  )

  const dimensioniViewportGriglia = useMemo(
    () => ({
      width: Math.min(areaMappa.width, dimensioniGriglia.width),
      height: Math.min(areaMappa.height, dimensioniGriglia.height),
    }),
    [areaMappa, dimensioniGriglia]
  )

  const camera = useMemo(() => {
    const targetX = dimensioniViewportGriglia.width / 2 - (posAttivo.x + 0.5) * CELLA
    const targetY = dimensioniViewportGriglia.height / 2 - (posAttivo.y + 0.5) * CELLA
    const minX = Math.min(0, dimensioniViewportGriglia.width - dimensioniGriglia.width)
    const minY = Math.min(0, dimensioniViewportGriglia.height - dimensioniGriglia.height)

    return {
      x: clamp(targetX, minX, 0),
      y: clamp(targetY, minY, 0),
    }
  }, [CELLA, dimensioniGriglia, dimensioniViewportGriglia, posAttivo.x, posAttivo.y])

  return (
    <div
      data-admin-layout-root
      className="relative w-full h-full bg-slate-950 overflow-hidden flex flex-col bg-cover bg-center"
      style={
        mappa.background
          ? { backgroundImage: `url(${assetUrl(mappa.background)})` }
          : undefined
      }
    >
      {mappa.background && <div className="absolute inset-0 bg-black/55 z-0" />}
      <AnimatePresence>
        {transizione && (
          <motion.div
            key={`${transizione.da}-${transizione.a}`}
            className="absolute left-1/2 top-20 z-40 w-[min(520px,calc(100%-2rem))] rounded-md border border-white/15 bg-black/80 px-4 py-3 text-center shadow-2xl"
            initial={{ opacity: 0, x: '-50%', y: -14, scale: 0.96 }}
            animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: -10, scale: 0.98 }}
            transition={{ duration: 0.22 }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-arka-text-muted">
              Transizione mappa - {nomeGiocatore(transizione.giocatoreId)}
            </div>
            <div className="mt-1 flex items-center justify-center gap-3 text-sm font-bold text-white">
              <span className="max-w-[12rem] truncate">{transizione.da}</span>
              <span className="text-arka-accent">verso</span>
              <span className="max-w-[12rem] truncate">{transizione.a}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* HUD */}
      <AdminLayoutItem
        rootSelector="[data-admin-layout-root]"
        label="HUD mappa"
        rect={mapGridLayout.hud}
        editing={layoutEditing}
        onChange={(rect) => updateMapGridLayout('hud', rect)}
        zIndex={30}
      >
      <div className="flex h-full w-full justify-between items-center">
        <div className="flex gap-2">
          <div className="arka-panel px-4 py-2">
            <span className="arka-layout-content text-arka-text-muted text-xs">Turno di:</span>
            <span
              className={`arka-layout-content font-bold ml-2 ${
                turno.giocatoreAttivo === 1 ? 'text-rose-300' : 'text-sky-300'
              }`}
            >
              {giocatoreAttivo.nome}
            </span>
          </div>
          <div className="arka-panel px-4 py-2">
            <span className="arka-layout-content text-arka-text-muted text-xs">Azioni:</span>
            <span className="arka-layout-content text-arka-accent font-bold ml-2">
              {turno.azioniRimaste} / 2
            </span>
          </div>
          <div className="arka-panel px-4 py-2">
            <span className="arka-layout-content text-arka-text-muted text-xs">Mappa:</span>
            <span className="arka-layout-content text-white font-bold ml-2">{mappa.id}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMostraDebug((v) => !v)}
            className="arka-button-secondary text-xs py-1 px-3"
            aria-pressed={mostraDebug}
          >
            <span className="arka-layout-content">Debug griglia</span>
          </button>
          <button
            onClick={() => passaTurnoOverworld()}
            className="arka-button-secondary text-xs py-1 px-3"
          >
            <span className="arka-layout-content">Passa turno</span>
          </button>
          <button
            onClick={() => vaiAScena('mappa-principale')}
            className="arka-button-secondary text-xs py-1 px-3"
          >
            <span className="arka-layout-content">← Mappa principale</span>
          </button>
        </div>
      </div>
      </AdminLayoutItem>

      {/* Griglia con camera che segue il giocatore attivo (E.9) */}
      <AdminLayoutItem
        rootSelector="[data-admin-layout-root]"
        label="Griglia"
        rect={mapGridLayout.grid}
        editing={layoutEditing}
        onChange={(rect) => updateMapGridLayout('grid', rect)}
        zIndex={10}
      >
      <div className="flex h-full w-full items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={mappa.id}
            className="relative overflow-hidden rounded-md border border-white/10 bg-slate-950/45 shadow-2xl"
            style={{
              width: dimensioniViewportGriglia.width,
              height: dimensioniViewportGriglia.height,
            }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.35 }}
          >
            <motion.div
              className="absolute left-2 top-2 z-20 rounded bg-black/65 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
            >
              {mappa.id}
            </motion.div>
            <motion.div
              className="absolute left-0 top-0"
              style={{
                width: dimensioniGriglia.width,
                height: dimensioniGriglia.height,
              }}
              animate={{ x: camera.x, y: camera.y }}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            >
            {/* Caselle */}
            {mappa.caselle.map((riga, y) =>
              riga.map((c, x) => {
                const movibile = isMovibile(x, y)
                const interagibile = isInteragibile(x, y)
                const cliccabile = movibile || interagibile
                const chiaveConsumata = chiaveCasellaConsumata(mappa.id, x, y, c)
                const consumata =
                  !!chiaveConsumata &&
                  giocatoreAttivo.caselleConsumate.has(chiaveConsumata)
                return (
                  <button
                    key={`${x}-${y}`}
                    onClick={() => cellaClick(x, y)}
                    disabled={!cliccabile}
                    title={consumata ? 'Gia consumata per questo giocatore' : undefined}
                    className={[
                      'absolute border border-slate-700/60 flex items-center justify-center text-base',
                      coloreCasella(c),
                      cliccabile ? 'cursor-pointer' : 'cursor-default',
                      movibile ? 'ring-2 ring-sky-400 ring-inset' : '',
                      interagibile ? 'ring-2 ring-amber-300 ring-inset' : '',
                      consumata ? 'opacity-35 grayscale' : '',
                    ].join(' ')}
                    style={{
                      left: x * CELLA,
                      top: y * CELLA,
                      width: CELLA,
                      height: CELLA,
                    }}
                  >
                    <span className="px-0.5 text-center text-[9px] font-bold leading-none opacity-85">
                      {mostraDebug ? `${x},${y}` : consumata ? 'OK' : etichettaCasella(c)}
                    </span>
                  </button>
                )
              })
            )}

            {/* Avatar G2 (sotto, così G1 è sopra in caso di sovrapposizione) */}
            {posizione2.mappaId === mappa.id && (
              <AvatarSlot
                giocatoreId={2}
                pos={posizione2}
                cella={CELLA}
                attivo={turno.giocatoreAttivo === 2}
                leader={leaderSquadra(giocatore2)}
              />
            )}

            {/* Avatar G1 */}
            {posizione1.mappaId === mappa.id && (
              <AvatarSlot
                giocatoreId={1}
                pos={posizione1}
                cella={CELLA}
                attivo={turno.giocatoreAttivo === 1}
                leader={leaderSquadra(giocatore1)}
              />
            )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
      </AdminLayoutItem>

      {/* Log + leggenda */}
      <AdminLayoutItem
        rootSelector="[data-admin-layout-root]"
        label="Log"
        rect={mapGridLayout.bottomLog}
        editing={layoutEditing}
        onChange={(rect) => updateMapGridLayout('bottomLog', rect)}
        zIndex={30}
      >
        <div className="arka-panel h-full w-full overflow-hidden px-3 py-2">
          <div className="arka-layout-content text-arka-text-muted text-[10px] uppercase mb-1">
            Log
          </div>
          <div className="text-xs space-y-0.5">
            {log.slice(-4).map((m, i) => (
              <div key={i} className="arka-layout-content text-white/90">
                {m}
              </div>
            ))}
          </div>
        </div>
      </AdminLayoutItem>
      <AdminLayoutItem
        rootSelector="[data-admin-layout-root]"
        label="Legenda"
        rect={mapGridLayout.legend}
        editing={layoutEditing}
        onChange={(rect) => updateMapGridLayout('legend', rect)}
        zIndex={30}
      >
        <div className="arka-panel flex h-full w-full flex-col gap-0.5 overflow-hidden px-3 py-2 text-[10px]">
          <div className="arka-layout-content text-arka-text-muted uppercase tracking-wide">
            Leggenda
          </div>
          <div className="arka-layout-content flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm ring-2 ring-sky-400" />
            Movibile
          </div>
          <div className="arka-layout-content flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm ring-2 ring-amber-300" />
            Interagibile
          </div>
          <div className="arka-layout-content flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-emerald-700/60" />
            ERBA Cespuglio
          </div>
          <div className="arka-layout-content flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-rose-700/60" />
            NPC Allenatore
          </div>
          <div className="arka-layout-content flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-amber-700/60" />
            PKMN/BOX Edificio
          </div>
          <div className="arka-layout-content flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-indigo-700/60" />
            EXIT Uscita
          </div>
          <div className="arka-layout-content flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-white/20 grayscale opacity-40" />
            OK Consumata
          </div>
          <div className="arka-layout-content flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-slate-900" />
            Ostacolo
          </div>
        </div>
      </AdminLayoutItem>
    </div>
  )
}
