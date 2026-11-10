import { describe, expect, it } from 'vitest'
import { hpAssetArea, hpAssetSkin } from './hpAssetSkin'

describe('known HP skins keep gameplay values separate from sample artwork', () => {
  it.each(['/ui/studio/Comuni/hp-bar.svg', '/ui/studio/Comuni/hp-bar-enemy.svg'])('prepares %s without the sample level or partially filled track', source => {
    const svg = decodeURIComponent(hpAssetSkin(source)!.split(',')[1])
    expect(svg).not.toContain('>Lv. 10</text>')
    expect(svg).not.toMatch(/fill="url\(#(?:subBarCore5|subFillGreenGrey7)\)"/)
    expect(svg).toContain('preserveAspectRatio="none"')
    expect(svg).toContain(`data-ui-template-source="${source}"`)
    expect(svg).toContain('>HP</text>')
    expect(hpAssetSkin(source)).toBe(hpAssetSkin(source))
  })
  it('leaves other and imported assets untouched', () => {
    expect(hpAssetSkin('/ui/studio/Comuni/infobox.svg')).toBeUndefined()
    expect(hpAssetSkin('ui-media:custom-hp.svg')).toBeUndefined()
  })
  it('aligns live labels and track with the contained, covered or stretched template', () => {
    expect(hpAssetArea(1020, 220)).toEqual({ x: 0, y: 0, w: 100, h: 100 })
    const contained = hpAssetArea(1020, 440)
    expect(contained).toEqual({ x: 0, y: 25, w: 100, h: 50 })
    const covered = hpAssetArea(1020, 440, 'cover')
    expect(covered).toEqual({ x: -50, y: 0, w: 200, h: 100 })
    expect(hpAssetArea(1020, 440, 'fill')).toEqual({ x: 0, y: 0, w: 100, h: 100 })
  })
})
