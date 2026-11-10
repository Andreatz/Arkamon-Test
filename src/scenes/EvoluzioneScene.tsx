import { RpgCommand, RpgFrame } from '@/components/rpg'
import './rpgScenes.css'
import { useSceneNavigation } from '@/components/transitions/SceneNavigationContext'
import { useGameStore } from '@store/gameStore'
import { useAdminStore } from '@store/adminStore'
import { AdminLayoutItem } from '@/admin/AdminLayoutItem'
import { getPokemon } from '@data/index'
import { calcolaHPMax } from '@engine/battleEngine'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { EVOLUTION_BG } from '@data/backgrounds'
import { assetUrl } from '@/utils/assetUrl'
import { playSound } from '@/utils/soundManager'
import { useGameMotionPreferences, getAnimationDuration } from '@/settings/gamePreferences'
import { getPortraitFraming } from '@/player-ui/portraitFraming'
import type { AdminEvolutionLayoutKey, AdminLayoutRect } from '@/theme/adminThemeTypes'
import type { PokemonIstanza } from '@/types'
import { useRegiaStore } from '@/regia/regiaStore'

/**
 * Scena Evoluzione: animazione per ogni Pokémon che ha raggiunto la
 * soglia di evoluzione durante l'ultima battaglia.
 *
 * Porting di:
 * - Mod_Game_Events.AvviaScenaEvoluzione
 * - Mod_Game_Events.PreparaScenaEvoluzione
 * - Mod_Game_Events.ConcludiEvoluzione
 *
 * Payload atteso:
 *   {
 *     evoluzioni: { istanzaId: string, oldSpecieId: number, newSpecieId: number }[],
 *     luogoRitorno: string,
 *     giocatoreId: 1 | 2,
 *   }
 *
 * Processa una evoluzione alla volta. Ad ogni "Continua":
 * - applica la nuova specie all'istanza nello store (specieId + nome + HP ricalcolato)
 * - avanza all'evoluzione successiva
 * - quando tutte sono fatte, naviga al luogoRitorno
 */
type EvoluzioneSpec = {
  istanzaId: string
  oldSpecieId: number
  newSpecieId: number
}

/** Il payload sopravvive al reload; una specie già aggiornata non va evoluta di nuovo. */
export function getPendingEvolutionQueue(evoluzioni: EvoluzioneSpec[], squadra: PokemonIstanza[]): EvoluzioneSpec[] {
  return evoluzioni.filter((evoluzione) =>
    squadra.some((pokemon) => pokemon.istanzaId === evoluzione.istanzaId && pokemon.specieId === evoluzione.oldSpecieId),
  )
}

