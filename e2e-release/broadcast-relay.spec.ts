import { test, expect } from '@playwright/test'
import { createPublicRelay } from '../scripts/public-relay.mjs'
import { seed } from './helpers'

test('a separate OBS-style profile is passive, joins late and reconnects to the compiled console', async ({ browser, baseURL }) => {
  const origin = new URL(baseURL!).origin
  let relay = createPublicRelay({ origin, port: 0 })
  const address = await relay.listen()
  const publisher = new URL(baseURL!); publisher.hash = new URLSearchParams({ publicRelay: new URL(address).host, publish: relay.publishToken }).toString()
  const viewerURL = new URL(baseURL!); viewerURL.searchParams.set('view', 'broadcast'); viewerURL.hash = new URLSearchParams({ publicRelay: new URL(address).host, viewer: relay.viewerToken }).toString()
  const consoleContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const obsContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const errors: string[] = []
  try {
    const console = await consoleContext.newPage(); await seed(console)
    console.on('pageerror', error => errors.push(error.message))
    await console.goto(baseURL!, { waitUntil: 'domcontentloaded' })
    await expect(console.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
    await console.getByRole('button', { name: 'Passa turno', exact: true }).click()
    await expect.poll(() => console.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatoreAttivo)).toBe(2)
    // Opening the publisher link in an existing console changes only its fragment.
    // It must activate the relay without remounting or reloading the game document.
    await console.evaluate(hash => { document.documentElement.dataset.relayDocument = 'console'; window.location.hash = hash }, publisher.hash)
    await expect(console).toHaveURL(publisher.href)
    // This context has no shared localStorage, IndexedDB, Web Locks or BroadcastChannel with the console.
    const obs = await obsContext.newPage(); obs.on('pageerror', error => errors.push(error.message))
    const disconnectedViewer = new URL(viewerURL); disconnectedViewer.hash = ''
    await obs.goto(disconnectedViewer.href, { waitUntil: 'domcontentloaded' })
    const publicView = obs.locator('[data-broadcast-view]')
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'false')
    await obs.evaluate(hash => { document.documentElement.dataset.relayDocument = 'viewer'; window.location.hash = hash }, viewerURL.hash)
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'true')
    await expect(obs.locator('[aria-label="Stato della gara"] [data-active="true"]')).toContainText('Maggi')
    expect(await obs.evaluate(() => localStorage.getItem('arkamon-save'))).toBeNull()
    await expect(obs.getByRole('button')).toHaveCount(0)
    await expect(obs.locator('[data-presented-scene], [data-admin-overlay]')).toHaveCount(0)
    await expect(console.locator('html')).toHaveAttribute('data-relay-document', 'console')
    await expect(obs.locator('html')).toHaveAttribute('data-relay-document', 'viewer')
    await obs.evaluate(() => { window.location.hash = '' })
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'false')
    await obs.evaluate(hash => { window.location.hash = hash }, viewerURL.hash)
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'true')
    await expect(obs.locator('html')).toHaveAttribute('data-relay-document', 'viewer')
    const before = await console.evaluate(() => localStorage.getItem('arkamon-save'))
    await obs.reload({ waitUntil: 'domcontentloaded' })
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'true')
    expect(await console.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(before)
    // Chromium's offline emulation does not terminate an already-open SSE socket.
    // Close the real server instead, so disconnect and retry exercise an actual transport outage.
    const restart = { origin, port: Number(new URL(address).port), publishToken: relay.publishToken, viewerToken: relay.viewerToken }
    await relay.close()
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'false', { timeout: 12_000 })
    await console.getByRole('button', { name: 'Passa turno', exact: true }).click()
    relay = createPublicRelay(restart); await relay.listen()
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'true')
    await expect(obs.locator('[aria-label="Stato della gara"] [data-active="true"]')).toContainText('Melia')
    await obs.screenshot({ path: test.info().outputPath('isolated-browser-source.png') })
    await console.close()
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'false', { timeout: 12_000 })
    await expect(obs.getByRole('button')).toHaveCount(0)
    expect(await obs.evaluate(() => localStorage.getItem('arkamon-save'))).toBeNull()
    expect(errors).toEqual([])
  } finally { await consoleContext.close(); await obsContext.close(); await relay.close() }
})
