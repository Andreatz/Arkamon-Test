import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
// @ts-expect-error Shared standalone Node release verification utility.
import { fingerprintRelease, NATIVE_RELEASE_PROOF } from '../scripts/release-verification.mjs'

type Animation = 'idle' | 'attack' | 'hit' | 'victory' | 'ko'
interface PageRecord { src: string; encodedBytes: number; sha256: string }
interface Clip { frameCount: number; fps: number; pages: PageRecord[] }
interface Manifest { clips: Record<string, Clip> }
interface BuildProof { mediaRevision: string; mediaBase: string; manifestSha256: string; nativeClips: number; nativeFrames: number; externalAssets: { path: string; bytes: number }[] }
interface Portrait { source: string; bytes: number; sha256: string }
interface AssetCatalog { entries: { id: number; status: string; sprites: { front?: Portrait } }[] }
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex')
let artifactFingerprint: Promise<{ contentSha256: string }> | undefined

export async function verifyLocalProductionMedia(page: Page, testInfo: TestInfo) {
  const manifest = JSON.parse(readFileSync('src/data/arkamon-paged.json', 'utf8')) as Manifest
  const assetCatalog = JSON.parse(readFileSync('src/data/arkamon-assets.json', 'utf8')) as AssetCatalog
  const pin = JSON.parse(readFileSync('src/data/media-release.json', 'utf8')) as { revision: string; manifestSha256: string }
  const proof = JSON.parse(readFileSync('dist/media-release.json', 'utf8')) as BuildProof
  expect(createHash('sha256').update(JSON.stringify(manifest)).digest('hex')).toBe(pin.manifestSha256)
  expect(proof.mediaRevision).toBe(pin.revision)
  expect(proof.manifestSha256).toBe(pin.manifestSha256)
  expect(proof.nativeClips).toBe(Object.keys(manifest.clips).length)
  expect(proof.nativeFrames).toBe(Object.values(manifest.clips).reduce((sum, clip) => sum + clip.frameCount, 0))
  const origin = new URL(`https://raw.githubusercontent.com/Andreatz/Arkamon-Beta/${pin.revision}/public/`)
  expect(proof.mediaBase).toBe(origin.href)
  // Computed once per worker from the unchanged production package. The seal
  // recomputes this digest and rejects reports from a different build.
  const artifact = await (artifactFingerprint ??= fingerprintRelease('dist'))
  const publicRoot = realpathSync('public')
  const files = new Map(proof.externalAssets.map(file => [file.path, file.bytes]))
  const pages = new Map(Object.values(manifest.clips).flatMap(clip => clip.pages.map(part => [part.src.slice(1), part] as const)))
  const pendingPortraits = new Map(assetCatalog.entries.filter(entry => entry.status === 'pending-game-data' && entry.sprites.front)
    .map(entry => [entry.sprites.front!.source.slice(1), entry.sprites.front!] as const))
  const served: { path: string; bytes: number; sha256: string; nativePageFingerprintVerified: boolean; pendingPortraitFingerprintVerified: boolean }[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => {
    if (request.url().startsWith(origin.href)) errors.push(`${request.url()}: ${request.failure()?.errorText}`)
  })
  const install = page.route(url => url.origin === origin.origin && url.pathname.startsWith(origin.pathname), async route => {
    const url = new URL(route.request().url())
    try {
      if (route.request().method() !== 'GET' || url.search || url.hash) throw new Error('Unexpected media request')
      const relative = decodeURIComponent(url.pathname.slice(origin.pathname.length))
      if (!relative || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..') || !files.has(relative)) throw new Error('Media path is outside the exact build inventory')
      const target = realpathSync(path.resolve(publicRoot, relative))
      if (!target.startsWith(publicRoot + path.sep)) throw new Error('Media file is outside public')
      const data = readFileSync(target), sha256 = digest(data), native = pages.get(relative), portrait = pendingPortraits.get(relative)
      if (data.length !== files.get(relative)) throw new Error('Media size differs from the compiled inventory')
      if (relative.startsWith('sprites/arkamon-paged/') && (!native || data.length !== native.encodedBytes || sha256 !== native.sha256)) throw new Error('Native page differs from its pinned fingerprint')
      if (relative.startsWith('sprites/front_sprites/') && (!portrait || data.length !== portrait.bytes || sha256 !== portrait.sha256)) throw new Error('Pending portrait differs from its original asset fingerprint')
      const mime: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' }
      served.push({ path: relative, bytes: data.length, sha256, nativePageFingerprintVerified: !!native, pendingPortraitFingerprintVerified: !!portrait })
      await route.fulfill({ status: 200, contentType: mime[path.extname(relative)] ?? 'application/octet-stream',
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }, body: data })
    } catch (error) {
      errors.push(`${url.pathname}: ${error instanceof Error ? error.message : String(error)}`)
      await route.fulfill({ status: 404, body: 'Local pinned media verification failed' })
    }
  })
  return { manifest, assetCatalog, origin, served, errors, install,
    allPagesRequested: (species: number, animation: Animation) => manifest.clips[`/sprites/arkamon/${species}/front/${animation}.webp`].pages
      .every(part => served.some(entry => entry.path === part.src.slice(1))),
    attach: async () => {
      await testInfo.attach('Production bundle with verified local media transport', { body: JSON.stringify({
        proof: 'Local media transport only. This does not verify CDN publication or availability.', revision: pin.revision,
        mediaOrigin: origin.href, bundleUnmodified: true, served, errors,
      }, null, 2), contentType: 'application/json' })
      await testInfo.attach(NATIVE_RELEASE_PROOF, { body: JSON.stringify({ version: 1,
        contentSha256: artifact.contentSha256, mediaRevision: pin.revision, manifestSha256: pin.manifestSha256,
        nativeClips: proof.nativeClips, nativeFrames: proof.nativeFrames,
        transport: 'verified-local-pinned-media', cdnAvailabilityVerified: false,
      }), contentType: 'application/json' })
    },
  }
}

