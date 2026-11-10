import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DiceRollOverlay, type DiceRollDisplay } from './DiceRollOverlay'

function rollWith(rolls: number[], overrides: Partial<DiceRollDisplay> = {}): DiceRollDisplay {
  return {
    id: 17,
    side: 'A',
    moveName: 'Mossa di prova',
    rolls,
    increment: 2,
    damage: 9,
    ...overrides,
  }
}

describe('battle dice overlay', () => {
  it('preserves engine values while withholding final damage before dice are displayed', () => {
    const markup = renderToStaticMarkup(
      <DiceRollOverlay roll={rollWith([1, 2, 3, 4, 5, 6], { damage: 14 })} />,
    )
    expect(markup).toContain('Lancio giocatore')
    expect(markup).toContain('Mossa di prova')
    expect(markup.match(/role="img"/g)).toHaveLength(6)
    for (let value = 1; value <= 6; value++) {
      expect(markup).toContain(`aria-label="Dado: ${value}"`)
    }
    expect(markup).toContain('Dadi: 1 + 2 + 3 + 4 + 5 + 6 + 2 = 23')
    expect(markup).not.toContain('Danno finale')
    expect(markup).toContain('data-dice-revealed="false"')
    expect(markup.match(/class="battle-die-frames"/g)).toHaveLength(6)
  })

  it('keeps all twenty high-level dice and their exact sum in a grid that can wrap on mobile', () => {
    const rolls = Array.from({ length: 20 }, (_, index) => index % 6 + 1)
    const markup = renderToStaticMarkup(
      <DiceRollOverlay roll={rollWith(rolls, { increment: 4, damage: 100 })} />,
    )
    expect(markup.match(/aria-label="Dado: [1-6]"/g)).toHaveLength(20)
    expect(markup.match(/class="battle-die-frames"/g)).toHaveLength(20)
    for (let value = 1; value <= 6; value++) {
      const expectedCount = rolls.filter((result) => result === value).length
      expect(markup.match(new RegExp(`aria-label="Dado: ${value}"`, 'g')))
        .toHaveLength(expectedCount)
    }
    expect(markup).toContain(`Dadi: ${rolls.join(' + ')} + 4 = 70`)
    expect(markup).not.toContain('Danno finale')
    expect(markup).toContain('--battle-dice-columns:6')
    expect(markup).toContain('--battle-dice-mobile-columns:4')
  })

  it('preserves opponent values and totals when missing images need a numerical fallback', () => {
    const markup = renderToStaticMarkup(
      <DiceRollOverlay
        roll={rollWith([2, 6], { side: 'B', increment: 1, damage: 5 })}
        forceFallback
      />,
    )
    expect(markup).toContain('Lancio avversario')
    expect(markup).toContain('aria-label="Dado: 2"')
    expect(markup).toContain('aria-label="Dado: 6"')
    expect(markup.match(/class="battle-die-fallback"/g)).toHaveLength(2)
    expect(markup).not.toContain('battle-die-frames')
    expect(markup).toContain('Dadi: 2 + 6 + 1 = 9')
    expect(markup).not.toContain('Danno finale')
  })
})
