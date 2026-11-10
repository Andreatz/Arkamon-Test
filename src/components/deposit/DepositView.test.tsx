import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PokemonIstanza } from '@/types'
import { createDepositPreview } from './DepositLab'
import { DepositView, getAdjacentDepositBox } from './DepositView'
import { DEPOSIT_PORTRAIT_FRAMING } from './depositPortraitFraming'
import pokemonSpecies from '@/data/pokemon.json'

vi.mock('@/admin/AdminLayoutItem', () => ({
  AdminLayoutItem: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function renderPreview(squadra?: PokemonIstanza[]): string {
  const preview = createDepositPreview()
  return renderToStaticMarkup(
    <DepositView
      squadra={squadra ?? preview.squadra}
      deposito={preview.deposito}
      onSwap={() => {}}
      onBack={() => {}}
    />,
  )
}

function slotButtons(markup: string): string[] {
  return [...markup.matchAll(/<button\b[^>]*>/g)]
    .map(([button]) => button)
    .filter((button) => /aria-label="(?:Squadra|Box \d+), posto \d+:/.test(button))
}

function accessibleLabel(button: string): string {
  return button.match(/aria-label="([^"]*)"/)?.[1] ?? ''
}

describe('DepositView', () => {
  it('renders every team and box slot as a uniquely named button with the real occupant and level', () => {
    const markup = renderPreview()
    const buttons = slotButtons(markup)
    const labels = buttons.map(accessibleLabel)

    expect(labels.filter((label) => label.startsWith('Squadra,'))).toHaveLength(6)
    expect(labels.filter((label) => label.startsWith('Box 1,'))).toHaveLength(35)
    expect(new Set(labels).size).toBe(41)
    expect(labels).toEqual(expect.arrayContaining([
      'Squadra, posto 1: Darklaw, livello 16',
      'Squadra, posto 2: Felvex, livello 7',
      'Squadra, posto 3: Weedrug, livello 5',
      'Squadra, posto 4: Deephion, livello 6',
      'Squadra, posto 5: Spectron, livello 5',
      'Squadra, posto 6: Boomrock, livello 5',
      'Box 1, posto 1: Blazion, livello 5',
      'Box 1, posto 2: Clastoom, livello 5',
      'Box 1, posto 3: Handipus, livello 5',
      'Box 1, posto 4: vuoto',
      'Box 1, posto 35: vuoto',
    ]))
    for (const button of buttons) {
      expect(button).toContain('type="button"')
      expect(button).toContain('aria-pressed="false"')
      if (!accessibleLabel(button).endsWith(': vuoto')) {
        expect(button).toMatch(/title="[^"]+\d+\/\d+ HP"/)
      }
    }
    const spriteIds = [...markup.matchAll(/src="[^"]*\/sprites\/front_sprites\/(\d+)\.png"/g)]
      .map(([, id]) => Number(id))
    expect(spriteIds).toHaveLength(9)
    expect(spriteIds).toEqual(expect.arrayContaining([6, 42, 47, 56, 46, 103, 32, 16, 20]))
    expect(markup).toContain('aria-label="Vai al box 30"')
    expect(markup).toContain('aria-label="Vai al box 2"')
  })

  it('keeps all six team destinations available when the team is empty', () => {
    const buttons = slotButtons(renderPreview([]))
    const teamLabels = buttons.map(accessibleLabel).filter((label) => label.startsWith('Squadra,'))

    expect(teamLabels).toEqual([
      'Squadra, posto 1: vuoto',
      'Squadra, posto 2: vuoto',
      'Squadra, posto 3: vuoto',
      'Squadra, posto 4: vuoto',
      'Squadra, posto 5: vuoto',
      'Squadra, posto 6: vuoto',
    ])
    expect(buttons).toHaveLength(41)
  })

  it('has a valid face framing for every registered species and evolution', () => {
    expect(Object.keys(DEPOSIT_PORTRAIT_FRAMING).map(Number).sort((a, b) => a - b))
      .toEqual(pokemonSpecies.map((species) => species.id).sort((a, b) => a - b))
    for (const framing of Object.values(DEPOSIT_PORTRAIT_FRAMING)) {
      expect(Number.isFinite(framing.x) && Number.isFinite(framing.y) && Number.isFinite(framing.zoom)).toBe(true)
      expect(framing.x).toBeGreaterThan(0)
      expect(framing.x).toBeLessThan(1)
      expect(framing.y).toBeGreaterThan(0)
      expect(framing.y).toBeLessThan(1)
      expect(framing.zoom).toBeGreaterThanOrEqual(1)
      expect(framing.zoom).toBeLessThanOrEqual(6)
    }
  })

  it('preserves the species face framing when a creature moves between team and storage', () => {
    const preview = createDepositPreview()
    const pokemon = preview.squadra[0]
    const renderOccupant = (inTeam: boolean) => renderToStaticMarkup(
      <DepositView squadra={inTeam ? [pokemon] : []} deposito={inTeam ? {} : { '1:1': pokemon }}
        onSwap={() => {}} onBack={() => {}} />,
    )
    const teamMarkup = renderOccupant(true)
    const boxMarkup = renderOccupant(false)
    const imageStyle = (markup: string) => markup.match(/<img[^>]*front_sprites[^>]*style="([^"]+)"/)?.[1]

    expect(imageStyle(teamMarkup)).toBeDefined()
    expect(imageStyle(boxMarkup)).toBe(imageStyle(teamMarkup))
    expect(imageStyle(teamMarkup)).toContain('translate(')
    expect(teamMarkup).toContain('deposit-team-portrait')
    expect(boxMarkup).toContain('deposit-box-portrait')
  })

  it.each([
    { current: 1, direction: -1 as const, expected: 30 },
    { current: 30, direction: 1 as const, expected: 1 },
  ])('wraps box $current in direction $direction to box $expected', ({ current, direction, expected }) => {
    expect(getAdjacentDepositBox(current, direction)).toBe(expected)
  })
})
