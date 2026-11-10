import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { getMossa, getPokemon } from '@/data'
import type { MossaDef } from '@/types'
import { MoveVfx, type MoveVfxEvent } from '@/components/MoveVfx'
import { useResolvedBattleLayout } from '@/ui-studio/battleLayout'
import {
  createBattleAnimationPlayback,
  createBattleVisualSequence,
  planBattleAnimationPlayback,
  type BattleAnimationPlayback,
  type BattleVisualSequence,
} from '@/components/battle/battleVisualSequence'
import { getMoveVfxImpactDelayMs } from '@/components/vfx/resolveMoveVfxAsset'
import { prepareMoveVfxPlayback } from '@/components/vfx/preloadVfxAssets'
import { ArkamonBattleSprite } from './ArkamonBattleSprite'
import { prepareArkamonAnimationPlayback } from './preloadArkamonAnimations'
import {
  ARKAMON_ANIMATION_MANIFEST,
  getArkamonAnimationAsset,
  type ArkamonBattleAnimation,
  type ArkamonSpriteSide,
} from './arkamonAnimationManifest'

type PreviewPhase = 'ready' | 'preparing' | 'playing' | 'effect' | 'impact' | 'complete' | 'error'
type PreviewEvent = { event: string; atMs: number }
type PreviewRuntime = {
  id: number
  startedAt: number
  playback: BattleAnimationPlayback
  sequence: BattleVisualSequence
  timers: Set<number>
  frames: Set<number>
  readySides: Set<'A' | 'B'>
  finishReady?: () => void
  finishWarmup?: () => void
}
const SPECIES_IDS = Object.keys(ARKAMON_ANIMATION_MANIFEST).map(Number).sort((a, b) => a - b)

