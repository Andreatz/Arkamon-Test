import { SpatialNavigation } from '@/components/rpg/SpatialNavigation'
import { StudioCommand, StudioSurface } from '@/components/ui/StudioArtwork'
import { getPortraitFraming } from '@/player-ui/portraitFraming'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import './liveLaboratory.css'
import { useGameStore, STARTER_IDS } from '@store/gameStore'
import { getPokemon } from '@data/index'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { LABORATORY_BG } from '@data/backgrounds'
import { assetUrl } from '@/utils/assetUrl'
import { getOwnedPokemon, hasOwnedPokemon } from '@/engine/pokemonOwnership'

const capsuleColors = ['blu', 'nera', 'viola'] as const

function LaboratorySprite({ speciesId }: { speciesId: number }) {
  const source = `/sprites/front_sprites/${speciesId}.png`
  const framing = getPortraitFraming(source)
  return <svg className="live-laboratory-sprite" viewBox={framing.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <image href={assetUrl(source)} width={framing.width} height={framing.height} />
  </svg>
}

/** The source canvas is wider than the artwork. Keep every painted coordinate. */
function LaboratoryArtwork({ source, crop, className = '' }: { source: string; crop: string; className?: string }) {
  return <svg className={`live-laboratory-crop ${className}`} viewBox={crop} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" data-studio-source={source}>
    <image href={assetUrl(source)} width={880} height={360} />
  </svg>
}

/**
 * Scena del Laboratorio: scelta dello starter.
 *
 * Replica la prima slide del gioco VBA. I due giocatori scelgono
 * a turno il proprio starter tra ID 1, 5, 9 (le prime forme delle
 * tre famiglie evolutive). Il terzo non scelto andrà al Rivale.
 */
export function LaboratorioScene() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const { reducedMotion } = useGameMotionPreferences()
  const vaiAScena = useGameStore((s) => s.vaiAScena)
  const scegliStarter = useGameStore((s) => s.scegliStarter)
  const impostaNomeGiocatore = useGameStore((s) => s.impostaNomeGiocatore)
  const giocatore1 = useGameStore((s) => s.giocatore1)
  const giocatore2 = useGameStore((s) => s.giocatore2)
  const g1HaStarter = useGameStore((s) => hasOwnedPokemon(s.giocatore1))
  const g2HaStarter = useGameStore((s) => hasOwnedPokemon(s.giocatore2))
  const [nomiConfermati, setNomiConfermati] = useState(g1HaStarter || g2HaStarter)
  const [nomeGiocatore1, setNomeGiocatore1] = useState(giocatore1.nome)
  const [nomeGiocatore2, setNomeGiocatore2] = useState(giocatore2.nome)
  const [confermaRichiesta, setConfermaRichiesta] = useState(false)

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.scrollTop = 0
  }, [nomiConfermati])

  useEffect(() => {
    if (confermaRichiesta && giocatore1.nome === (nomeGiocatore1.trim() || 'Giocatore 1')
      && giocatore2.nome === (nomeGiocatore2.trim() || 'Giocatore 2')) setNomiConfermati(true)
  }, [confermaRichiesta, giocatore1.nome, giocatore2.nome, nomeGiocatore1, nomeGiocatore2])

  const tuttiHannoStarter = g1HaStarter && g2HaStarter
  const giocatoreAttivo = g1HaStarter ? 2 : 1
  const starterScelti = [...getOwnedPokemon(giocatore1), ...getOwnedPokemon(giocatore2)].map((pokemon) => pokemon.specieId)
  const nomeGiocatoreAttivo = giocatoreAttivo === 1 ? giocatore1.nome : giocatore2.nome

  useEffect(() => {
    if (!tuttiHannoStarter) return
    const timer = window.setTimeout(() => {
      if (useGameStore.getState().scenaCorrente.scena === 'laboratorio') vaiAScena('mappa-principale')
    }, 800)
    return () => window.clearTimeout(timer)
  }, [tuttiHannoStarter, vaiAScena])

  const confermaNomi = () => {
    setConfermaRichiesta(true)
    useGameStore.getState().eseguiTransazione(() => {
      impostaNomeGiocatore(1, nomeGiocatore1)
      impostaNomeGiocatore(2, nomeGiocatore2)
    })
  }

  return (
    <div
      ref={sceneRef}
      className="live-laboratory-scene"
      style={{ backgroundImage: `url(${LABORATORY_BG})` }}
    >
      <div className="live-laboratory-content">
      <header className="live-laboratory-heading">
        <span>LABORATORIO · IL PRIMO COMPAGNO</span>
        <h2>Laboratorio del Professore</h2>
      </header>
      {!nomiConfermati ? (
        <form
          className="live-laboratory-form"
          onSubmit={(event) => {
            event.preventDefault()
            confermaNomi()
          }}
        >
          <p>Inserisci i nomi dei giocatori</p>
          <label>
            Giocatore 1
            <StudioSurface source="/ui/studio/Scuro/box-2.svg" width={1060} height={330} className="live-laboratory-name-field">
            <input
              value={nomeGiocatore1}
              onChange={(event) => setNomeGiocatore1(event.target.value)}
              maxLength={24}
              autoFocus
            />
            </StudioSurface>
          </label>
          <label>
            Giocatore 2
            <StudioSurface source="/ui/studio/Scuro/box-2.svg" width={1060} height={330} className="live-laboratory-name-field">
            <input
              value={nomeGiocatore2}
              onChange={(event) => setNomeGiocatore2(event.target.value)}
              maxLength={24}
            />
            </StudioSurface>
          </label>
          <StudioCommand type="submit" selected className="live-laboratory-confirm">
            Continua
          </StudioCommand>
        </form>
      ) : (
        <>
      <p className="live-laboratory-prompt" aria-live="polite">
        {tuttiHannoStarter
          ? 'Tutti hanno scelto! Si parte!'
          : `${nomeGiocatoreAttivo}, scegli il tuo Starter.`}
      </p>

      <SpatialNavigation columns={3} selectOnFocus={false} className="live-laboratory-capsules">
        {STARTER_IDS.map((id, index) => {
          const specie = getPokemon(id)
          if (!specie) return null
          const disponibile = !tuttiHannoStarter && !starterScelti.includes(id)

          return (
            <motion.button
              data-rpg-item key={id}
              type="button"
              whileHover={disponibile && !reducedMotion ? { scale: 1.025, y: -6 } : {}}
              whileTap={disponibile && !reducedMotion ? { scale: 0.98 } : {}}
              disabled={!disponibile}
              aria-label={`${specie.nome} · ${specie.tipo}${starterScelti.includes(id) ? ' · già scelto' : ''}`}
              onClick={() => scegliStarter(id)}
              className="live-laboratory-capsule"
            >
              <LaboratorySprite speciesId={specie.id} />
              <LaboratoryArtwork source={`/ui/studio/Comuni/capsula-lab-${capsuleColors[index]}.svg`} crop="0 0 260 360" />
              <span className="live-laboratory-capsule-name">{specie.nome}</span>
              <span className="live-laboratory-capsule-type">{starterScelti.includes(id) ? 'SCELTO' : specie.tipo}</span>
            </motion.button>
          )
        })}
      </SpatialNavigation>
      <div className="live-laboratory-dialog">
        <LaboratoryArtwork source="/ui/studio/Comuni/dialogo-lab.svg" crop="250 145 630 210" />
        <p className="live-laboratory-sr-only">Professore: scegli con cura il tuo compagno d’avventura! Sarà il coraggioso Vyrath, l’oscuro Darklaw, o il misterioso Felyss?</p>
      </div>
      <StudioSurface source="/ui/studio/Scuro/dialogo-scuro.svg" width={820} height={430} className="live-laboratory-mobile-dialog">
        <div><strong>PROFESSORE</strong><p>Scegli con cura il tuo compagno d’avventura! Vyrath, Darklaw o Felyss?</p></div>
      </StudioSurface>
        </>
      )}
      </div>
    </div>
  )
}
