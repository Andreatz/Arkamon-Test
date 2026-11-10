import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminAudiencePanel } from '../AdminAudiencePanel'
import { useAudienceStore } from '../useAudienceStore'
import { hostToken, session, snapshot } from './fixtures'

vi.mock('../useAudienceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useAudienceStore')>()
  return {
    ...actual,
    useAudienceStore: Object.assign(
      (selector?: (state: ReturnType<typeof actual.useAudienceStore.getState>) => unknown) => selector ? selector(actual.useAudienceStore.getState()) : actual.useAudienceStore.getState(),
      actual.useAudienceStore,
    ),
  }
})
const initial = useAudienceStore.getState()
beforeEach(() => useAudienceStore.setState({ enabled: false, durationSeconds: 15, serviceUrl: '', session: null, snapshot: null, connectionStatus: 'disconnected', error: null, disconnectFailed: false }))
afterEach(() => useAudienceStore.setState(initial))

describe('condivisione dei due inviti con il pubblico', () => {
  it('separa i due inviti e non rende la capacità host nel pannello o nei campi da condividere', () => {
    useAudienceStore.setState({ session, snapshot, serviceUrl: session.serviceUrl, connectionStatus: 'connected' })
    const markup = renderToStaticMarkup(<AdminAudiencePanel />)
    expect(markup).toContain('Allenatori NPC')
    expect(markup).toContain('Ospite privato')
    expect(markup).toContain('canale=npc')
    expect(markup).not.toContain('canale=boss')
    expect(markup).toContain('4 partecipanti iscritti al pubblico')
    expect(markup).toContain('Il vecchio canale boss non verrà usato')
    expect(markup).not.toContain(hostToken)
    expect(markup).not.toContain('fallbackIndex')
  })
  it('prima del collegamento mostra come rendere gli inviti raggiungibili senza suggerire localhost ai telefoni', () => {
    const markup = renderToStaticMarkup(<AdminAudiencePanel />)
    expect(markup).toContain('raggiungibile anche dai telefoni')
    expect(markup).toContain('placeholder="https://il-tuo-sito.example"')
    expect(markup).toContain('Fai votare il pubblico nelle sole battaglie NPC')
    expect(markup).not.toContain('canale=npc')
    expect(markup).not.toContain('http://localhost')
  })
  it('nasconde per impostazione iniziale il QR privato anche quando il protocollo ospite è disponibile', () => {
    useAudienceStore.setState({ session, snapshot: { ...snapshot, guest: { protocol: 'private-guest-v1', claimed: true, revoked: false, expiresAt: snapshot.expiresAt, generation: 1 } }, serviceUrl: session.serviceUrl, connectionStatus: 'connected' })
    const markup = renderToStaticMarkup(<AdminAudiencePanel />)
    expect(markup).toContain('Ospite collegato · 1 / 1')
    expect(markup).toContain('Mostra invito privato')
    expect(markup).not.toContain('canale=boss')
    expect(markup).not.toContain(hostToken)
  })
  it('offre il recupero locale soltanto dopo una chiusura fallita, spiegando la scadenza remota', () => {
    useAudienceStore.setState({ session, snapshot, serviceUrl: session.serviceUrl, connectionStatus: 'error', enabled: false })
    expect(renderToStaticMarkup(<AdminAudiencePanel />)).not.toContain('Scollega questo computer')
    useAudienceStore.setState({ disconnectFailed: true })
    const markup = renderToStaticMarkup(<AdminAudiencePanel />)
    expect(markup).toContain('Scollega questo computer')
    expect(markup).toContain('QR resteranno attivi sul sito fino alla scadenza')
    expect(markup).not.toContain(hostToken)
  })
})