for (const species of [107, 108, 109, 110]) test(`compiled ${species}: five native actions against the pinned local media revision`, async ({ page }, testInfo) => {
  const media = await verifyLocalProductionMedia(page, testInfo)
  await media.install
  await page.goto('./#arkamon-lab')
  await page.locator('#darklaw-preview-species').selectOption(String(species))
  const comparison = page.locator('[data-preview-card="animated"]')
  const sprite = comparison.locator('[data-sprite-renderer="paged-canvas"]')
  await expect(sprite).toBeVisible()
  await expect(sprite).toHaveAttribute('data-sprite-fps', '24')
  await expect.poll(() => media.allPagesRequested(species, 'idle')).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('compiled-native-idle.png') })
  for (const [action, label] of [['attack', 'Attacco'], ['hit', 'Colpito'], ['victory', 'Vittoria'], ['ko', 'KO']] as const) {
    const clip = media.manifest.clips[`/sprites/arkamon/${species}/front/${action}.webp`]
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(sprite).toHaveAttribute('data-sprite-src', new RegExp(`/sprites/arkamon/${species}/front/${action}\\.webp$`))
    await expect(sprite).toHaveAttribute('data-sprite-frame-count', String(clip.frameCount))
    await expect(sprite).toHaveAttribute('data-sprite-fps', String(clip.fps))
    await expect.poll(() => media.allPagesRequested(species, action)).toBe(true)
    if (action === 'ko') {
      await expect(sprite).toHaveAttribute('data-sprite-frame', String(clip.frameCount - 1))
      await page.waitForTimeout(250)
      await expect(sprite).toHaveAttribute('data-sprite-frame', String(clip.frameCount - 1))
    } else {
      await expect(sprite).toHaveAttribute('data-sprite-src', new RegExp(`/sprites/arkamon/${species}/front/idle\\.webp$`))
    }
  }
  await expect(comparison.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
  expect(media.errors).toEqual([])
  await media.attach()
})

