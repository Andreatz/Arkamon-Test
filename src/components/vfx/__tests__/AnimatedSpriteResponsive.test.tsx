import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnimatedSprite } from '../AnimatedSprite'

describe('responsive sprite atlas sizing', () => {
  it('keeps the same atlas cell when filling a parent while retaining fixed dimensions by default', () => {
    const props = {
      src: '/sprite-atlas.png',
      frameWidth: 192,
      frameHeight: 160,
      columns: 3,
      rows: 2,
      startFrame: 5,
      frameCount: 1,
      fps: 24,
      width: 96,
      height: 80,
    }
    const fixed = renderToStaticMarkup(<AnimatedSprite {...props} />)
    expect(fixed).toContain('width:96px;height:80px')
    expect(fixed).toContain('background-position:-192px -80px')
    expect(fixed).toContain('background-size:288px 160px')

    const responsive = renderToStaticMarkup(<AnimatedSprite {...props} responsive />)
    expect(responsive).toContain('width:100%;height:100%')
    expect(responsive).toContain('background-position:100% 100%')
    expect(responsive).toContain('background-size:300% 200%')
    expect(responsive).toContain('aria-hidden="true"')
  })

  it('positions the last die outcome in a single-row sheet without an invalid percentage', () => {
    const markup = renderToStaticMarkup(
      <AnimatedSprite
        src="/dice-result.png"
        frameWidth={267}
        frameHeight={259}
        columns={6}
        rows={1}
        startFrame={5}
        frameCount={1}
        fps={24}
        width={267}
        height={259}
        responsive
      />,
    )
    expect(markup).toContain('background-position:100% 0%')
    expect(markup).toContain('background-size:600% 100%')
    expect(markup).not.toContain('NaN')
    expect(markup).not.toContain('Infinity')
  })
})
