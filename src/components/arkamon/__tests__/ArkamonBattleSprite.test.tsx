import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ArkamonBattleSprite,
  completeArkamonPlayback,
  requestArkamonPlayback,
  type ArkamonPlaybackState,
} from '../ArkamonBattleSprite'
import { getArkamonAnimationAsset, type ArkamonBattleAnimation } from '../arkamonAnimationManifest'

const PLAYABLE_SPECIES_IDS = Array.from({ length: 110 }, (_, index) => index + 1)
const ANIMATED_SPECIES_IDS = Array.from({ length: 156 }, (_, index) => index + 1)
const ANIMATIONS: ArkamonBattleAnimation[] = ['idle', 'attack', 'hit', 'victory', 'ko']

const motionPreference = vi.hoisted(() => ({ reduced: false }))

vi.mock('framer-motion', async (importOriginal) => {
  const original = await importOriginal<typeof import('framer-motion')>()
  return { ...original, useReducedMotion: () => motionPreference.reduced }
})

describe('complete action playback', () => {
  const attack: ArkamonPlaybackState = {
    animation: 'attack', replayKey: 7, generation: 10,
    requestedAnimation: 'attack', requestedReplayKey: 7, completed: false,
  }

  it('finishes an attack before honoring the battle’s early idle request', () => {
    const earlyIdle = requestArkamonPlayback(attack, 'idle', 7, true)
    expect(earlyIdle.animation).toBe('attack')
    expect(earlyIdle.generation).toBe(attack.generation)
    expect(completeArkamonPlayback(earlyIdle, attack.generation).animation).toBe('idle')
  })

  it('lets an explicit new idle request interrupt a preview action', () => {
    const explicitIdle = requestArkamonPlayback(attack, 'idle', 8, false)
    expect(explicitIdle.animation).toBe('idle')
    expect(completeArkamonPlayback(explicitIdle, attack.generation)).toBe(explicitIdle)
  })

  it('ignores completion from an interrupted action and completes the new one', () => {
    const hit = requestArkamonPlayback(attack, 'hit', 8, true)
    expect(hit.animation).toBe('hit')
    expect(completeArkamonPlayback(hit, attack.generation)).toBe(hit)
    expect(completeArkamonPlayback(hit, hit.generation).animation).toBe('idle')
  })

  it('keeps KO after its full clip and permits a later return to idle', () => {
    const ko = requestArkamonPlayback(attack, 'ko', 8, true)
    const completed = completeArkamonPlayback(ko, ko.generation)
    expect(completed).toMatchObject({ animation: 'ko', completed: true })
    expect(completeArkamonPlayback(completed, completed.generation)).toBe(completed)
    expect(requestArkamonPlayback(completed, 'idle', 9, true).animation).toBe('idle')
  })
})

function renderDarklaw(animation: ArkamonBattleAnimation = 'idle', animationEnabled = true, playbackPaused = false, holdReactionUntilImpact = false) {
  return renderToStaticMarkup(
    <ArkamonBattleSprite
      speciesId={5} name="Darklaw" side="front" animation={animation}
      animationEnabled={animationEnabled} scale={1.75} className="h-full w-full"
      playbackPaused={playbackPaused}
      holdReactionUntilImpact={holdReactionUntilImpact}
    />
  )
}

