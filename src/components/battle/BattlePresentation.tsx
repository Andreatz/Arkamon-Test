import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useAdminStore } from '@/store/adminStore'
import { getPokemon } from '@/data/index'
import { calcolaHPMax, getMossaAlLivello } from '@/engine/battleEngine'
import { assetUrl } from '@/utils/assetUrl'
import { AdminLayoutItem } from '@/admin/AdminLayoutItem'
import { ArkamonBattleSprite, type ArkamonAnimationCue } from '@/components/arkamon/ArkamonBattleSprite'
import { getArkamonAnimationAsset, type ArkamonBattleAnimation } from '@/components/arkamon/arkamonAnimationManifest'
import { getBattleSideCenter } from '@/components/vfx/battleVfxPosition'
import { StatusToken } from './StatusToken'
import { useGameMotionPreferences, getAnimationDuration } from '@/settings/gamePreferences'
import { battleMoveFacts } from './battleMoveFacts'
import { BATTLE_LAYOUT_IDS } from '@/ui-studio/battleLayout'
import { GameButton } from '@/components/ui/GameButton'
import './battleRpg.css'
import type { AdminBattleLayoutKey, AdminLayoutRect, AdminBattleLayout } from '@/theme/adminThemeTypes'
import type { PokemonIstanza, MossaDef, Stato, TipoPokemon } from '@/types'


export function BattleLayoutItem({
  layoutKey,
  label,
  rect,
  editing,
  onChange,
  children,
}: {
  layoutKey: AdminBattleLayoutKey
  label: string
  rect: AdminLayoutRect
  editing: boolean
  onChange: (key: AdminBattleLayoutKey, rect: AdminLayoutRect) => void
  children: ReactNode
}) {
  return (
    <AdminLayoutItem
      rootSelector="[data-battle-layout-root]"
      label={label}
      rect={rect}
      editing={editing}
      onChange={(nextRect) => onChange(layoutKey, nextRect)}
      zIndex={20}
      uiId={BATTLE_LAYOUT_IDS[layoutKey]}
      layoutOwner="battle"
    >
      {children}
    </AdminLayoutItem>
  )
}

export type ImpactPulseDisplay = {
  id: number
  side: 'A' | 'B'
  color: string
  strength: number
}

export function ImpactPulseOverlay({
  pulse,
  layout,
}: {
  pulse: ImpactPulseDisplay
  layout: AdminBattleLayout
}) {
  const { reducedMotion } = useGameMotionPreferences()
  if (reducedMotion) return null
  const point = getBattleSideCenter(layout, pulse.side)

  const position = {
    left: `${point.x}%`,
    top: `${point.y}%`,
  }

  return (
    <div
      className="pointer-events-none absolute z-[64] -translate-x-1/2 -translate-y-1/2"
      style={position}
      aria-hidden="true"
    >
      <motion.div
        initial={{ opacity: 0.95, scale: 0.25 }}
        animate={{
          opacity: [0.95, 0.72, 0],
          scale: [
            0.25,
            pulse.strength,
            pulse.strength * 1.9,
          ],
        }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 0.5,
          ease: 'easeOut',
        }}
        className="h-28 w-28 rounded-full border-[3px]"
        style={{
          borderColor: pulse.color,
          background: `radial-gradient(circle, ${pulse.color}55 0%, ${pulse.color}22 42%, transparent 70%)`,
          boxShadow: `0 0 18px ${pulse.color}, 0 0 42px ${pulse.color}88, inset 0 0 20px ${pulse.color}66`,
          mixBlendMode: 'screen',
        }}
      />
    </div>
  )
}

