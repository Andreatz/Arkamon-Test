import { renderToStaticMarkup } from 'react-dom/server'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POKEMON_BASE } from '@/data'
import { SpeciesPortrait } from '../kit'
import { getPortraitFraming } from '../portraitFraming'

const appearance = vi.hoisted(() => ({ reference: true }))
vi.mock('../reference/referenceTheme', () => ({ isReferenceUi: () => appearance.reference }))
beforeEach(() => { appearance.reference = true })

const samples = [
  '/sprites/front_sprites/13.png', '/sprites/front_sprites/25.png',
  '/sprites/front_sprites/56.png', '/sprites/front_sprites/76.png', '/sprites/front_sprites/110.png',
  '/sprites/front_sprites/19.png', '/sprites/front_sprites/24.png',
  '/sprites/front_sprites/34.png', '/sprites/front_sprites/35.png',
  '/sprites/front_sprites/36.png', '/sprites/front_sprites/37.png', '/sprites/front_sprites/38.png',
]

describe('Whole-creature portrait framing', () => {
  it.each(samples)('centres every visible pixel of %s without changing its aspect ratio', async source => {
    const { data, info } = await sharp(resolve(`public${source}`)).ensureAlpha().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true })
    let left = info.width, top = info.height, right = 0, bottom = 0
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[y * info.width + x] === 0) continue
        left = Math.min(left, x); top = Math.min(top, y)
        right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1)
      }
    }
    const frame = getPortraitFraming(source)
    const [x, y, width, height] = frame.viewBox.split(' ').map(Number)
    expect(frame.width).toBe(info.width)
    expect(frame.height).toBe(info.height)
    expect(width).toBe(height)
    expect(width).toBeGreaterThan(Math.max(right - left, bottom - top))
    expect(x).toBeLessThan(left)
    expect(y).toBeLessThan(top)
    expect(x + width).toBeGreaterThan(right)
    expect(y + height).toBeGreaterThan(bottom)
    expect(x + width / 2).toBeCloseTo((left + right) / 2)
    expect(y + height / 2).toBeCloseTo((top + bottom) / 2)
  })

  it('keeps the official full-body front sprite and its own geometry for every large hero', () => {
    expect(POKEMON_BASE).toHaveLength(110)
    for (const species of POKEMON_BASE) {
      const source = `/sprites/front_sprites/${species.id}.png`
      const markup = renderToStaticMarkup(<SpeciesPortrait speciesId={species.id} large selected />)
      expect(markup).toContain(`data-creature-source="${source}"`)
      expect(markup).toContain(`viewBox="${getPortraitFraming(source).viewBox}"`)
      expect(markup).toContain('preserveAspectRatio="xMidYMid meet"')
      expect(markup).not.toContain('/sprites/arkamon/')
      expect(markup).not.toContain('idle-poster.webp')
      expect(markup).not.toContain('/ui/reference-png/portrait-')
    }
  })

  it('uses each supplied PNG portrait for compact Aurora slots without borrowing full-body framing', async () => {
    for (const species of POKEMON_BASE) {
      const source = `/ui/reference-png/portrait-${String(species.id).padStart(3, '0')}.webp`
      const markup = renderToStaticMarkup(<SpeciesPortrait speciesId={species.id} selected />)
      expect(markup).toMatch(/<img(?=[^>]*class="[^"]*\bpu-creature-art\b)[^>]*>/)
      expect(markup).toContain(`data-species-id="${species.id}"`)
      expect(markup).toContain(`data-creature-source="${source}"`)
      expect(markup).toContain(source)
      expect(markup).not.toContain('<svg')
      expect(markup).not.toContain('/sprites/front_sprites/')
      expect(markup).not.toContain('/sprites/arkamon/')
      expect(markup).not.toContain('idle-poster.webp')
      const metadata = await sharp(resolve(`public${source}`)).metadata()
      expect(metadata.format).toBe('webp')
      expect(metadata.width).toBeGreaterThan(0)
      expect(metadata.height).toBe(metadata.width)
      expect(metadata.hasAlpha).toBe(true)
    }
  })

  it('retains official full-body sources in the explicitly requested legacy concepts', () => {
    appearance.reference = false
    for (const species of POKEMON_BASE) {
      const source = `/sprites/front_sprites/${species.id}.png`
      const markup = renderToStaticMarkup(<SpeciesPortrait speciesId={species.id} selected />)
      expect(markup).toContain(`data-creature-source="${source}"`)
      expect(markup).toContain(`viewBox="${getPortraitFraming(source).viewBox}"`)
      expect(markup).toContain('preserveAspectRatio="xMidYMid meet"')
      expect(markup).not.toContain('/ui/reference-png/portrait-')
    }
  })
})
