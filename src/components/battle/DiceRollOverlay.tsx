import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { assetUrl } from '@/utils/assetUrl'
import { AnimatedSprite } from '../vfx/AnimatedSprite'
import { getBattleDiceSequence } from './battleDiceAssets'
import { createBattleDiceReveal } from './battleDiceReveal'
import { playSelectedAudio } from '@/utils/soundManager'
import './battleDice.css'

const useDiceLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface DiceRollDisplay {
  id: number
  side: 'A' | 'B'
  moveName: string
  rolls: number[]
  increment: number
  damage: number
}

interface DiceRollOverlayProps {
  roll: DiceRollDisplay
  forceFallback?: boolean
  onVisible?: () => void
  /** Design preview holds the real result artwork without a sound or battle action. */
  staticPreview?: boolean
}

export function DiceRollOverlay(props: DiceRollOverlayProps) {
  return <DiceRollPresentation key={props.roll.id} {...props} />
}

function DiceRollPresentation({ roll, forceFallback = false, onVisible, staticPreview = false }: DiceRollOverlayProps) {
  const { reducedMotion, speed } = useGameMotionPreferences()
  const [damageVisible, setDamageVisible] = useState(staticPreview)
  const revealRef = useRef<ReturnType<typeof createBattleDiceReveal> | null>(null)
  const onVisibleRef = useRef(onVisible)
  onVisibleRef.current = onVisible
  const diceCount = roll.rolls.length

  useDiceLayoutEffect(() => {
    if (staticPreview) return
    const reveal = createBattleDiceReveal({
      diceCount,
      scheduleAfterPaint: (callback) => {
        let secondFrame = 0
        const firstFrame = requestAnimationFrame(() => {
          secondFrame = requestAnimationFrame(callback)
        })
        return () => {
          cancelAnimationFrame(firstFrame)
          cancelAnimationFrame(secondFrame)
        }
      },
      onReveal: () => {
        playSelectedAudio('event:dice')
        setDamageVisible(true)
        onVisibleRef.current?.()
      },
    })
    revealRef.current = reveal
    if (reducedMotion) reveal.panelVisible()
    return () => {
      reveal.cancel()
      if (revealRef.current === reveal) revealRef.current = null
    }
  }, [diceCount, reducedMotion, staticPreview])
  const total = roll.rolls.reduce((sum, value) => sum + value, 0)
  const gridStyle = {
    '--battle-dice-columns': Math.max(1, Math.min(roll.rolls.length, 6)),
    '--battle-dice-mobile-columns': Math.max(1, Math.min(roll.rolls.length, roll.rolls.length > 9 ? 4 : 3)),
    '--battle-dice-cell-width': roll.rolls.length > 12 ? '80px' : '106px',
    '--battle-dice-mobile-cell-width': roll.rolls.length > 12 ? '50px' : '94px',
  } as CSSProperties

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
      data-dice-roll-id={roll.id}
      data-dice-revealed={damageVisible}
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.88, y: -18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: reducedMotion ? 0 : 0.22 / speed }}
        onAnimationComplete={() => revealRef.current?.panelVisible()}
        className="battle-dice-panel rounded-md border border-white/20 px-5 py-4 text-center text-white shadow-2xl"
      >
        <p className="text-[11px] font-black uppercase text-blue-300 arka-letter-outline">
          {roll.side === 'A' ? 'Lancio giocatore' : 'Lancio avversario'}
        </p>
        <h3 className="mt-1 text-lg font-black">{roll.moveName}</h3>
        <div className="battle-dice-grid" style={gridStyle}>
          {roll.rolls.map((value, index) => (
            <BattleDie
              key={`${roll.id}-${index}-${value}`}
              value={value}
              staticPreview={staticPreview}
              forceFallback={forceFallback}
              onVisible={() => revealRef.current?.dieVisible(index)}
            />
          ))}
        </div>
        <p className="mt-3 text-xs font-bold leading-relaxed text-slate-200">
          Dadi: {roll.rolls.join(' + ')}
          {roll.increment > 0 ? ` + ${roll.increment}` : ''}
          {' = '}{total + roll.increment}
        </p>
        <div className="mt-1 min-h-6" aria-live="polite">
          {damageVisible ? (
            <p className="text-base font-black text-rose-300">Danno finale: {roll.damage}</p>
          ) : null}
        </div>
      </motion.div>
    </div>
  )
}

export function BattleDie({ value, forceFallback, onVisible, staticPreview = false }: {
  value: number
  forceFallback: boolean
  onVisible: () => void
  staticPreview?: boolean
}) {
  const [phase, setPhase] = useState<'intro' | 'result'>('intro')
  const [failed, setFailed] = useState(false)
  const { reducedMotion } = useGameMotionPreferences()
  const revealResult = useCallback(() => setPhase('result'), [])
  const showFallback = useCallback(() => setFailed(true), [])
  const sequence = getBattleDiceSequence(value)
  const showingResult = staticPreview || reducedMotion || phase === 'result'
  const segment = sequence && (showingResult ? sequence.result : sequence.intro)
  const showingFallback = failed || forceFallback || !segment
  const onVisibleRef = useRef(onVisible)
  onVisibleRef.current = onVisible
  const notifyVisible = useCallback(() => onVisibleRef.current(), [])

  useEffect(() => {
    if (!showingFallback) return
    const frame = requestAnimationFrame(notifyVisible)
    return () => cancelAnimationFrame(frame)
  }, [showingFallback, notifyVisible])

  return (
    <div className="battle-die" role="img" aria-label={`Dado: ${value}`}>
      {showingFallback ? (
        <span className="battle-die-fallback" aria-hidden="true">{value}</span>
      ) : (
        <div className="battle-die-sprite">
          <AnimatedSprite
            key={`${value}-${showingResult ? 'result' : 'intro'}`}
            src={assetUrl(segment.src)}
            {...segment.sprite}
            {...(staticPreview ? { frameCount: 1, paused: true } : {})}
            width={segment.sprite.frameWidth}
            height={segment.sprite.frameHeight}
            responsive
            className="battle-die-frames"
            loop={false}
            waitForLoad
            onStart={showingResult ? notifyVisible : undefined}
            onComplete={showingResult ? undefined : revealResult}
            onError={showFallback}
          />
        </div>
      )}
    </div>
  )
}
