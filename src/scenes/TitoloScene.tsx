import { RpgCommand as GameButton } from '@/components/rpg'
import './rpgScenes.css'
import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@store/gameStore'
import { useAdminStore } from '@store/adminStore'
import { motion } from 'framer-motion'
import { assetUrl } from '@/utils/assetUrl'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { hasOwnedPokemon } from '@/engine/pokemonOwnership'
import { preloadSceneTransitionArtwork } from '@/components/transitions/ArkamonDiceArtwork'

const DEFAULT_TITLE_LOGO = '/ui/logo_arkamon.png'
const DEFAULT_TITLE_BACKGROUND_VIDEO = '/assets/Sfondo Titolo.mp4'

/**
 * Schermata titolo.
 * Tutto è in HTML + Tailwind: per modificare l'aspetto cambia le classi
 * o le variabili CSS in src/index.css.
 */
export function TitoloScene() {
  const { reducedMotion, speed } = useGameMotionPreferences()
  const video = useRef<HTMLVideoElement>(null)
  const vaiAScena = useGameStore((s) => s.vaiAScena)
  const reset = useGameStore((s) => s.reset)
  const haGiocatori = useGameStore((s) => hasOwnedPokemon(s.giocatore1) || hasOwnedPokemon(s.giocatore2))
  const starterCompletati = useGameStore((s) => hasOwnedPokemon(s.giocatore1) && hasOwnedPokemon(s.giocatore2))
  const titleLogo = useAdminStore((s) => s.theme.assets.titleLogo)
  const titleBackground = useAdminStore((s) => s.theme.assets.titleBackground)
  const [logoFailed, setLogoFailed] = useState(false)
  const [failedBackgroundPath, setFailedBackgroundPath] = useState<string | null>(null)

  useEffect(() => {
    setLogoFailed(false)
  }, [titleLogo])

  useEffect(() => {
    setFailedBackgroundPath(null)
  }, [titleBackground])

  const logoPath = titleLogo && !logoFailed ? titleLogo : DEFAULT_TITLE_LOGO
  const backgroundPath =
    titleBackground && failedBackgroundPath !== titleBackground ? titleBackground : DEFAULT_TITLE_BACKGROUND_VIDEO
  const hasBackground = Boolean(backgroundPath && failedBackgroundPath !== backgroundPath)
  const hasVideoBackground = /\.(mp4|webm|ogg)$/i.test(backgroundPath)
  useEffect(() => {
    if (!video.current) return
    if (reducedMotion) video.current.pause()
    else void video.current.play().catch(() => {})
  }, [reducedMotion, backgroundPath])

  return (
    <div className="rpg-title-scene relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-arka-bg via-slate-900 to-purple-950">
      {hasBackground && hasVideoBackground ? (
        <video
          ref={video}
          key={backgroundPath}
          className="absolute inset-0 h-full w-full object-cover"
          src={assetUrl(backgroundPath)}
          autoPlay={!reducedMotion}
          muted
          loop
          playsInline
          onError={() => setFailedBackgroundPath(backgroundPath)}
        />
      ) : null}
      {hasBackground && !hasVideoBackground ? (
        <img
          key={backgroundPath}
          src={assetUrl(backgroundPath)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedBackgroundPath(backgroundPath)}
        />
      ) : null}
      {hasBackground ? (
        <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--arka-bg)_45%,transparent)]" />
      ) : null}

      <motion.img
        key={logoPath}
        src={assetUrl(logoPath)}
        alt="Arkamon"
        className="rpg-title-logo relative z-10 drop-shadow-2xl"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: reducedMotion ? 0 : 0.2 / speed, type: 'spring' }}
        onError={(e) => {
          if (logoPath !== DEFAULT_TITLE_LOGO) {
            setLogoFailed(true)
            return
          }

          e.currentTarget.style.display = 'none'
        }}
      />
      <h1 className="sr-only">ARKAMON</h1>

      <motion.div
        className="rpg-title-commands relative z-10 flex flex-col"
        onPointerEnter={() => { if (!reducedMotion) preloadSceneTransitionArtwork() }}
        onFocusCapture={() => { if (!reducedMotion) preloadSceneTransitionArtwork() }}
        onPointerDown={() => { if (!reducedMotion) preloadSceneTransitionArtwork() }}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: reducedMotion ? 0 : .3 / speed }}
      >
        <GameButton
          tone="primary" className="text-xl"
          onClick={() => {
            if (haGiocatori && !window.confirm('Vuoi iniziare una nuova partita? La partita salvata verrà sostituita.')) return
            useGameStore.getState().eseguiTransazione(() => { reset(); vaiAScena('laboratorio') })
          }}
        >
          Nuova Partita
        </GameButton>
        {haGiocatori && (
          <GameButton
            className="text-lg"
            onClick={() => vaiAScena(starterCompletati ? 'mappa-principale' : 'laboratorio')}
          >
            Continua
          </GameButton>
        )}
      </motion.div>

    </div>
  )
}