export function InfoBox({
  messaggi,
  showOpponentButton,
  onOpponentTurn,
}: {
  messaggi: string[]
  showOpponentButton: boolean
  onOpponentTurn: () => void
}) {
  const righe = messaggi.slice(-3)
  const frameSrc = assetUrl('/ui/infobox.png')

  if (!righe.length) return showOpponentButton ? (
    <div className="flex h-full w-full items-center justify-center">
      <GameButton tone="primary" aria-label="AVVERSARIO" onClick={onOpponentTurn}
        className="battle-opponent-command min-h-14 w-[min(92%,620px)] px-7 py-4 text-[clamp(18px,1.8vw,30px)]">
        Turno dell’avversario <span aria-hidden="true">▶</span>
      </GameButton>
    </div>
  ) : null

  return (
    <div
      role="status" aria-live="polite"
      className="arka-battle-font relative h-full w-full text-slate-950 drop-shadow-2xl"
      data-ui-skin-slot="frame"
      data-ui-asset-surface=""
      style={{
        backgroundImage: `url(${frameSrc})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        className={`battle-message-lines absolute left-[8%] top-[16%] space-y-1 text-white [text-shadow:-1px_-1px_0_#111,1px_-1px_0_#111,-1px_1px_0_#111,1px_1px_0_#111,0_3px_3px_rgba(0,0,0,0.55)] ${
          showOpponentButton ? 'right-[28%]' : 'right-[8%]'
        }`}
      >
        {righe.map((msg, idx) => (
          <p
            key={`${idx}-${msg}`}
            data-admin-layout-text-key={`message-${idx}`}
            className="arka-layout-content whitespace-normal break-words"
          >
            {msg}
          </p>
        ))}
      </div>

      {showOpponentButton && (
        <GameButton
          tone="primary"
          aria-label="AVVERSARIO"
          className="battle-opponent-command absolute bottom-[13%] right-[6%] min-h-12 w-[22%] px-4 py-3 text-[clamp(16px,1.35vw,24px)]"
          onClick={onOpponentTurn}
        >
          AVVERSARIO
        </GameButton>
      )}
    </div>
  )
}

export function ScambioModal({
  squadra,
  attivoId,
  motivo,
  onSelect,
}: {
  squadra: PokemonIstanza[]
  attivoId: string
  motivo: string
  onSelect: (pokemon: PokemonIstanza) => void
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/62 px-6 backdrop-blur-sm">
      <div className="w-[min(760px,92vw)] rounded-lg border border-white/15 bg-slate-950/92 p-5 text-white shadow-2xl">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold">Scegli un Pokemon</h2>
            <p className="mt-1 text-sm font-semibold text-slate-300">{motivo}</p>
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-amber-300">
            Cambio squadra
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {squadra.slice(0, 6).map((pokemon) => {
            const specie = getPokemon(pokemon.specieId)
            const hpMax = calcolaHPMax(pokemon)
            const pct = Math.max(0, Math.min(100, (pokemon.hp / hpMax) * 100))
            const disabled = pokemon.hp <= 0 || pokemon.istanzaId === attivoId

            return (
              <button
                key={pokemon.istanzaId}
                disabled={disabled}
                onClick={() => onSelect(pokemon)}
                className="flex min-h-[116px] items-center gap-3 rounded-md border border-white/10 bg-slate-900/86 p-3 text-left shadow-lg transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <img
                  src={assetUrl(`/sprites/front_sprites/${pokemon.specieId}.png`)}
                  alt=""
                  className="h-20 w-20 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-extrabold">
                      {pokemon.nome}
                    </span>
                    <span className="text-xs font-bold text-slate-300">
                      LV. {pokemon.livello}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/60">
                    <div
                      className="h-full bg-emerald-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs font-bold text-slate-300">
                    <span>{pokemon.hp}/{hpMax}</span>
                    <span>{pokemon.hp <= 0 ? 'KO' : specie?.tipo}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function SquadIndicator({
  squadra,
}: {
  squadra: PokemonIstanza[]
}) {
  return (
    <div className="relative z-10 flex h-full w-full items-center gap-1">
      {squadra.map((p) => (
        <div
          key={p.istanzaId}
          className={`w-3 h-3 rounded-full border border-white/60 ${
            p.hp > 0 ? 'bg-emerald-400' : 'bg-slate-600'
          }`}
          title={`${p.nome} lv${p.livello} (${p.hp} HP)`}
        />
      ))}
    </div>
  )
}

export function PokemonBattleSlot({
  istanza,
  presentationPaused = false,
  position,
  shaking,
  shakePx,
  shakeDurationMs,
  flashing,
  lunging,
  activeAnimation,
  replayKey,
  holdReactionUntilImpact,
  onAnimationStart,
  onAnimationCue,
  onAnimationComplete,
}: {
  istanza: PokemonIstanza
  presentationPaused?: boolean
  position: 'top-right' | 'bottom-left'
  shaking: boolean
  shakePx: number
  shakeDurationMs: number
  flashing: boolean
  lunging: boolean
  activeAnimation?: ArkamonBattleAnimation
  replayKey: number
  holdReactionUntilImpact: boolean
  onAnimationStart: (animation: ArkamonBattleAnimation, replayKey: number) => void
  onAnimationCue: (animation: ArkamonBattleAnimation, replayKey: number, cue: ArkamonAnimationCue) => void
  onAnimationComplete: (animation: ArkamonBattleAnimation, replayKey: number) => void
}) {
  const { reducedMotion, speed } = useGameMotionPreferences()
  const isPlayer = position === 'bottom-left'
  const spriteScale = useAdminStore((state) => state.theme.spriteScales[String(istanza.specieId)] ?? 1)
  const side = isPlayer ? 'back' : 'front'
  const spriteIdentity = `${istanza.istanzaId}:${istanza.specieId}:${side}`
  const [failedIdentity, setFailedIdentity] = useState<string | null>(null)
  const spriteFailed = failedIdentity === spriteIdentity
  const isKO = istanza.hp <= 0
  const battleAnimation: ArkamonBattleAnimation = isKO
    ? 'ko'
    : activeAnimation ?? 'idle'
  const animationReplayKey = battleAnimation === 'ko' ? 0 : replayKey
  const usesDedicatedSprites = !!getArkamonAnimationAsset(istanza.specieId, side, 'idle')
  const hasDedicatedKO = !!getArkamonAnimationAsset(istanza.specieId, side, 'ko')

  const completionCallbackRef = useRef(onAnimationComplete)
  completionCallbackRef.current = onAnimationComplete
  const startCallbackRef = useRef(onAnimationStart)
  startCallbackRef.current = onAnimationStart
  const cueCallbackRef = useRef(onAnimationCue)
  cueCallbackRef.current = onAnimationCue
  const currentIdentityRef = useRef(spriteIdentity)
  currentIdentityRef.current = spriteIdentity
  const completedTokenRef = useRef<string | null>(null)
  const startedTokenRef = useRef<string | null>(null)
  const releasedTokenRef = useRef<string | null>(null)
  const deferredFailedHitRef = useRef<{ identity: string; replayKey: number } | null>(null)
  const notifyAnimationStart = useCallback((animation: ArkamonBattleAnimation, startedReplayKey: number) => {
    if (currentIdentityRef.current !== spriteIdentity) return
    const token = `${spriteIdentity}:${animation}:${startedReplayKey}`
    if (startedTokenRef.current === token) return
    startedTokenRef.current = token
    startCallbackRef.current(animation, startedReplayKey)
  }, [spriteIdentity])
  const notifyAnimationCue = useCallback((animation: ArkamonBattleAnimation, releasedReplayKey: number, cue: ArkamonAnimationCue) => {
    if (currentIdentityRef.current !== spriteIdentity) return
    const token = `${spriteIdentity}:${animation}:${releasedReplayKey}:${cue}`
    if (releasedTokenRef.current === token) return
    releasedTokenRef.current = token
    cueCallbackRef.current(animation, releasedReplayKey, cue)
  }, [spriteIdentity])
  const notifyAnimationComplete = useCallback((animation: ArkamonBattleAnimation, completedReplayKey: number) => {
    if (currentIdentityRef.current !== spriteIdentity) return
    const token = `${spriteIdentity}:${animation}:${completedReplayKey}`
    if (completedTokenRef.current === token) return
    completedTokenRef.current = token
    completionCallbackRef.current(animation, completedReplayKey)
  }, [spriteIdentity])

  useEffect(() => {
    const failedHit = deferredFailedHitRef.current
    if (failedHit && failedHit.identity !== spriteIdentity) deferredFailedHitRef.current = null
    else if (failedHit && !holdReactionUntilImpact) {
      deferredFailedHitRef.current = null
      notifyAnimationComplete('hit', failedHit.replayKey)
    }
    if (battleAnimation === 'idle') {
      completedTokenRef.current = null
      startedTokenRef.current = null
      releasedTokenRef.current = null
      return
    }
    // A missing PNG leaves the emoji visible, but future actions must still release their waiter.
    if (spriteFailed) {
      notifyAnimationStart(battleAnimation, animationReplayKey)
      if (battleAnimation === 'attack') notifyAnimationCue(battleAnimation, animationReplayKey, 'release')
      if (battleAnimation === 'hit' && holdReactionUntilImpact) {
        deferredFailedHitRef.current = { identity: spriteIdentity, replayKey: animationReplayKey }
      } else notifyAnimationComplete(battleAnimation, animationReplayKey)
    }
  }, [spriteFailed, spriteIdentity, holdReactionUntilImpact, battleAnimation, animationReplayKey, notifyAnimationStart, notifyAnimationCue, notifyAnimationComplete])

  const horizontalMotion = reducedMotion || usesDedicatedSprites
    ? 0
    : shaking
    ? [0, -shakePx, shakePx, -shakePx, shakePx, 0]
    : lunging
    ? isPlayer
      ? [0, 30, 0]
      : [0, -30, 0]
    : 0
  const innerDuration = shaking
    ? shakeDurationMs / 1000
    : lunging
    ? 0.4 / speed
    : flashing
    ? 0.16 / speed
    : 0.2 / speed

  return (
    <motion.div
      className="relative z-10 h-full w-full"
      initial={reducedMotion ? false : { x: isPlayer ? -400 : 400, opacity: 0 }}
      animate={{
        x: 0,
        opacity: isKO && !hasDedicatedKO ? 0.45 : 1,
        filter: isKO && !hasDedicatedKO ? 'grayscale(100%)' : 'grayscale(0%)',
      }}
      exit={reducedMotion ? { opacity: 0 } : { y: 180, opacity: 0, rotate: isPlayer ? -15 : 15, filter: 'grayscale(100%)' }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 110 * speed, damping: 16 }}
    >
      <motion.div
        animate={{
          x: horizontalMotion,
          filter: flashing && !reducedMotion && !usesDedicatedSprites
            ? ['brightness(1)', 'brightness(2.5) saturate(0.35)', 'brightness(1)']
            : 'brightness(1)',
        }}
        transition={{ duration: reducedMotion ? 0 : innerDuration, ease: 'easeOut' }}
        className="relative flex h-full w-full items-center justify-center drop-shadow-2xl"
      >
        <span className="battle-ground-shadow" aria-hidden="true" />
        {!spriteFailed ? (
          <ArkamonBattleSprite
            playbackPaused={presentationPaused}
            speciesId={istanza.specieId}
            name={istanza.nome}
            side={side}
            animation={battleAnimation}
            replayKey={animationReplayKey}
            holdReactionUntilImpact={holdReactionUntilImpact}
            onAnimationStart={notifyAnimationStart}
            onAnimationCue={notifyAnimationCue}
            onAnimationComplete={notifyAnimationComplete}
            scale={spriteScale}
            className="w-full h-full object-contain"
            onError={() => setFailedIdentity(spriteIdentity)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-full border-4 border-white bg-arka-surface text-5xl">
            {isPlayer ? '🐺' : '🦈'}
          </span>
        )}
      </motion.div>
    </motion.div>
  )
}

export function HpBar({
  nome,
  livello,
  hp,
  hpMax,
  stato,
  side,
  className = '',
  frameSource,
  frameFit = 'fill',
  hpColorsOverride,
}: {
  nome: string
  livello: number
  hp: number
  hpMax: number
  stato?: Stato
  side: 'player' | 'enemy'
  className?: string
  frameSource?: string
  frameFit?: 'fill' | 'contain' | 'cover'
  hpColorsOverride?: { hpHigh: string; hpMid: string; hpLow: string }
}) {
  const savedColors = useAdminStore((state) => state.theme.colors)
  const hpColors = hpColorsOverride ?? savedColors
  const pct = Math.max(0, Math.min(100, (hp / hpMax) * 100))
  const colore = pct > 60 ? hpColors.hpHigh : pct > 25 ? hpColors.hpMid : hpColors.hpLow
  const frameSrc = frameSource ?? assetUrl(`/ui/hp_bar_${side}.png`)
  const barSrc = assetUrl('/ui/hp_bar.png')
  const barClipId = `hp-bar-inner-${side}`
  const fillWidth = pct === 0 ? 0 : 23 + pct * 5

  return (
    <div
      className={`arka-battle-font relative z-20 h-full w-full text-white arka-letter-outline ${className}`}
      data-battle-hp-side={side}
      data-battle-hp={hp}
      data-ui-skin-slot="frame"
      data-ui-asset-surface=""
      style={{
        backgroundImage: `url(${frameSrc})`,
        backgroundSize: frameSource && frameFit !== 'fill' ? frameFit : '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {stato && <span className="absolute bottom-full left-0 z-30 -translate-x-1/4 sm:mb-1"><StatusToken stato={stato} compact /></span>}
      <div data-ui-hp-labels="" className="absolute left-[13.5%] right-[6.5%] top-[15%] flex items-center justify-between gap-3">
        <span
          data-admin-layout-text-key="pokemon-name"
          title={nome}
          className="arka-layout-content min-w-0 truncate text-[clamp(13px,1.35vw,23px)] leading-none text-white [text-shadow:-1px_-1px_0_#111,1px_-1px_0_#111,-1px_1px_0_#111,1px_1px_0_#111,0_3px_3px_rgba(0,0,0,0.55)]"
        >
          {nome}

        </span>
        <span
          data-admin-layout-text-key="pokemon-level"
          className="arka-layout-content shrink-0 text-[clamp(11px,1.1vw,19px)] text-white [text-shadow:-1px_-1px_0_#111,1px_-1px_0_#111,-1px_1px_0_#111,1px_1px_0_#111,0_3px_3px_rgba(0,0,0,0.55)]"
        >
          LV. {livello}
        </span>
      </div>
      <div data-ui-hp-track="" className="absolute left-[10.25%] top-[66.5%] h-[33.5%] w-[59.7%]">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 507 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={barClipId}>
              <path d="M 16 3 H 503 V 20 C 503 29 499 35 493 36 H 3 V 20 C 3 12 8 5 16 3 Z" />
            </clipPath>
          </defs>
          <motion.rect
            x="-20"
            y="3"
            height="33"
            clipPath={`url(#${barClipId})`}
            initial={false}
            animate={{ width: fillWidth, rx: pct === 100 ? 0 : 16.5, fill: colore }}
            transition={{ duration: getAnimationDuration(500) / 1000, ease: 'easeOut' }}
          />
        </svg>
        <img
          src={barSrc}
          data-ui-skin-dependent="frame"
          style={{ visibility: frameSource ? 'hidden' : undefined }}
          data-ui-asset-decoration=""
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply"
        />
      </div>
      {(
        <div
          data-admin-layout-text-key={side === 'enemy' ? 'pokemon-enemy-hp' : 'pokemon-hp'}
          data-ui-hp-value=""
          className="arka-layout-content absolute left-[10.25%] top-[66.5%] flex h-[33.5%] w-[59.7%] items-center justify-center text-center text-[clamp(10px,1vw,17px)] text-white [text-shadow:-1px_-1px_0_#111,1px_-1px_0_#111,-1px_1px_0_#111,1px_1px_0_#111,0_3px_3px_rgba(0,0,0,0.55)]"
        >
          {hp}/{hpMax}
        </div>
      )}
    </div>
  )
}

export function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      whileHover={!disabled ? { y: -1, scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.96 } : {}}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-lg transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45"
      data-ui-asset-surface=""
    >
      {children}
    </motion.button>
  )
}

export function SupremeButton({ disabled, recoil, onClick }: {
  disabled: boolean
  recoil: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label="Mossa Suprema"
      data-ui-asset-surface=""
      title={`Scegli un attacco: danno doppio, contraccolpo ${recoil} HP al livello attuale; 50% degli HP massimi dopo eventuale salita di livello`}
      disabled={disabled}
      onClick={onClick}
      className="flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-amber-200 bg-gradient-to-b from-amber-400 to-orange-600 px-0 text-center font-black text-slate-950 shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-1"
    >
      <span className="max-w-full truncate text-[clamp(9px,1.4vw,20px)] leading-tight tracking-tight"><span className="hidden sm:inline">Mossa<br /></span>Suprema</span>
      <span className="hidden text-[clamp(9px,1vw,14px)] leading-tight sm:block">×2 · −{recoil} HP</span>
    </button>
  )
}

export function MoveButton({
  mossa,
  livello,
  textKeyPrefix,
  disabled,
  onClick,
  defenderType,
}: {
  mossa: MossaDef
  livello: number
  textKeyPrefix: string
  disabled: boolean
  onClick: () => void
  defenderType?: TipoPokemon
}) {
  const { dadi, incremento } = getMossaAlLivello(mossa, livello)
  const facts = battleMoveFacts(mossa, livello, defenderType)
  const frameSrc = assetUrl('/ui/move_button.png')
  const typeSrc = assetUrl(`/ui/${mossa.tipo.toLocaleLowerCase('it-IT')}.png`)

  return (
    <motion.button
      whileHover={!disabled ? { y: -2, scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      disabled={disabled}
      onClick={onClick}
      title={facts.detail}
      className="battle-move-button arka-battle-font relative h-full min-h-0 overflow-hidden px-[8%] py-[7%] text-slate-950 drop-shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-45"
      data-ui-skin-slot="frame"
      data-ui-asset-surface=""
      style={{
        backgroundImage: `url(${frameSrc})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <span className="battle-command-cursor" aria-hidden="true">▶</span>
      <div
        data-admin-layout-text-key={`${textKeyPrefix}-name`}
        className="arka-layout-content truncate px-[4%] text-center text-[clamp(16px,1.65vw,28px)] leading-none text-white [text-shadow:-1px_-1px_0_#111,1px_-1px_0_#111,-1px_1px_0_#111,1px_1px_0_#111,0_3px_3px_rgba(0,0,0,0.55)]"
      >
        {mossa.nome}
      </div>
      <div className="absolute bottom-[14%] left-[8%] flex w-[48%] items-center justify-start">
        <span
          data-admin-layout-text-key={`${textKeyPrefix}-dice`}
          className="arka-layout-content flex items-center gap-[0.14em] whitespace-nowrap text-[clamp(15px,1.65vw,26px)] leading-none text-white [text-shadow:-1px_-1px_0_#111,1px_-1px_0_#111,-1px_1px_0_#111,1px_1px_0_#111,0_3px_3px_rgba(0,0,0,0.55)]"
        >
          {facts.kind !== 'attack' ? <span className="text-[0.65em]">{facts.label}</span> : <>
            <span>{dadi}</span>
            <span className="text-[0.78em]" aria-label="dadi D6">🎲</span>
            {incremento !== 0 && <span>{incremento > 0 ? `+${incremento}` : incremento}</span>}
          </>}
        </span>
      </div>
      <div className="absolute bottom-[14%] right-[9%] flex h-[22%] w-[15%] items-center justify-center">
        <img
          data-admin-layout-text-key={`${textKeyPrefix}-type`}
          src={typeSrc}
          alt={mossa.tipo}
          title={mossa.tipo}
          className="arka-layout-content max-h-full max-w-full object-contain drop-shadow-md"
        />
      </div>
    </motion.button>
  )
}
