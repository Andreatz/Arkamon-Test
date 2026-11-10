import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { getArkamonAnimationAsset, getArkamonRuntimeAsset, type ArkamonBattleAnimation } from '../arkamonAnimationManifest'

const SPECIES_IDS = Array.from({ length: 156 }, (_, index) => index + 1)
const ANIMATIONS: ArkamonBattleAnimation[] = ['idle', 'attack', 'hit', 'victory', 'ko']

const conversionCache = new Map<string, ReturnType<typeof JSON.parse>>()

function readConversion(speciesId: number, animation: ArkamonBattleAnimation) {
  const path = resolve(`public/sprites/arkamon/${speciesId}/front/${animation}.metadata.json`)
  if (!conversionCache.has(path)) conversionCache.set(path, JSON.parse(readFileSync(path, 'utf8')))
  return conversionCache.get(path)!
}

describe.each(SPECIES_IDS.flatMap((speciesId) => ANIMATIONS.map((animation) => ({ speciesId, animation }))))(
  'species $speciesId $animation assets', ({ speciesId, animation }) => {
  const asset = getArkamonAnimationAsset(speciesId, 'front', animation)!
  const assetPath = resolve('public', asset.src.replace(/^\/+/, ''))

  it('matches the runtime frame grid to the actual transparent static atlas', async () => {
    const image = await sharp(assetPath).metadata()
    const conversion = readConversion(speciesId, animation)
    const sheet = readFileSync(assetPath)
    expect(sheet.byteLength).toBeGreaterThan(0)
    expect(createHash('sha256').update(sheet).digest('hex')).toBe(conversion.sheet.sha256)
    expect(sheet.byteLength).toBe(conversion.sheet.sizeBytes)
    expect(image.width).toBe(asset.frameWidth * asset.columns)
    expect(image.height).toBe(asset.frameHeight * asset.rows)
    expect(image.hasAlpha).toBe(true)
    expect(image.pages ?? 1).toBe(1)
    const posterPath = resolve(`public/sprites/arkamon/${speciesId}/front/${conversion.poster.file}`)
    const poster = readFileSync(posterPath)
    const posterImage = await sharp(posterPath).metadata()
    expect(conversion.poster.frameIndex).toBe(0)
    expect(poster.byteLength).toBeGreaterThan(0)
    expect(poster.byteLength).toBe(conversion.poster.sizeBytes)
    expect(createHash('sha256').update(poster).digest('hex')).toBe(conversion.poster.sha256)
    expect(posterImage.width).toBe(asset.frameWidth)
    expect(posterImage.height).toBe(asset.frameHeight)
    expect(posterImage.hasAlpha).toBe(true)
    expect(conversion.speciesId).toBe(speciesId)
    expect(conversion.view).toBe('front')
    expect(conversion.action).toBe(animation)
    if (animation === 'attack') {
      expect(conversion.timing.releaseFrame).toBe(asset.releaseFrame)
      expect(conversion.timing.releaseMs).toBeCloseTo(asset.releaseFrame! / asset.fps * 1000)
    } else if (animation === 'hit') {
      expect(conversion.timing.reactionFrame).toBe(asset.reactionFrame)
      expect(conversion.timing.reactionMs).toBeCloseTo(asset.reactionFrame! / asset.fps * 1000)
    }
    expect(conversion.sheet).toMatchObject({
      frameCount: asset.frameCount, fps: asset.fps,
      cellWidth: asset.frameWidth, cellHeight: asset.frameHeight,
      columns: asset.columns, rows: asset.rows,
    })
    expect(conversion.transform.fixedTransformAcrossFrames).toBe(true)
    expect(conversion.transform.sharedTransform).toEqual(readConversion(speciesId, 'idle').transform.sharedTransform)
    expect(conversion.transform.cameraCalibration.constantForEntireClip).toBe(true)
    expect(conversion.transform.sourceFrameAlphaBounds).toHaveLength(asset.frameCount)
    expect(conversion.transform.outputFrameAlphaBounds).toHaveLength(asset.frameCount)
    for (const bounds of conversion.transform.outputFrameAlphaBounds) {
      // A source KO may deliberately end with a fully transparent frame.
      if (bounds === null) continue
      const [left, top, right, bottom] = bounds
      expect(left).toBeGreaterThanOrEqual(0)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(right).toBeLessThanOrEqual(asset.frameWidth)
      expect(bottom).toBeLessThanOrEqual(asset.frameHeight)
      expect(right).toBeGreaterThanOrEqual(left)
      expect(bottom).toBeGreaterThanOrEqual(top)
    }
    const viewport = conversion.sheet.viewport
    expect(viewport).toEqual(asset.viewport)
    expect(viewport).toEqual(readConversion(speciesId, 'idle').sheet.viewport)
    expect(viewport.width).toBeGreaterThan(0)
    expect(viewport.height).toBeGreaterThan(0)
    expect(viewport.left).toBeGreaterThanOrEqual(0)
    expect(viewport.top).toBeGreaterThanOrEqual(0)
    expect(viewport.left + viewport.width).toBeLessThanOrEqual(asset.frameWidth)
    expect(viewport.top + viewport.height).toBeLessThanOrEqual(asset.frameHeight)
  })

  it('preserves every original source frame in order at its native rate and full duration', () => {
    const conversion = readConversion(speciesId, animation)
    expect(conversion.source.file).toBe(`animation-source/raw/${speciesId}/front/${animation}.mp4`)
    const video = readFileSync(resolve(conversion.source.file))
    // The duplicate "36 defeat.mp4" was removed by the supplied source update;
    // "36 ko.mp4" has the same SHA-256 as the original canonical KO video.
    const suppliedAction = speciesId === 69 && animation === 'hit' ? 'hiy' : animation
    const suppliedVideo = readFileSync(resolve(`public/sprites/animation/Front/${speciesId} ${suppliedAction}.mp4`))
    expect(video.byteLength).toBeGreaterThan(0)
    expect(suppliedVideo.byteLength).toBeGreaterThan(0)
    expect(video.equals(suppliedVideo)).toBe(true)
    expect(createHash('sha256').update(video).digest('hex')).toBe(conversion.source.sha256)
    expect(createHash('sha256').update(suppliedVideo).digest('hex')).toBe(conversion.source.sha256)
    expect(video.byteLength).toBe(conversion.source.sizeBytes)
    expect(suppliedVideo.byteLength).toBe(conversion.source.sizeBytes)
    expect(conversion.source.decodedFrameCount).toBe(asset.frameCount)
    expect(conversion.source.fps).toBe(asset.fps)
    expect(conversion.sampling.allSourceFramesPreserved).toBe(true)
    expect(conversion.sampling.sourceFrameIndices).toEqual(Array.from({ length: asset.frameCount }, (_, index) => index))
    expect(conversion.sheet.durationSeconds).toBeCloseTo(asset.frameCount / asset.fps)
    expect(conversion.source.decodedFrameCount / conversion.source.fps).toBeCloseTo(conversion.sheet.durationSeconds)
    expect(asset.durationMs).toBeCloseTo(conversion.sheet.durationSeconds * 1000)
  })

  if ([118, 119, 122, 123, 124, 128, 129, 130, 131, 132, 133, 135, 136, 137, 138, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156].includes(speciesId)) {
    it('fits the character body to its official portrait size while retaining effects in canvas padding', () => {
      const normalization = readConversion(speciesId, animation).transform.sharedTransform
      expect(normalization.scaleReference).toBe('Initial opaque body; all native motion and effects retained in canvas padding.')
      const expectedBodyHeight = normalization.viewport.height * normalization.reference.bodyHeightFraction
      expect(normalization.idleBodyHeightOutputPixels).toBeGreaterThanOrEqual(expectedBodyHeight * .95)
      expect(normalization.idleBodyHeightOutputPixels).toBeLessThanOrEqual(expectedBodyHeight * 1.02)
      expect(normalization).toEqual(readConversion(speciesId, 'idle').transform.sharedTransform)
    })
  }

  it('makes the opening frame transparent while retaining the original opaque artwork', async () => {
    // Inspect the actual first runtime page; decoding every giant atlas only to
    // crop its opening cell needlessly expands hundreds of megabytes per test.
    const firstPage = getArkamonRuntimeAsset(asset).pages?.[0]
    expect(firstPage?.firstFrame).toBe(0)
    const { data, info } = await sharp(resolve('public', firstPage!.src.slice(1)))
      .extract({ left: 0, top: 0, width: asset.frameWidth, height: asset.frameHeight })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const conversion = readConversion(speciesId, animation)
    const poster = await sharp(resolve(`public/sprites/arkamon/${speciesId}/front/${conversion.poster.file}`)).ensureAlpha().raw().toBuffer()
    const blueScreen = conversion.key.screenColour === 'blue'
    const nativeGreenAllowed = conversion.qa.nativeGreenPixelsAllowed === true
    let transparent = 0, opaqueArtwork = 0, darkFur = 0, redDetails = 0, greenSpill = 0, blueSpill = 0, opaqueGreen = 0
    let visiblePixelsDiffer = false
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a !== poster[i + 3] || a > 0 && (r !== poster[i] || g !== poster[i + 1] || b !== poster[i + 2])) visiblePixelsDiffer = true
      if (a === 0) transparent++
      if (a > 240) opaqueArtwork++
      if (a > 240 && r < 100 && g < 100 && b < 100) darkFur++
      if (a > 200 && r > g + 35 && r > b + 20) redDetails++
      if (a > 16 && g > Math.max(r, b) + 8) greenSpill++
      if (a > 16 && b > Math.max(r, g) + 8) blueSpill++
      if (a > 240 && g > Math.max(r, b) + 8) opaqueGreen++
    }
    expect(visiblePixelsDiffer).toBe(false)
    expect(transparent).toBeGreaterThan(info.width * info.height * 0.25)
    expect(opaqueArtwork).toBeGreaterThan(1000)
    expect(Boolean(conversion.key.preserveSaturatedGreenBody)).toBe([130, 131, 132, 133, 134, 135, 136].includes(speciesId) && animation === 'idle')
    if (speciesId === 5) {
      expect(darkFur).toBeGreaterThan(1000)
      expect(redDetails).toBeGreaterThan(100)
    }
    if (blueScreen) {
      expect(blueSpill).toBe(0)
      expect(conversion.qa.remainingBlueDominantPixelsOver8).toBe(0)
      expect([28, 29, 52, 53, 54, 69, 70, 82, 93, 95, 96, 97, 98, 99, 100, 105, 106, 123, 124, 127]).toContain(speciesId)
      // Reliskull carries small algae patches at logical size 192; the older
      // blue-screen forms have much larger green leaves or body regions.
      if (speciesId <= 82) expect(opaqueGreen).toBeGreaterThan(speciesId === 82 ? 300 : 1000)
    } else if (conversion.key.preserveSaturatedGreenBody) {
      expect(nativeGreenAllowed).toBe(true)
      expect([130, 131, 132, 133, 134, 135, 136]).toContain(speciesId)
      expect(animation).toBe('idle')
      expect(conversion.key.preserveSaturatedGreenBody).toEqual({
        minimumBaseAlpha: .4, interiorErosionPixels: 2, screenRatioDeviationFade: [.12, .22],
        minimumOtherChannel: 40, minimumGreen: 100, sourceRgbRetainedInOpaqueInteriors: true,
        screenPocketsAndLowCoverageFadesUnchanged: true,
      })
      // These supplied characters have saturated green body regions. A fully
      // despilled gray body must not pass merely because it has no green spill.
      expect(opaqueGreen).toBeGreaterThan(0)
    } else if (nativeGreenAllowed) {
      expect([26, 27, 45]).toContain(speciesId)
      expect(conversion.key.preserveGreenBody.screenPocketsExcluded).toBe(true)
      if (speciesId === 26 || speciesId === 27) {
        expect(opaqueGreen).toBeGreaterThan(1000)
      } else {
        // Ghost forms have dark bodies and sparse native wisps, rather than leaves.
        expect(darkFur).toBeGreaterThan(1000)
        expect(opaqueGreen).toBeLessThan(opaqueArtwork * 0.01)
      }
    } else {
      expect(greenSpill).toBe(0)
    }
    expect(data[3]).toBe(0)
  }, 15_000)
})
