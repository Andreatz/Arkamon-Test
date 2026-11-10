import { describe, expect, it } from 'vitest'
import { fitSplashFrame, type SplashFrameBounds, type SplashFrameInput, type SplashFrameResult } from '../reference/splashFraming'

const fixture = (): SplashFrameInput => ({
  canvas: { width: 1600, height: 1000 }, image: { width: 1920, height: 1080 },
  focus: { left: .4, top: .3, right: .6, bottom: .7 },
  available: { left: 550, top: 200, right: 1100, bottom: 800 },
})

function expectInside(result: SplashFrameResult | null, bounds: SplashFrameBounds) {
  expect(result).not.toBeNull()
  expect(result!.focusFits).toBe(true)
  expect(result!.focus.left).toBeGreaterThanOrEqual(bounds.left - 1e-7)
  expect(result!.focus.top).toBeGreaterThanOrEqual(bounds.top - 1e-7)
  expect(result!.focus.right).toBeLessThanOrEqual(bounds.right + 1e-7)
  expect(result!.focus.bottom).toBeLessThanOrEqual(bounds.bottom + 1e-7)
}

function expectContinuousCoverage(result: SplashFrameResult, input: SplashFrameInput) {
  const { left, top, width, height } = result.renderedImage
  expect(left).toBeLessThanOrEqual(1e-7)
  expect(top).toBeLessThanOrEqual(1e-7)
  expect(left + width).toBeGreaterThanOrEqual(input.canvas.width - 1e-7)
  expect(top + height).toBeGreaterThanOrEqual(input.canvas.height - 1e-7)
  expect(width / height).toBeCloseTo(input.image.width / input.image.height)
  expect(Math.min(width / input.canvas.width, height / input.canvas.height)).toBeCloseTo(1)
}

describe('One full-canvas splash painting', () => {
  it('shows the complete source at 16:9 without changing its authored composition', () => {
    const input = { ...fixture(), canvas: { width: 1920, height: 1080 }, available: { left: 600, top: 200, right: 1300, bottom: 900 } }
    const result = fitSplashFrame(input)!
    expectInside(result, input.available)
    expect(result.renderedImage).toEqual({ left: 0, top: 0, width: 1920, height: 1080 })
    expect(result.position).toEqual({ x: .5, y: .5 })
    expect(result.focus).toEqual({ left: 768, top: 324, right: 1152, bottom: 756 })
  })

  it('covers 16:10 with sharp source pixels instead of letterboxing or a blurred duplicate', () => {
    const input = fixture(), result = fitSplashFrame(input)!
    expectInside(result, input.available)
    expectContinuousCoverage(result, input)
    expect(result.renderedImage.width).toBeCloseTo(1777.7777778)
    expect(result.renderedImage.height).toBe(1000)
    expect(result.position).toEqual({ x: .5, y: .5 })
  })

  it('pans only within the available vertical cover crop in a shorter gallery', () => {
    const input: SplashFrameInput = { ...fixture(), canvas: { width: 1600, height: 600 }, focus: { left: .4, top: .4, right: .6, bottom: .7 }, available: { left: 550, top: 120, right: 1100, bottom: 420 } }
    const result = fitSplashFrame(input)!
    expectInside(result, input.available)
    expectContinuousCoverage(result, input)
    expect(result.renderedImage.top).toBeCloseTo(-210)
    expect(result.renderedImage.width).toBe(1600)
    expect(result.renderedImage.height).toBe(900)
    expect(result.position.y).toBeCloseTo(.7)
  })

  it('pans within a horizontal cover crop without moving the canvas offscreen', () => {
    const input: SplashFrameInput = { ...fixture(), canvas: { width: 1000, height: 1000 }, focus: { left: .6, top: .3, right: .8, bottom: .7 }, available: { left: 300, top: 200, right: 700, bottom: 800 } }
    const result = fitSplashFrame(input)!
    expectInside(result, input.available)
    expectContinuousCoverage(result, input)
    expect(result.focus.right).toBeCloseTo(700)
    expect(result.position.x).toBeGreaterThan(.5)
  })

  it('reports an oversized source composition instead of shrinking the whole painting', () => {
    const input = { ...fixture(), canvas: { width: 1920, height: 1080 }, available: { left: 800, top: 350, right: 1100, bottom: 700 } }
    const result = fitSplashFrame(input)!
    expect(result.focusFits).toBe(false)
    expectContinuousCoverage(result, input)
    expect(result.renderedImage).toEqual({ left: 0, top: 0, width: 1920, height: 1080 })
    expect(result.focus.right - result.focus.left).toBe(384)
  })

  it('does not open empty edges when a face is outside the reachable cover crop', () => {
    const input: SplashFrameInput = { ...fixture(), canvas: { width: 1600, height: 600 }, focus: { left: .4, top: .05, right: .6, bottom: .3 }, available: { left: 550, top: 120, right: 1100, bottom: 450 } }
    const result = fitSplashFrame(input)!
    expect(result.focusFits).toBe(false)
    expectContinuousCoverage(result, input)
    expect(result.renderedImage.top).toBe(0)
  })

  it('preserves a valid authored cover position', () => {
    const input: SplashFrameInput = { ...fixture(), preferredPosition: { x: .3, y: .8 } }
    const result = fitSplashFrame(input)!
    expectInside(result, input.available)
    expect(result.position.x).toBeCloseTo(.3)
  })

  it.each([
    { canvas: { width: 0, height: 900 } },
    { image: { width: 1920, height: Number.NaN } },
    { preferredPosition: { x: -.1, y: .5 } },
    { preferredPosition: { x: .5, y: 1.1 } },
    { preferredPosition: { x: Number.NaN, y: .5 } },
    { focus: { left: .5, top: .3, right: .4, bottom: .7 } },
    { focus: { left: -.1, top: .3, right: .6, bottom: .7 } },
    { available: { left: 600, top: 100, right: 600, bottom: 800 } },
    { available: { left: 500, top: 100, right: 1700, bottom: 800 } },
  ])('returns null for invalid geometry: %j', override => {
    expect(fitSplashFrame({ ...fixture(), ...override })).toBeNull()
  })
})