for (const species of Array.from({ length: 46 }, (_, index) => index + 111)) test(`compiled ${species}: pending form plays five native actions without game data`, async ({ page }, testInfo) => {
  const media = await verifyLocalProductionMedia(page, testInfo)
  await media.install
  await page.goto('./#arkamon-lab')
  await page.locator('#darklaw-preview-species').selectOption(String(species))
  const lab = page.locator('[data-darklaw-lab]')
  await expect(lab).toHaveAttribute('data-asset-status', 'pending-game-data')
  await expect(lab).toHaveAttribute('data-preview-available', 'true')
  await expect(page.locator('[data-asset-pending]')).toContainText('Nome, mosse e attributi da definire')
  const reference = page.locator('[data-preview-card="static"] img')
  await expect(reference).toHaveAttribute('src', new RegExp(`/sprites/front_sprites/${species}\\.png$`))
  await expect.poll(() => reference.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true)
  await reference.evaluate(element => (element as HTMLImageElement).decode())
  await expect(page.locator('#arkamon-preview-move')).toHaveCount(0)
  await expect(page.locator('#arkamon-preview-target')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retro', exact: true })).toBeDisabled()
  const gameplay = JSON.parse(readFileSync('src/data/pokemon.json', 'utf8')) as { id: number }[]
  expect(gameplay.some(entry => entry.id === species)).toBe(false)
  const comparison = page.locator('[data-preview-card="animated"]')
  const sprite = comparison.locator('[data-sprite-renderer="paged-canvas"]')
  await expect(sprite).toBeVisible()
  await expect(sprite).toHaveAttribute('data-sprite-fps', '24')
  await expect.poll(() => media.allPagesRequested(species, 'idle')).toBe(true)
  for (const [action, label] of [['attack', 'Attacco'], ['hit', 'Colpito'], ['victory', 'Vittoria'], ['ko', 'KO']] as const) {
    const clip = media.manifest.clips[`/sprites/arkamon/${species}/front/${action}.webp`]
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(sprite).toHaveAttribute('data-sprite-src', new RegExp(`/sprites/arkamon/${species}/front/${action}\\.webp$`))
    await expect(sprite).toHaveAttribute('data-sprite-frame-count', String(clip.frameCount))
    await expect(sprite).toHaveAttribute('data-sprite-fps', String(clip.fps))
    await expect.poll(() => media.allPagesRequested(species, action)).toBe(true)
    if (action === 'ko') {
      await expect(sprite).toHaveAttribute('data-sprite-frame', String(clip.frameCount - 1))
      await page.waitForTimeout(250)
      await expect(sprite).toHaveAttribute('data-sprite-frame', String(clip.frameCount - 1))
    } else {
      await expect(sprite).toHaveAttribute('data-sprite-src', new RegExp(`/sprites/arkamon/${species}/front/idle\\.webp$`))
    }
  }
  await expect(comparison.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
  expect(media.errors).toEqual([])
  await page.locator('.darklaw-lab__comparison').screenshot({ path: testInfo.outputPath('compiled-pending-native.png') })
  await media.attach()
})

for (const species of [205, 184, 206]) test(`compiled ${species}: pending portrait uses the exact pinned original without game data`, async ({ page }, testInfo) => {
  const media = await verifyLocalProductionMedia(page, testInfo)
  await media.install
  const original = media.assetCatalog.entries.find(entry => entry.id === species)
  expect(original?.status).toBe('pending-game-data')
  const portrait = original!.sprites.front!
  const originalUrl = new URL(portrait.source.slice(1), media.origin).href
  await page.goto('./#arkamon-lab')
  await page.locator('#darklaw-preview-species').selectOption(String(species))
  const lab = page.locator('[data-darklaw-lab]')
  await expect(lab).toHaveAttribute('data-asset-status', 'pending-game-data')
  await expect(lab).toHaveAttribute('data-preview-available', 'false')
  await expect(page.locator('[data-asset-pending]')).toContainText('Nome, mosse e attributi da definire')
  await expect(page.getByText('Nessun video disponibile', { exact: false }).first()).toBeVisible()
  const portraits = page.locator('[data-asset-portrait]')
  await expect(portraits).toHaveCount(2)
  for (const displayed of await portraits.all()) {
    await expect(displayed).toHaveAttribute('data-asset-image-state', 'ready')
    await expect(displayed).toBeVisible()
    await expect(displayed.locator('image')).toHaveAttribute('href', originalUrl)
  }
  await expect.poll(() => media.served.some(entry => entry.path === portrait.source.slice(1)
    && entry.sha256 === portrait.sha256 && entry.bytes === portrait.bytes && entry.pendingPortraitFingerprintVerified)).toBe(true)
  await expect(lab.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(0)
  await expect(page.locator('#arkamon-preview-move')).toHaveCount(0)
  await expect(page.locator('#arkamon-preview-target')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retro', exact: true })).toBeDisabled()
  const gameplay = JSON.parse(readFileSync('src/data/pokemon.json', 'utf8')) as { id: number }[]
  expect(gameplay.some(entry => entry.id === species)).toBe(false)
  expect(media.served.some(entry => entry.path.startsWith(`sprites/arkamon-paged/${species}/`))).toBe(false)
  expect(media.errors).toEqual([])
  await page.locator('.darklaw-lab__comparison').screenshot({ path: testInfo.outputPath('compiled-pending-portrait.png') })
  await media.attach()
})

for (const [attacker, target] of [[107, 110], [108, 109]]) test(`compiled ${attacker} versus ${target}: native release and reaction cues complete the real VFX lifecycle`, async ({ page }, testInfo) => {
  const media = await verifyLocalProductionMedia(page, testInfo)
  await media.install
  await page.goto('./#arkamon-lab')
  await page.locator('#darklaw-preview-species').selectOption(String(attacker))
  const comparison = page.locator('[data-preview-card="animated"]')
  await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toBeVisible()
  await page.locator('#arkamon-preview-target').selectOption(String(target))
  const play = page.getByRole('button', { name: 'Prova attacco con VFX', exact: true })
  await play.click()
  const stage = page.locator('[data-preview-sync-phase]')
  await expect(stage.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(2)
  await expect(stage.locator('[data-arkamon-renderer="procedural"]')).toHaveCount(0)
  await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(0)
  await expect(stage).toHaveAttribute('data-preview-sync-phase', 'complete', { timeout: 30_000 })
  const events: { event: string; atMs: number }[] = JSON.parse((await stage.getAttribute('data-preview-sync-events'))!)
  for (const name of ['attacker-ready', 'target-ready', 'release', 'impact', 'target-reaction', 'attacker-complete', 'target-complete', 'complete']) expect(events.filter(entry => entry.event === name)).toHaveLength(1)
  expect(events.find(entry => entry.event === 'target-reaction')!.atMs).toBeGreaterThanOrEqual(events.find(entry => entry.event === 'impact')!.atMs)
  await expect(stage.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(0)
  await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toBeVisible()
  await expect(play).toBeEnabled()
  expect(media.served.some(entry => entry.path.startsWith(`sprites/arkamon-paged/${attacker}/front/attack/`) && entry.nativePageFingerprintVerified)).toBe(true)
  expect(media.served.some(entry => entry.path.startsWith(`sprites/arkamon-paged/${target}/front/hit/`) && entry.nativePageFingerprintVerified)).toBe(true)
  expect(media.errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('compiled-native-attack-complete.png'), fullPage: true })
  await media.attach()
})