export function EvoluzioneScene() {
  const { reducedMotion, speed } = useGameMotionPreferences()
  const scenaCorrente = useSceneNavigation()
  const aggiornaPokemon = useGameStore((s) => s.aggiornaPokemon)
  const vaiAScena = useGameStore((s) => s.vaiAScena)
  const giocatore1 = useGameStore((s) => s.giocatore1)
  const giocatore2 = useGameStore((s) => s.giocatore2)
  const layoutEditing = useAdminStore((s) => s.layoutEditing)
  const evolutionLayout = useAdminStore((s) => s.theme.layouts.evolution)
  const updateSceneLayout = useAdminStore((s) => s.updateSceneLayout)
  const setBusy = useRegiaStore((s) => s.setBusy)

  const initialPayloadRef = useRef(scenaCorrente.payload)
  const luogoRitorno =
    (initialPayloadRef.current?.luogoRitorno as string) ?? 'mappa-principale'
  const giocatoreId = (initialPayloadRef.current?.giocatoreId as 1 | 2) ?? 1

  // Filtra solo al mount: il cambio di specie durante questa animazione deve
  // mantenere la schermata di conferma, fino al click su Continua/Fine.
  const [evoluzioni] = useState(() => getPendingEvolutionQueue(
    (initialPayloadRef.current?.evoluzioni as EvoluzioneSpec[]) ?? [],
    (giocatoreId === 1 ? giocatore1 : giocatore2).squadra,
  ))

  const [indice, setIndice] = useState(0)
  const [fase, setFase] = useState<'pre' | 'morphing' | 'post'>('pre')
  const evolutionTimerRef = useRef<number | null>(null)
  const navigationRequestedRef = useRef(false)
  const updateEvolutionLayout = (key: AdminEvolutionLayoutKey, rect: AdminLayoutRect) =>
    updateSceneLayout({ scene: 'evolution', key, rect })

  const corrente = evoluzioni[indice]

  const tornaIndietro = () => {
    if (navigationRequestedRef.current) return
    navigationRequestedRef.current = true

    const isPercorso = /^Percorso_/.test(luogoRitorno)
    if (luogoRitorno === 'lega') {
      vaiAScena('lega', { playerId: giocatoreId })
    } else if (luogoRitorno === 'mappa-griglia') {
      vaiAScena('mappa-griglia')
    } else if (isPercorso) {
      vaiAScena('percorso', { luogo: luogoRitorno })
    } else if (luogoRitorno && luogoRitorno !== 'mappa-principale') {
      vaiAScena('citta', { luogo: luogoRitorno })
    } else {
      vaiAScena('mappa-principale')
    }
  }

  useEffect(() => {
    return () => {
      if (evolutionTimerRef.current !== null) {
        window.clearTimeout(evolutionTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const active = fase === 'morphing'
    setBusy(active, 'Attendi la conclusione dell’evoluzione.', 'evolution')
    return () => setBusy(false, undefined, 'evolution')
  }, [fase, setBusy])

  const oldSpec = corrente ? getPokemon(corrente.oldSpecieId) : null
  const newSpec = corrente ? getPokemon(corrente.newSpecieId) : null
  const giocatore = giocatoreId === 1 ? giocatore1 : giocatore2
  const istanza = corrente
    ? giocatore.squadra.find((p) => p.istanzaId === corrente.istanzaId)
    : null

  // A failed write keeps the old species. A successful retry publishes the
  // same evolution and only then reveals the confirmation screen.
  useEffect(() => {
    if (fase === 'morphing' && istanza?.specieId === corrente?.newSpecieId) {
      playSound('level-up')
      setBusy(false, undefined, 'evolution')
      setFase('post')
    }
  }, [fase, istanza?.specieId, corrente?.newSpecieId, setBusy])

  useEffect(() => {
    if (!corrente) {
      tornaIndietro()
      return
    }

    if (!oldSpec || !newSpec || !istanza) {
      setIndice((i) => i + 1)
      setFase('pre')
    }
    // La navigazione deve avvenire soltanto quando cambia l'evoluzione corrente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corrente, oldSpec, newSpec, istanza])

  if (!corrente || !oldSpec || !newSpec || !istanza) {
    return null
  }

  const avvia = () => {
    if (fase !== 'pre') return
    playSound('evolution')
    setFase('morphing')
    if (evolutionTimerRef.current !== null) {
      window.clearTimeout(evolutionTimerRef.current)
    }
    evolutionTimerRef.current = window.setTimeout(() => {
      // Applica l'evoluzione allo store
      const evoluto = {
        ...istanza,
        specieId: newSpec.id,
        nome: newSpec.nome,
      }
      evoluto.hp = Math.min(istanza.hp, calcolaHPMax(evoluto))
      aggiornaPokemon(giocatoreId, evoluto)
      evolutionTimerRef.current = null
    }, reducedMotion ? 0 : getAnimationDuration(1800))
  }

  const continua = () => {
    if (fase !== 'post') return
    if (indice + 1 < evoluzioni.length) {
      setIndice((i) => i + 1)
      setFase('pre')
    } else {
      tornaIndietro()
    }
  }

  return (
    <div
      data-admin-layout-root
      className="rpg-evolution-scene w-full h-full relative bg-gradient-to-br from-violet-950 via-fuchsia-900 to-indigo-950 overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: `url(${EVOLUTION_BG})` }}
    >
      {/* Sfondo a stelline animate */}
      {!reducedMotion && <div className="absolute inset-0 opacity-30">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
            }}
            animate={{
              opacity: [0.2, 1, 0.2],
              scale: [0.5, 1.5, 0.5],
            }}
            transition={{
              duration: 2 + (i % 3),
              repeat: Infinity,
              delay: (i % 5) * 0.3,
            }}
          />
        ))}
      </div>}

      {/* Contatore */}
      <AdminLayoutItem
        rootSelector="[data-admin-layout-root]"
        label="Contatore"
        rect={evolutionLayout.counter}
        editing={layoutEditing}
        onChange={(rect) => updateEvolutionLayout('counter', rect)}
        zIndex={20}
      >
      <div className="arka-panel flex h-full w-full items-center justify-center px-3 py-1">
        <span className="arka-layout-content text-xs text-arka-text-muted">
          Evoluzione {indice + 1} di {evoluzioni.length}
        </span>
      </div>
      </AdminLayoutItem>

      {/* Sprite centrale */}
      <AdminLayoutItem
        rootSelector="[data-admin-layout-root]"
        label="Sprite evoluzione"
        rect={evolutionLayout.sprite}
        editing={layoutEditing}
        onChange={(rect) => updateEvolutionLayout('sprite', rect)}
        zIndex={20}
      >
      <div className="relative h-full w-full flex items-center justify-center">
        <motion.div
          animate={
            fase === 'morphing' && !reducedMotion
              ? {
                  opacity: 1,
                  scale: [1, 1.04, 1, 1.08, 1],
                  filter: [
                    'brightness(1)',
                    'brightness(2)',
                    'brightness(3)',
                    'brightness(2)',
                    'brightness(1)',
                  ],
                }
              : {
                  opacity: 1,
                  scale: 1,
                  rotate: 0,
                  filter: 'brightness(1)',
                }
          }
          transition={
            fase === 'morphing'
              ? { duration: reducedMotion ? 0 : 1.8 / speed, ease: 'easeInOut' }
              : { duration: reducedMotion ? 0 : .35 / speed, ease: 'easeOut' }
          }
          className="relative z-10 flex h-full w-full items-center justify-center overflow-visible"
        >
          {fase === 'pre' && (
            <SpriteOrEmoji specieId={oldSpec.id} fallback={spriteFor(oldSpec.tipo)} />
          )}
          {fase === 'morphing' && <div className="relative h-full w-full" data-evolution-morph>
            <motion.div className="absolute inset-0" initial={false} animate={{ opacity: reducedMotion ? 0 : [1, .1, 1, 0], filter: 'brightness(3)' }} transition={{ duration: reducedMotion ? 0 : 1.8 / speed }}>
              <SpriteOrEmoji specieId={oldSpec.id} fallback={spriteFor(oldSpec.tipo)} />
            </motion.div>
            <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: reducedMotion ? 1 : [0, .6, 0, 1], filter: 'brightness(3)' }} transition={{ duration: reducedMotion ? 0 : 1.8 / speed }}>
              <SpriteOrEmoji specieId={newSpec.id} fallback={spriteFor(newSpec.tipo)} />
            </motion.div>
          </div>}
          {fase === 'post' && (
            <SpriteOrEmoji specieId={newSpec.id} fallback={spriteFor(newSpec.tipo)} />
          )}
        </motion.div>

        {/* Particelle che esplodono dal centro all'apparizione del nuovo sprite */}
        {fase === 'post' && !reducedMotion && (
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 14 }).map((_, i) => {
              const angle = (i / 14) * Math.PI * 2
              const dist = 180 + (i % 3) * 30
              return (
                <motion.div
                  key={i}
                  className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-yellow-300"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist,
                    opacity: 0,
                    scale: 0.3,
                  }}
                  transition={{ duration: 1.1 / speed, ease: 'easeOut', delay: .1 / speed }}
                />
              )
            })}
          </div>
        )}
      </div>
      </AdminLayoutItem>

      {/* Testo + pulsante */}
      <AdminLayoutItem
        rootSelector="[data-admin-layout-root]"
        label="Testi"
        rect={evolutionLayout.textPanel}
        editing={layoutEditing}
        onChange={(rect) => updateEvolutionLayout('textPanel', rect)}
        zIndex={20}
      >
      <div className="rpg-evolution-message flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center"><RpgFrame />
        {fase === 'pre' && (
          <>
            <h2 className="arka-layout-content arka-readable-title text-3xl font-bold text-white">
              {istanza.nome} sta per evolversi!
            </h2>
            <p className="arka-layout-content arka-readable-text text-arka-text-muted text-center max-w-md">
              {oldSpec.nome} (livello {istanza.livello}) ha raggiunto la soglia
              di evoluzione.
            </p>
            <RpgCommand tone="primary" onClick={avvia} className="mt-4">
              <span className="arka-layout-content">✨ Evolvi!</span>
            </RpgCommand>
          </>
        )}
        {fase === 'morphing' && (
          <h2 className="arka-layout-content arka-readable-title text-2xl font-bold text-white">
            Evoluzione in corso…
          </h2>
        )}
        {fase === 'post' && (
          <>
            <h2 className="arka-layout-content arka-readable-title text-4xl font-black text-yellow-300">
              {oldSpec.nome} si è evoluto in {newSpec.nome}!
            </h2>
            <RpgCommand tone="primary" onClick={continua} className="mt-4">
              <span className="arka-layout-content">
                {indice + 1 < evoluzioni.length ? 'Continua' : 'Fine'}
              </span>
            </RpgCommand>
          </>
        )}
      </div>
      </AdminLayoutItem>
    </div>
  )
}

