import { useEffect, useState } from 'react'
import { getPokemon, getMossa } from '@/data'
import { useGamePreferences } from '@/settings/gamePreferences'
import { getPreparedImageStats, setPreparedImageBudget } from '@/utils/prepareImageAsset'
import { nativeSpritePageCache } from '@/utils/spritePageCache'
import { prepareMoveVfxPlayback, preloadMoveVfxForPokemon } from '@/components/vfx/preloadVfxAssets'

export function getBattleReadinessPlan(active: readonly number[], reserves: readonly number[]) {
  const current = [...new Set(active)]
  return { current, deferred: [...new Set(reserves)].filter(id => !current.includes(id)) }
}

/** Active combatants first; reserves warm at idle, one species at a time, without blocking a turn. */
export function useBattleAssetReadiness(active: readonly number[], reserves: readonly number[]) {
  const memory = useGamePreferences(state => state.graphicsMemory)
  const identity = active.join(':')
  const reserveIdentity = reserves.join(':')
  const [ready, setReady] = useState(false)
  const [metrics, setMetrics] = useState({ images: getPreparedImageStats(), pages: nativeSpritePageCache.stats() })
  useEffect(() => {
    setPreparedImageBudget((memory === 'low' ? 48 : 128) * 1024 * 1024)
    const timer = window.setInterval(() => setMetrics({ images: getPreparedImageStats(), pages: nativeSpritePageCache.stats() }), 1500)
    return () => window.clearInterval(timer)
  }, [memory])
  useEffect(() => {
    const plan = getBattleReadinessPlan(active, reserves)
    let cancelled = false
    let idle: number | undefined
    let timer: number | undefined
    setReady(false)
    const moves = [...new Set(plan.current.flatMap(id => getPokemon(id)?.mosse ?? []).filter(Boolean))]
      .map(getMossa).filter((move): move is NonNullable<typeof move> => !!move)
    // prepareImageAsset deduplicates simultaneous requests with the renderer.
    void Promise.all(moves.map(move => prepareMoveVfxPlayback(move, 0))).then(() => { if (!cancelled) setReady(true) })
    const next = () => {
      if (cancelled) return
      const id = plan.deferred.shift()
      if (id === undefined) return
      preloadMoveVfxForPokemon([id])
      schedule()
    }
    const schedule = () => {
      if (!plan.deferred.length || cancelled) return
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(next, { timeout: 3000 })
      else timer = window.setTimeout(next, 800)
    }
    schedule()
    return () => { cancelled = true; if (idle !== undefined) window.cancelIdleCallback(idle); if (timer !== undefined) window.clearTimeout(timer) }
    // Contents are represented by stable identity keys rather than array references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, reserveIdentity])
  return { ready, metrics }
}
