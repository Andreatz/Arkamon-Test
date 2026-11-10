# Battle Impact Composition & VFX Cache — Rework v3

Experimental implementation on Arkamon-Test. Arkamon-Beta gameplay, media, saves and deployment are unchanged.

## Impact visual vocabulary

All impact overlays start from the **existing `SpriteMoveVfx.onImpact` cue**. The HP/dice logic is untouched. The four previously introduced camera choreographies now generate two short, ephemeral and GPU-friendly impact shapes:

| Camera archetype | Impact accents |
| --- | --- |
| Physical | Directional slash streak + small ring |
| Projectile | Target-centered concentric ring + halo |
| Area | Wide elliptical shockwave + delayed expanding ring |
| Support | Soft caster-style halo + ring; no physical slash |

Colors reuse the existing attack-type palette, never inferred from damage. Opacity is clamped at 0.95 and durations stay below 560 ms, with no extra images or frame atlases. Effects scale with the existing playback-speed setting, and render nothing under reduced-motion preferences. Each pulse exposes a `data-battle-impact-kind` and `data-battle-impact-cue` marker for Playwright.

## Synchronization and correctness

`playImpactFeedback` now tags its cleanup timers with the active impact epoch. A delayed timer from the previous move cannot reset the latest hit-stop, target shake, flash or camera shake. This prevents overlapping cues from erasing newer feedback while preserving the old game/audio resolution.

Impact overlays are removed after their last planned layer finishes; the old fixed 560ms timeout is replaced by a duration computed from the actual layers, with 40ms margin. Nothing in the sequence changes damage timing, dice, checkpoints, RNG or the attack's native release marker.

## Memory and resource policy

Previously, `?vfx=<id>` was appended to static images as well as GIFs on each replay. Static image assets are now requested by their stable URL, allowing browser cache and `prepareImageAsset` to share prepared pixels across attacks and preventing redundant network/decoded work. Sprite sheets already used stable URLs. **Animated GIFs still get unique replay URLs** to guarantee that their first frame restarts for every new attack.

## Verification

- `battleImpactComposition.test.ts` verifies visual variety, bounds, reduced motion and texture-free rendering.
- `preloadVfxAssets.test.ts` verifies stable static/sprite URLs and preserved GIF replay behavior.
- `e2e/rework-shot-choreography.spec.ts` now confirms exactly one visible impact cue of the expected choreography for each of four real attacks, in addition to timing, HP and camera assertions.
- Existing KO/dice/checkpoint, reduced-motion camera and TypeScript/build gates remain required.

## Limits / next review

Reuse of a stable URL avoids needless duplicate fetch/decode opportunities but does not by itself prove an FPS increase. Compare actual request counts, decoded-image memory and p95 frame pacing from GitHub artifacts under a known cold/warm browser cache, and verify the visual direction on target OBS hardware before expanding to more particle effects.
