import { useEffect, useRef, useState } from 'react'
import { AudienceTurnController, cancelAudienceRequest, idleAudienceTurn } from './audienceTurnController'
import type { AudienceTurnState } from './audienceTurnController'
import { useAudienceStore } from './useAudienceStore'
import type { AudienceHostSession, AudienceRoundRequest } from './types'

export function useAudienceTurn(request: AudienceRoundRequest | null) {
  const session = useAudienceStore((state) => state.session)
  const publicEnabled = useAudienceStore((state) => state.enabled)
  const guestEnabled = useAudienceStore((state) => state.guestEnabled)
  const enabled = request?.channel === 'boss' ? guestEnabled : publicEnabled
  const controller = useRef<AudienceTurnController | null>(null)
  const lastContext = useRef<{ session: AudienceHostSession; request: AudienceRoundRequest } | null>(null)
  const [result, setResult] = useState<{ state: AudienceTurnState; identity: string }>({ state: idleAudienceTurn, identity: '' })
  const requestIdentity = request ? JSON.stringify(request) : ''
  // The invitation and expiry are refreshed during polling; only capability replacement restarts this client.
  const sessionIdentity = session ? `${session.serviceUrl}|${session.sessionId}|${session.hostToken}` : ''
  const identity = `${sessionIdentity}|${requestIdentity}`

  useEffect(() => {
    if (!request || !session || !enabled) {
      setResult({ state: { ...idleAudienceTurn, turnKey: request?.turnKey ?? null }, identity })
      return
    }
    lastContext.current = { session, request }
    const client = new AudienceTurnController(session, request, (state) => setResult({ state, identity }),
      (snapshot) => useAudienceStore.getState().acceptSnapshot(session.sessionId, snapshot),
      () => useAudienceStore.getState().expireSession(session.sessionId))
    controller.current = client
    void client.start()
    return () => {
      client.dispose()
      if (controller.current === client) controller.current = null
    }
    // Request identity is stable across React rerenders and complete across move/context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestIdentity, sessionIdentity, enabled])

  const visible = result.identity === identity && result.state.turnKey === request?.turnKey && !!session && enabled ? result.state : { ...idleAudienceTurn, turnKey: request?.turnKey ?? null }
  return {
    ...visible,
    retry: () => controller.current?.start() ?? Promise.resolve(),
    closeEarly: () => controller.current?.closeEarly() ?? Promise.resolve(),
    cancel: async () => {
      if (controller.current) { await controller.current.cancel(); return }
      const context = lastContext.current
      if (!context) return
      const snapshot = await cancelAudienceRequest(context.session, context.request)
      useAudienceStore.getState().acceptSnapshot(context.session.sessionId, snapshot)
    },
  }
}
