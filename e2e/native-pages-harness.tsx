import { createRoot } from 'react-dom/client'
import { ArkamonBattleSprite } from '../src/components/arkamon/ArkamonBattleSprite'
import { useGamePreferences } from '../src/settings/gamePreferences'
import { nativeSpritePageCache } from '../src/utils/spritePageCache'
import type { ArkamonBattleAnimation } from '../src/components/arkamon/arkamonAnimationManifest'
import { GameSettingsPanel } from '../src/settings/GameSettingsPanel'

export function mountNativePages(speciesId: number, animation: ArkamonBattleAnimation, memory: 'low' | 'full' = 'low', reduced = false, speed: 'normal' | 'fast' = 'normal', controls = false) {
  const element = document.createElement('div')
  element.style.cssText = 'position:fixed;inset:0;z-index:3000;background:#202333;display:flex;align-items:center;justify-content:center'
  document.body.appendChild(element)
  const root = createRoot(element)
  const events: { kind: string; animation: string; frame: number | undefined; time: number }[] = []
  let held = false, currentAnimation = animation, replayKey = 0
  useGamePreferences.getState().setPreferences({ graphicsMemory: memory, reducedMotion: reduced ? 'on' : 'off', animationSpeed: speed })
  const record = (kind: string, value: string) => events.push({ kind, animation: value, frame: Number(element.querySelector('[data-sprite-frame]')?.getAttribute('data-sprite-frame')), time: performance.now() })
  const render = () => root.render(<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxHeight: '100vh', overflow: 'auto' }}><div style={{ width: controls ? 'min(32vh,384px)' : 384, height: controls ? 'min(32vh,384px)' : 384 }}>
    <ArkamonBattleSprite speciesId={speciesId} name={`Paged native ${speciesId}`} side="front" animation={currentAnimation} replayKey={replayKey}
      onError={() => record('error', currentAnimation)}
      holdReactionUntilImpact={held} onAnimationReady={value => record('ready', value)} onAnimationStart={value => record('start', value)}
      onAnimationCue={(value, _, cue) => record(cue, value)} onAnimationComplete={value => record('complete', value)} />
  </div>{controls && <div style={{ width: 'min(90vw,460px)' }}><GameSettingsPanel /></div>}</div>)
  render()
  return {
    events, stats: () => nativeSpritePageCache.stats(),
    play(next: ArkamonBattleAnimation, hold = false) { currentAnimation = next; held = hold; replayKey++; render() },
    impact() { held = false; render() },
    close() { root.unmount(); element.remove(); nativeSpritePageCache.clear() },
  }
}

export function mountNativePair() {
  const element = document.createElement('div')
  element.style.cssText = 'position:fixed;inset:0;z-index:3000;background:#202333;display:flex;align-items:center;justify-content:center'
  document.body.appendChild(element)
  const root = createRoot(element)
  const events: { kind: string; animation: string; frame: number; time: number }[] = []
  useGamePreferences.getState().setPreferences({ graphicsMemory: 'low', reducedMotion: 'off', animationSpeed: 'normal' })
  const record = (kind: string, animation: string) => events.push({ kind, animation,
    frame: Number(element.querySelector('[aria-label="Pair attacker"] [data-sprite-frame]')?.getAttribute('data-sprite-frame')), time: performance.now() })
  root.render(<div style={{ display: 'flex', width: '100%', justifyContent: 'center' }}>
    <div style={{ width: 'min(44vw,384px)', height: 'min(44vw,384px)' }}><ArkamonBattleSprite speciesId={13} name="Pair attacker" side="front" animation="attack"
      onAnimationReady={value => record('ready', value)} onAnimationStart={value => record('start', value)}
      onAnimationCue={(value, _, cue) => record(cue, value)} onAnimationComplete={value => record('complete', value)} /></div>
    <div style={{ width: 'min(44vw,384px)', height: 'min(44vw,384px)' }}><ArkamonBattleSprite speciesId={9} name="Pair idle" side="front" animation="idle" /></div>
  </div>)
  return { events, stats: () => nativeSpritePageCache.stats(), close() { root.unmount(); element.remove(); nativeSpritePageCache.clear() } }
}