describe('Arkamon battle sprite visual selection', () => {
  beforeEach(() => { motionPreference.reduced = false })

  it('fills the battle slot with a named responsive atlas at the configured scale', () => {
    const markup = renderDarklaw()
    expect(markup).toContain('role="img" aria-label="Darklaw"')
    expect(markup).toContain('transform:scale(1.75)')
    expect(markup).toContain('transform-origin:center bottom')
    expect(markup).toContain('container-type:size')
    expect(markup).toContain('data-arkamon-renderer="sprite-sheet"')
    expect(markup).toContain('data-sprite-frame-count="96"')
    expect(markup).toContain('data-sprite-fps="24"')
  })

  it.each(['attack', 'hit', 'victory', 'ko'] as const)('selects the full dedicated %s clip without stacking procedural motion', (animation) => {
    const markup = renderDarklaw(animation)
    expect(markup).toContain(`data-arkamon-animation="${animation}"`)
    expect(markup).toContain(`data-arkamon-asset-animation="${animation}"`)
    expect(markup).toContain('data-arkamon-motion="none"')
    expect(markup).toContain(`/sprites/arkamon/5/front/${animation}.webp`)
    expect(markup).toContain('data-arkamon-first-frame-fallback="true"')
    expect(markup).toContain('/front_sprites/5.png')
    expect(markup).not.toContain('/front/idle.webp')
    expect(markup).toContain('data-sprite-paused="false"')
  })

  it.each(ANIMATED_SPECIES_IDS.flatMap((speciesId) => ANIMATIONS.map((animation) => ({ speciesId, animation }))))(
    'renders species $speciesId $animation with its own native sheet timing and dimensions', ({ speciesId, animation }) => {
      const asset = getArkamonAnimationAsset(speciesId, 'front', animation)!
      const markup = renderToStaticMarkup(
        <ArkamonBattleSprite speciesId={speciesId} name={`Arkamon ${speciesId}`} side="front" animation={animation} />
      )
      expect(markup).toContain('data-arkamon-renderer="sprite-sheet"')
      expect(markup).toContain(`data-arkamon-asset-animation="${animation}"`)
      expect(markup).toContain(`data-sprite-src="${asset.src}"`)
      expect(markup).toContain(`data-sprite-frame-count="${asset.frameCount}"`)
      expect(markup).toContain(`data-sprite-fps="${asset.fps}"`)
      expect(markup).toContain(`width="${asset.frameWidth}" height="${asset.frameHeight}"`)
      expect(markup).toContain('data-arkamon-motion="none"')
      expect(markup).toContain('data-arkamon-first-frame-fallback="true"')
      expect(markup).toContain(`/front_sprites/${speciesId}.png`)
    }
  )

  it('uses reduced motion when the preference is set at mount', () => {
    motionPreference.reduced = true
    expect(renderDarklaw()).toContain('data-sprite-paused="true"')
  })

  it('paints the full native attack sheet while its synchronized clock is paused', () => {
    const markup = renderDarklaw('attack', true, true)
    expect(markup).toContain('data-arkamon-asset-animation="attack"')
    expect(markup).toContain('/sprites/arkamon/5/front/attack.webp')
    expect(markup).toContain('data-sprite-frame-count="96"')
    expect(markup).toContain('data-sprite-fps="24"')
    expect(markup).toContain('data-sprite-frame="0"')
    expect(markup).toContain('data-sprite-paused="true"')
    expect(markup).toContain('data-arkamon-playback="paused"')
    expect(markup).toContain('data-arkamon-first-frame-fallback="true"')
  })

  it('gates the native hit at its reaction marker while retaining the full source frames', () => {
    const markup = renderDarklaw('hit', true, false, true)
    expect(markup).toContain('data-sprite-hold-before-frame="28"')
    expect(markup).toContain('data-arkamon-reaction-gated="true"')
    expect(markup).toContain('data-sprite-frame-count="96"')
    expect(markup).toContain('/sprites/arkamon/5/front/hit.webp')
    expect(markup).toContain('data-sprite-paused="false"')
  })

  it.each(['attack', 'ko'] as const)('keeps %s playback outside the defender reaction gate', (animation) => {
    const markup = renderDarklaw(animation, true, false, true)
    expect(markup).not.toContain('data-sprite-hold-before-frame=')
    expect(markup).toContain('data-arkamon-reaction-gated="false"')
    expect(markup).toContain('data-sprite-frame-count="96"')
  })

  it('uses the original PNG when animations are explicitly disabled', () => {
    const markup = renderDarklaw('idle', false)
    expect(markup).toContain('data-arkamon-playback="paused"')
    expect(markup).toContain('/front_sprites/5.png')
    expect(markup).not.toContain('/arkamon/5/front/idle.webp')
  })

  it.each(ANIMATED_SPECIES_IDS)('allows animations to be disabled for animated species %s', (speciesId) => {
    const markup = renderToStaticMarkup(
      <ArkamonBattleSprite speciesId={speciesId} name="Arkamon" side="front" animation="attack" animationEnabled={false} />
    )
    expect(markup).toContain('data-arkamon-renderer="procedural"')
    expect(markup).toContain('data-arkamon-playback="paused"')
    expect(markup).toContain(`/front_sprites/${speciesId}.png`)
    expect(markup).not.toContain(`/arkamon/${speciesId}/front/attack.webp`)
  })

  it.each([
    ...PLAYABLE_SPECIES_IDS.map((speciesId) => ({ speciesId, side: 'back', src: `/back_sprites/${speciesId}.png` }) as const),
  ] as const)('preserves existing art for species $speciesId, view $side', ({ speciesId, side, src }) => {
    const markup = renderToStaticMarkup(
      <ArkamonBattleSprite speciesId={speciesId} name="Arkamon" side={side} animation="attack" scale={0.75} />
    )
    expect(markup).toContain('data-arkamon-renderer="procedural"')
    expect(markup).toContain('transform:scale(0.75)')
    expect(markup).toContain(src)
    expect(markup).toContain('alt="Arkamon"')
  })
})
