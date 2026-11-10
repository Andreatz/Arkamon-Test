import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useAdminStore } from '@/store/adminStore'
import { isCampaignWritable } from '@/session/sessionOwnership'
import { useRegiaStore } from './regiaStore'
import { usePublicPresentation } from './publicPresentation'
import { makePublicSnapshot, PUBLIC_CHANNEL } from './publicSnapshot'
import { usePublicManagement } from './publicManagementStore'
import { useGameMotionPreferences, useGamePreferences } from '@/settings/gamePreferences'
import type { MotionPlayback } from '@/settings/motionPlayback'

/** Same-profile broadcasting remains the default; an explicit fragment enables a local one-way relay. */
export function PublicPresentationBridge() {
  const motion = useGameMotionPreferences()
  const currentMotion = useRef<MotionPlayback>({ speed: motion.speed === 2 ? 2 : 1, reducedMotion: motion.reducedMotion })
  currentMotion.current = { speed: motion.speed === 2 ? 2 : 1, reducedMotion: motion.reducedMotion }
  const queueMotion = useRef<() => void>(() => {})
  useEffect(() => { queueMotion.current() }, [motion.speed, motion.reducedMotion])
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(PUBLIC_CHANNEL)
    let relay: { publish: (snapshot: ReturnType<typeof makePublicSnapshot>) => void; close: () => void } | undefined
    let disposed = false
    let relaySignature = '', relayGeneration = 0
    let frame = 0
    const send = () => {
      // A hello/heartbeat can run before a queued RAF: retire its handle too.
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      if (disposed) return
      if (!isCampaignWritable()) return
      const snapshot = makePublicSnapshot(useGameStore.getState(), useAdminStore.getState().theme,
        usePublicPresentation.getState().battle, useRegiaStore.getState().paused, Date.now(), usePublicManagement.getState().request, currentMotion.current)
      channel.postMessage({ kind: 'snapshot', snapshot })
      relay?.publish(snapshot)
    }
    const syncRelay = () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const signature = params.has('publicRelay') ? `${params.get('publicRelay')}\n${params.get('publish')}` : ''
      if (signature === relaySignature) return
      relaySignature = signature
      const generation = ++relayGeneration
      relay?.close(); relay = undefined
      if (signature) void import('./publicRelayTransport').then(module => {
        const config = module.publicRelayConfiguration('publish')
        if (!disposed && generation === relayGeneration && config) { relay = module.createPublicRelayPublisher(config); send() }
      }).catch(() => { /* Optional transport failure must not interrupt the local game. */ })
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(send) }
    queueMotion.current = queue
    const releases = [useGameStore.subscribe((state, previous) => {
      if (state.scenaCorrente.scena !== previous.scenaCorrente.scena || state.campaignRevision !== previous.campaignRevision) usePublicManagement.getState().hide()
      queue()
    }), useAdminStore.subscribe(queue), useRegiaStore.subscribe(queue), usePublicPresentation.subscribe(queue), usePublicManagement.subscribe(queue), useGamePreferences.subscribe(queue)]
    channel.onmessage = event => { if (event.data?.kind === 'hello') send() }
    const timer = window.setInterval(send, 2000)
    window.addEventListener('hashchange', syncRelay)
    syncRelay()
    send()
    return () => { disposed = true; queueMotion.current = () => {}; relayGeneration++; window.removeEventListener('hashchange', syncRelay); relay?.close(); releases.forEach(release => release()); clearInterval(timer); cancelAnimationFrame(frame); channel.close(); usePublicManagement.getState().hide() }
  }, [])
  return null
}