function SpriteOrEmoji({
  specieId,
  fallback,
}: {
  specieId: number
  fallback: string
}) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const frontSource = `/sprites/front_sprites/${specieId}.png`
  const framing = getPortraitFraming(frontSource)
  const sources = [
    assetUrl(`/sprites/front_sprites/${specieId}.png`),
    assetUrl(`/sprites/small_sprites/Sprite Small ${specieId}.png`),
  ]

  useEffect(() => {
    setSourceIndex(0)
  }, [specieId])

  return (
    <>
      {sourceIndex === 0 ? <svg className="h-full w-full" viewBox={framing.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-evolution-species={specieId}>
        <image href={assetUrl(frontSource)} width={framing.width} height={framing.height} preserveAspectRatio="none" onError={() => setSourceIndex(1)} />
      </svg> : sourceIndex < sources.length ? (
        <img
          key={`${specieId}-${sourceIndex}`}
          src={sources[sourceIndex]}
          alt=""
          className="w-full h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-8xl">
          {fallback}
        </span>
      )}
    </>
  )
}

function spriteFor(tipo: string): string {
  switch (tipo) {
    case 'Fuoco':
      return '🔥'
    case 'Acqua':
      return '💧'
    case 'Erba':
      return '🌿'
    case 'Elettro':
      return '⚡'
    case 'Terra':
      return '⛰️'
    case 'Oscurità':
      return '🌑'
    case 'Psico':
      return '🔮'
    default:
      return '⭐'
  }
}