/** Exercise the battle's real animation coordinator without changing a saved game. */
export function ArkamonAttackPreview({ speciesId, stageStyle, background, onBusyChange }: { speciesId: number; stageStyle?: CSSProperties; background: string; onBusyChange?: (busy: boolean) => void }) {
  const { reducedMotion, speed } = useGameMotionPreferences()
  const moves = (getPokemon(speciesId)?.mosse ?? [])
    .map(getMossa)
    .filter((move): move is MossaDef => !!move && move.id > 0)
  const [moveId, setMoveId] = useState(moves[0]?.id ?? 0)
  const [targetId, setTargetId] = useState(speciesId === 20 ? 5 : 20)
  const [attackerSide, setAttackerSide] = useState<ArkamonSpriteSide>('front')
  const [phase, setPhase] = useState<PreviewPhase>('ready')
  const [attackerAnimation, setAttackerAnimation] = useState<ArkamonBattleAnimation>('idle')
  const [targetAnimation, setTargetAnimation] = useState<ArkamonBattleAnimation>('idle')
  const [replayKey, setReplayKey] = useState(0)
  const [effect, setEffect] = useState<MoveVfxEvent | null>(null)
  const [events, setEvents] = useState<PreviewEvent[]>([])
  const [clipsPrepared, setClipsPrepared] = useState(false)
  const [attackerPlaying, setAttackerPlaying] = useState(false)
  const [targetPlaying, setTargetPlaying] = useState(false)
  const [holdHitReaction, setHoldHitReaction] = useState(false)
  const generation = useRef(0)
  const starting = useRef(false)
  const runtime = useRef<PreviewRuntime | null>(null)
  const battleLayout = useResolvedBattleLayout()
  const attackerName = getPokemon(speciesId)?.nome ?? `Arkamon #${speciesId}`
  const targetName = getPokemon(targetId)?.nome ?? `Arkamon #${targetId}`
  const busy = phase === 'preparing' || phase === 'playing' || phase === 'effect' || phase === 'impact'
  const animated = clipsPrepared && phase !== 'ready' && phase !== 'error'

  const stopRuntime = useCallback(() => {
    generation.current++
    const current = runtime.current
    current?.playback.cancel()
    current?.sequence.cancel()
    current?.timers.forEach((timer) => window.clearTimeout(timer))
    current?.frames.forEach((frame) => cancelAnimationFrame(frame))
    current?.finishReady?.()
    current?.finishWarmup?.()
    runtime.current = null
  }, [])

  useEffect(() => () => { stopRuntime(); onBusyChange?.(false) }, [stopRuntime, onBusyChange])

  const resetPreview = () => {
    stopRuntime()
    starting.current = false
    setEffect(null)
    setPhase('ready')
    setAttackerAnimation('idle')
    setTargetAnimation('idle')
    setReplayKey(generation.current)
    setEvents([])
    setClipsPrepared(false)
    setAttackerPlaying(false)
    setTargetPlaying(false)
    setHoldHitReaction(false)
    onBusyChange?.(false)
  }

  const failPreview = () => {
    stopRuntime()
    starting.current = false
    setEffect(null)
    setPhase('error')
    setClipsPrepared(false)
    setAttackerPlaying(false)
    setTargetPlaying(false)
    setHoldHitReaction(false)
    onBusyChange?.(false)
  }

  const play = async () => {
    const move = getMossa(moveId)
    if (!move || busy || starting.current) return
    starting.current = true
    stopRuntime()
    const id = generation.current
    const startedAt = performance.now()
    const active = () => generation.current === id
    const record = (event: string) => {
      const atMs = Math.round(performance.now() - startedAt)
      if (active()) setEvents((current) => [...current, { event, atMs }])
    }
    setPhase('preparing')
    setClipsPrepared(false)
    setAttackerPlaying(false)
    setTargetPlaying(false)
    setHoldHitReaction(false)
    setEffect(null)
    setEvents([])
    setAttackerAnimation('idle')
    setTargetAnimation('idle')
    setReplayKey(id)
    onBusyChange?.(true)

    try {
      // Release the comparison reader before warming the two battle readers.
      // Three distinct pages cannot fit the 32 MiB mobile budget.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (!active()) return
      await Promise.all([
        prepareArkamonAnimationPlayback(speciesId, attackerSide, 'attack'),
        prepareArkamonAnimationPlayback(targetId, 'front', 'hit'),
        prepareMoveVfxPlayback(move, id),
      ])
      if (!active()) return
      const attackAsset = getArkamonAnimationAsset(speciesId, attackerSide, 'attack')
      const hitAsset = getArkamonAnimationAsset(targetId, 'front', 'hit')
      const plan = planBattleAnimationPlayback(
        attackAsset ? (attackAsset.releaseFrame ?? 0) / attackAsset.fps * 1000 : 0,
        hitAsset ? (hitAsset.reactionFrame ?? 0) / hitAsset.fps * 1000 : 0,
        getMoveVfxImpactDelayMs(move), reducedMotion,
      )
      const timers = new Set<number>()
      const frames = new Set<number>()
      const sequence = createBattleVisualSequence({
        waitForAttacker: !!attackAsset,
        waitForTarget: !!hitAsset,
        onRelease: () => {
          if (!active()) return
          record('release')
          setPhase('effect')
          setEffect({ id, move, side: 'A', target: 'opponent' })
        },
        onImpact: () => {
          if (!active()) return
          record('impact')
          setPhase('impact')
          setHoldHitReaction(false)
          if (!hitAsset) setTargetAnimation('hit')
        },
        onComplete: () => {
          if (!active()) return
          record('complete')
          starting.current = false
          setEffect(null)
          setPhase('complete')
          setHoldHitReaction(false)
          // Return ownership to the comparison before its action buttons unlock.
          setClipsPrepared(false)
          setAttackerPlaying(false)
          setTargetPlaying(false)
          setAttackerAnimation('idle')
          setTargetAnimation('idle')
          onBusyChange?.(false)
        },
      })
      const playback = createBattleAnimationPlayback({
        plan,
        dedicatedAttack: !!attackAsset,
        dedicatedHit: !!hitAsset,
        startAttack: () => {
          if (active()) setAttackerPlaying(true)
        },
        startHit: () => {
          if (active()) setTargetPlaying(true)
        },
        onRelease: sequence.release,
        schedule: (callback, delayMs) => {
          const timer = window.setTimeout(() => {
            timers.delete(timer)
            if (active()) callback()
          }, delayMs / speed)
          timers.add(timer)
        },
      })
      const readySides = new Set<'A' | 'B'>()
      if (!attackAsset) readySides.add('A')
      if (!hitAsset) readySides.add('B')
      const currentRuntime: PreviewRuntime = { id, startedAt, sequence, playback, timers, frames, readySides }
      runtime.current = currentRuntime
      const clipReadiness = new Promise<void>((resolve) => {
        currentRuntime.finishReady = resolve
        if (readySides.size === 2) resolve()
      })
      setAttackerAnimation('attack')
      setTargetAnimation('hit')
      setHoldHitReaction(!!hitAsset)
      setClipsPrepared(true)
      await clipReadiness
      currentRuntime.finishReady = undefined
      if (!active()) return
      record('clips-ready')
      // Paint both decoded opening frames while paused, before either native clock starts.
      // This includes the browser's first texture upload in preparation, not in the wind-up.
      await new Promise<void>((resolve) => {
        currentRuntime.finishWarmup = resolve
        const paint = (remaining: number) => {
          const frame = requestAnimationFrame(() => {
            frames.delete(frame)
            if (!active() || remaining === 0) resolve()
            else paint(remaining - 1)
          })
          frames.add(frame)
        }
        paint(2)
      })
      currentRuntime.finishWarmup = undefined
      if (!active()) return
      record('prepared')
      setPhase('playing')
      playback.start()
    } catch {
      if (active()) failPreview()
    }
  }

  const markEvent = (event: string) => {
    const currentRun = runtime.current
    if (currentRun && generation.current === currentRun.id) {
      const atMs = Math.round(performance.now() - currentRun.startedAt)
      setEvents((current) => [...current, { event, atMs }])
    }
  }

  const onNativeReady = (side: 'A' | 'B', animation: ArkamonBattleAnimation, key: number) => {
    const current = runtime.current
    const expected = side === 'A' ? 'attack' : 'hit'
    if (!current || current.id !== key || generation.current !== key || animation !== expected || current.readySides.has(side)) return
    current.readySides.add(side)
    markEvent(side === 'A' ? 'attacker-ready' : 'target-ready')
    if (current.readySides.size === 2) current.finishReady?.()
  }

  const onAttackerStart = (animation: ArkamonBattleAnimation, key: number) => {
    const current = runtime.current
    if (!current || current.id !== key || animation !== 'attack') return
    markEvent('attacker-start')
    current.playback.attackerStart()
  }
  const onTargetStart = (animation: ArkamonBattleAnimation, key: number) => {
    const current = runtime.current
    if (!current || current.id !== key || animation !== 'hit') return
    markEvent('target-start')
    current.playback.targetStart()
  }
  const onAttackerComplete = (animation: ArkamonBattleAnimation, key: number) => {
    const current = runtime.current
    if (!current || current.id !== key || animation !== 'attack') return
    markEvent('attacker-complete')
    current.playback.release()
    current.sequence.attackerComplete()
  }
  const onTargetComplete = (animation: ArkamonBattleAnimation, key: number) => {
    const current = runtime.current
    if (!current || current.id !== key || animation !== 'hit') return
    markEvent('target-complete')
    current.sequence.targetComplete()
  }

  const spriteStyle = (side: 'A' | 'B'): CSSProperties => {
    const rect = side === 'A' ? battleLayout.playerSprite : battleLayout.enemySprite
    return { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }
  }
  const status = phase === 'preparing' ? 'Preparazione della prova…'
    : busy ? `${getMossa(moveId)?.nome ?? 'Mossa'} in corso.`
      : phase === 'complete' ? 'Prova completata. Puoi ripeterla o scegliere un’altra mossa.'
        : phase === 'error' ? 'La prova non è stata preparata. Premi il pulsante per riprovare.'
          : 'Scegli una mossa e osserva l’attacco e la reazione del bersaglio.'

  return (
    <section className="darklaw-lab__attack-preview" aria-labelledby="arkamon-attack-preview-title">
      <div className="darklaw-lab__actions-heading">
        <div><p className="darklaw-lab__card-kicker">Prova la mossa</p><h2 id="arkamon-attack-preview-title">Attacco e impatto</h2></div>
      </div>
      <div className="darklaw-lab__attack-settings">
        <label htmlFor="arkamon-preview-move"><span>Mossa</span><select id="arkamon-preview-move" value={moveId} disabled={busy} onChange={(event) => { resetPreview(); setMoveId(Number(event.target.value)) }}>
          {moves.map((move) => <option key={move.id} value={move.id}>{move.nome}</option>)}
        </select></label>
        <label htmlFor="arkamon-preview-target"><span>Bersaglio</span><select id="arkamon-preview-target" value={targetId} disabled={busy} onChange={(event) => { resetPreview(); setTargetId(Number(event.target.value)) }}>
          {SPECIES_IDS.map((id) => <option key={id} value={id}>#{id} · {getPokemon(id)?.nome ?? 'Arkamon'}</option>)}
        </select></label>
        <label htmlFor="arkamon-preview-attacker-side"><span>Vista attaccante</span><select id="arkamon-preview-attacker-side" value={attackerSide} disabled={busy} onChange={(event) => { resetPreview(); setAttackerSide(event.target.value as ArkamonSpriteSide) }}>
          <option value="front">Frontale</option><option value="back">Retro</option>
        </select></label>
        <button type="button" className="darklaw-lab__play" disabled={busy || !moveId} onClick={() => { void play() }}>Prova attacco con VFX</button>
        {busy ? <button type="button" className="darklaw-lab__cancel" onClick={resetPreview}>Interrompi</button> : null}
      </div>
      <div className={`darklaw-lab__attack-stage darklaw-lab__stage--${background}`} style={stageStyle} data-preview-sync-phase={phase} data-preview-sync-events={JSON.stringify(events)} data-preview-sync-attacker={speciesId} data-preview-sync-target={targetId} data-preview-sync-attacker-view={attackerSide}>
        <span className="darklaw-lab__stage-caption">{attackerName} <span aria-hidden="true">→</span> {targetName}</span>
        <div className="darklaw-lab__attack-sprite" style={spriteStyle('A')} data-preview-sync-side="A">
          <ArkamonBattleSprite speciesId={speciesId} name={attackerName} className="darklaw-lab__sprite" side={attackerSide} animation={attackerAnimation} playbackPaused={!attackerPlaying && phase !== 'complete'} animationEnabled={animated && (attackerAnimation !== 'idle' || phase === 'complete')} replayKey={replayKey} finishActionBeforeIdle={false} onError={failPreview} onAnimationReady={(animation, key) => onNativeReady('A', animation, key)} onAnimationStart={onAttackerStart} onAnimationCue={(animation, key, cue) => { const current = runtime.current; if (current?.id === key && animation === 'attack' && cue === 'release') current.playback.release() }} onAnimationComplete={onAttackerComplete} />
        </div>
        <div className="darklaw-lab__attack-sprite" style={spriteStyle('B')} data-preview-sync-side="B">
          <ArkamonBattleSprite speciesId={targetId} name={targetName} className="darklaw-lab__sprite" side="front" animation={targetAnimation} playbackPaused={!targetPlaying && phase !== 'complete'} holdReactionUntilImpact={holdHitReaction} animationEnabled={animated && (targetAnimation !== 'idle' || phase === 'complete')} replayKey={replayKey} finishActionBeforeIdle={false} onError={failPreview} onAnimationReady={(animation, key) => onNativeReady('B', animation, key)} onAnimationStart={onTargetStart} onAnimationCue={(animation, key, cue) => { const current = runtime.current; if (current?.id === key && generation.current === key && animation === 'hit' && cue === 'reaction') markEvent('target-reaction') }} onAnimationComplete={onTargetComplete} />
        </div>
        {effect ? <MoveVfx key={effect.id} effect={effect} onStart={() => { const current = runtime.current; if (current?.id === effect.id) { markEvent('vfx-start'); current.playback.vfxStart() } }} onImpact={() => { const current = runtime.current; if (current?.id === effect.id) current.sequence.impact() }} onComplete={() => { const current = runtime.current; if (current?.id === effect.id) { markEvent('vfx-complete'); setEffect(null); current.sequence.vfxComplete() } }} /> : null}
      </div>
      <p className="darklaw-lab__status" role="status" aria-live="polite">{status}</p>
    </section>
  )
}
