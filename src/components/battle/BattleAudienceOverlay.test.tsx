import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BattleAudienceOverlay } from './BattleAudienceOverlay'
import { request, invitation } from '@/audience/__tests__/fixtures'

describe('private guest battle presentation', () => {
  it('never embeds the private invitation in the live battle overlay and offers an explicit regia fallback', () => {
    const markup = renderToStaticMarkup(<BattleAudienceOverlay request={{ ...request, channel: 'boss', trainer: { kind: 'Superquattro', name: 'Ospite' } }}
      round={null} status="open" remainingMs={120000} error={null} joinUrl={invitation('boss')}
      onRetry={() => {}} onCloseEarly={() => {}} onFallback={() => {}} />)
    expect(markup).toContain('L’ospite sceglie la mossa')
    expect(markup).toContain('Regia: usa la scelta automatica')
    expect(markup).not.toContain('canale=boss')
    expect(markup).not.toContain('Inquadra per votare')
    expect(markup).not.toContain('Chiudi votazione')
    expect(markup).not.toContain('voti ricevuti')
  })
})
