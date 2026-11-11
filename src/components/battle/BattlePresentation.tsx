import { forwardRef, useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useAdminStore } from '@/store/adminStore'
import { getPokemon } from '@/data/index'
import { calcolaHPMax, getMossaAlLivello } from '@/engine/battleEngine'
import { assetUrl } from '@/utils/assetUrl'
import { AdminLayoutItem } from '@/admin/AdminLayoutItem'
import { ArkamonBattleSprite, type ArkamonAnimationCue } from '@/components/arkamon/ArkamonBattleSprite'
import { getArkamonAnimationAsset, type ArkamonBattleAnimation } from '@/components/arkamon/arkamonAnimationManifest'
import { getBattleSideCenter } from '@/components/vfx/battleVfxPosition'
import { planBattleImpactComposition, impactLayerAppearance, type ImpactLayerKind } from './battleImpactComposition'
import type { BattleCameraChoreography } from './battleCameraLanguage'
import { StatusToken } from './StatusToken'
import { useGameMotionPreferences, getAnimationDuration } from '@/settings/gamePreferences'
import { battleMoveFacts } from './battleMoveFacts'
import { BATTLE_LAYOUT_IDS } from '@/ui-studio/battleLayout'
import { GameButton } from '@/components/ui/GameButton'
import './battleRpg.css'
import type { AdminBattleLayoutKey, AdminLayoutRect, AdminBattleLayout } from '@/theme/adminThemeTypes'
import type { PokemonIstanza, MossaDef, Stato, TipoPokemon } from '@/types'


export const BattleLayoutItem = forwardRef<HTMLDivElement, {
  layoutKey: AdminBattleLayoutKey
  label: string
  rect: AdminLayoutRect
  editing: boolean
  onChange: (key: AdminBattleLayoutKey, rect: AdminLayoutRect) => void
  children: ReactNode
}>(function BattleLayoutItem({
  layoutKey,
  label,
  rect,
  editing,
  onChange,
  children,
}, forwardedRef) {
  return (
    <AdminLayoutItem
      ref={forwardedRef}
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
})

export type ImpactPulseDisplay = {
  id: number
  side: 'A' | 'B'
  color: string
  strength: number
  choreography?: BattleCameraChoreography
}

export function ImpactPulseOverlay({
  pulse,
  layout,
}: {
  pulse: ImpactPulseDisplay
  layout: AdminBattleLayout
}) {
  const { reducedMotion, speed } = useGameMotionPreferences()
  // The cue is dispatched by the VFX layer's impact callback, not by a
  // separate guessed offset. Rendering this component cannot affect damage.
  const layers = planBattleImpactComposition(pulse.choreography ?? 'projectile', pulse.strength, reducedMotion)
  if (!layers.length) return null
  const point = getBattleSideCenter(layout, pulse.side)

  return (
    <div
      data-battle-impact-cue={pulse.id}
      data-battle-impact-kind={pulse.choreography ?? 'projectile'}
      className="pointer-events-none absolute z-[64]"
      style={{ left: `${point.x}%`, top: `${point.y}%`, width: 0, height: 0 }}
      aria-hidden="true"
    >
      {layers.map((layer, index) => (
        <motion.div
          key={`${pulse.id}-${layer.kind}-${index}`}
          data-battle-impact-layer={layer.kind as ImpactLayerKind}
          className="pointer-events-none absolute rounded-full"
          initial={{ opacity: 0, scale: layer.startScale }}
          animate={{ opacity: [0, layer.peakOpacity, 0], scale: [layer.startScale, 1, layer.endScale] }}
          exit={{ opacity: 0 }}
          transition={{
            duration: layer.durationMs / 1000 / speed,
            delay: layer.delayMs / 1000 / speed,
            ease: 'easeOut',
            times: [0, 0.22, 1],
          }}
          style={{
            left: -layer.width / 2,
            top: -layer.height / 2,
            width: layer.width,
            height: layer.height,
            rotate: `${layer.rotate}deg`,
            mixBlendMode: 'screen',
            willChange: 'transform, opacity',
            ...impactLayerAppearance(layer.kind, pulse.color),
          }}
        />
      ))}
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
  if (!righe.length) return showOpponentButton ? (
    <div className="flex h-full w-full items-center justify-center">
      <GameButton tone="primary" aria-label="AVVERSARIO" onClick={onOpponentTurn}
        className="battle-opponent-command min-h-12 w-[min(92%,620px)] px-5 py-2">
        Turno dell’avversario <span aria-hidden="true">▶</span>
      </GameButton>
    </div>
  ) : null

  return (
    <div
      role="status" aria-live="polite"
      className="battle-v5-dialogue arka-battle-font relative h-full w-full text-white"
      data-ui-skin-slot="frame" data-ui-asset-surface=""
    >
      <span className="battle-v5-dialogue__eyebrow" aria-hidden="true">◆ &nbsp; CRONACA DEL DUELLO</span>
      <div className={`battle-message-lines battle-v5-dialogue__messages ${showOpponentButton ? 'battle-v5-dialogue__messages--compact' : ''}`}>
        {righe.map((msg, idx) => (
          <p key={`${idx}-${msg}`} data-admin-layout-text-key={`message-${idx}`}
            className="arka-layout-content whitespace-normal break-words">{msg}</p>
        ))}
      </div>
      {showOpponentButton && (
        <GameButton tone="primary" aria-label="AVVERSARIO"
          className="battle-opponent-command battle-v5-dialogue__next" onClick={onOpponentTurn}>
          AVVERSARIO <span aria-hidden="true">→</span>
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
      <div className="battle-v5-switch w-[min(760px,92vw)] rounded-lg border border-white/15 bg-slate-950/92 p-5 text-white shadow-2xl">
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
                className="battle-v5-switch__option flex min-h-[116px] items-center gap-3 rounded-md border border-white/10 bg-slate-900/86 p-3 text-left shadow-lg transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
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
  nome, livello, hp, hpMax, stato, side, className = '', frameSource, frameFit = 'fill', hpColorsOverride,
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
  const savedColors = useAdminStore(state => state.theme.colors)
  const hpColors = hpColorsOverride ?? savedColors
  const pct = Math.max(0, Math.min(100, hpMax > 0 ? (hp / hpMax) * 100 : 0))
  const colore = pct > 60 ? hpColors.hpHigh : pct > 25 ? hpColors.hpMid : hpColors.hpLow
  const { reducedMotion } = useGameMotionPreferences()
  const frameStyle = frameSource ? {
    backgroundImage: `url(${assetUrl(frameSource)})`,
    backgroundSize: frameFit === 'fill' ? '100% 100%' : frameFit,
    backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
  } : undefined
  return (
    <div
      className={`battle-v5-hp arka-battle-font relative z-20 h-full w-full text-white ${className}`}
      data-battle-hp-side={side} data-battle-hp={hp} data-battle-hp-max={hpMax}
      data-battle-hp-custom-frame={frameSource ? 'true' : 'false'}
      data-ui-skin-slot="frame" data-ui-asset-surface=""
      style={{ ...frameStyle, '--battle-hp-tint': colore } as CSSProperties}
    >
      {stato && <span className="battle-v5-hp__status"><StatusToken stato={stato} compact /></span>}
      <div className="battle-v5-hp__heading" data-ui-hp-labels="">
        <span className="battle-v5-hp__pip" aria-hidden="true" />
        <span data-admin-layout-text-key="pokemon-name" title={nome}
          className="battle-v5-hp__name arka-layout-content">{nome}</span>
        <span data-admin-layout-text-key="pokemon-level"
          className="battle-v5-hp__level arka-layout-content">LV {livello}</span>
      </div>
      <div className="battle-v5-hp__bottom">
        <span className="battle-v5-hp__tag" aria-hidden="true">HP</span>
        <div className="battle-v5-hp__track" data-ui-hp-track="" role="progressbar"
          aria-label={`Punti salute di ${nome}`} aria-valuemin={0} aria-valuemax={hpMax} aria-valuenow={Math.max(0, hp)}>
          <motion.div data-battle-hp-fill="" className="battle-v5-hp__fill"
            initial={false} animate={{ width: `${pct}%`, backgroundColor: colore }}
            transition={{ duration: reducedMotion ? 0 : getAnimationDuration(510) / 1000, ease: [0.2, 0.9, 0.3, 1] }} />
          <span className="battle-v5-hp__track-shine" aria-hidden="true" />
        </div>
        <span data-ui-hp-value="" data-admin-layout-text-key={side === 'enemy' ? 'pokemon-enemy-hp' : 'pokemon-hp'}
          className="battle-v5-hp__value arka-layout-content">{hp}<span aria-hidden="true"> / </span>{hpMax}</span>
      </div>
    </div>
  )
}

export function ActionButton({ children, disabled, onClick }: {
  children: ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return <motion.button type="button" whileHover={!disabled ? { y: -2 } : undefined}
    whileTap={!disabled ? { scale: 0.97 } : undefined} disabled={disabled} onClick={onClick}
    className="battle-v5-action" data-ui-asset-surface="">{children}</motion.button>
}

export function SupremeButton({ disabled, recoil, onClick }: {
  disabled: boolean
  recoil: number
  onClick: () => void
}) {
  return (
    <button type="button" aria-label="Mossa Suprema" data-ui-asset-surface=""
      title={`Scegli un attacco: danno doppio, contraccolpo ${recoil} HP al livello attuale; 50% degli HP massimi dopo eventuale salita di livello`}
      disabled={disabled} onClick={onClick} className="battle-v5-supreme">
      <span className="battle-v5-supreme__burst" aria-hidden="true">✦</span>
      <span className="battle-v5-supreme__name">SUPREMA</span>
      <span className="battle-v5-supreme__cost">×2 <span aria-hidden="true">·</span> −{recoil} HP</span>
    </button>
  )
}

const BATTLE_MOVE_ACCENTS: Record<TipoPokemon, string> = {
  Normale: '#d9e5ef', Fuoco: '#ff9164', Acqua: '#62d5f6', Erba: '#66dda2',
  Elettro: '#ffe07b', Terra: '#d7b386', Psico: '#e6a4ff', Oscurità: '#a99eff',
}

export function MoveButton({
  mossa, livello, textKeyPrefix, disabled, onClick, defenderType,
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
  const typeSrc = assetUrl(`/ui/${mossa.tipo.toLocaleLowerCase('it-IT')}.png`)
  const { reducedMotion, speed } = useGameMotionPreferences()
  return (
    <motion.button
      type="button"
      whileHover={!disabled && !reducedMotion ? { y: -3, scale: 1.015 } : undefined}
      whileTap={!disabled && !reducedMotion ? { scale: 0.975 } : undefined}
      transition={{ duration: 0.16 / speed }}
      disabled={disabled} onClick={onClick} title={facts.detail}
      className="battle-move-button battle-v5-move arka-battle-font"
      data-ui-skin-slot="frame" data-ui-asset-surface="" data-move-type={mossa.tipo}
      style={{ '--move-accent': BATTLE_MOVE_ACCENTS[mossa.tipo] } as CSSProperties}
    >
      <span className="battle-command-cursor" aria-hidden="true">◆</span>
      <div data-admin-layout-text-key={`${textKeyPrefix}-name`}
        className="battle-v5-move__name arka-layout-content" title={mossa.nome}>{mossa.nome}</div>
      <div className="battle-v5-move__footer">
        <span data-admin-layout-text-key={`${textKeyPrefix}-dice`}
          className="battle-v5-move__power arka-layout-content">
          {facts.kind !== 'attack' ? facts.label : <>{dadi}<span aria-label="dadi D6">◆</span>{incremento !== 0 ? ` ${incremento > 0 ? '+' : ''}${incremento}` : ''}</>}
        </span>
        <span className="battle-v5-move__type">
          <img data-admin-layout-text-key={`${textKeyPrefix}-type`} src={typeSrc} alt={mossa.tipo}
            title={mossa.tipo} className="arka-layout-content" />
        </span>
      </div>
    </motion.button>
  )
}
