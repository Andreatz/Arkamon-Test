# Arkamon Test — Cinematic Battle Camera v1

Status: experimental Arkamon-Test only. Beta stays unchanged.

## Cinematic blocking

- Preparing: camera remains neutral during media preloading.
- Wind-up: bounded push and lateral movement toward the attacker (side A or B).
- Release: follows the effect across the arena to the target.
- Impact: short tiered push-in and faint target bloom; original hit stop and camera shake stay nested and independent.
- Visual complete: return to neutral framing before dice, HP reveal and saved checkpoint.

Only the background, creatures, shadows and effects move. HUD, HP, dice, log, menu, bag and GM controls stay fixed. Camera zoom remains <= 1.07, translation <= 2% per axis; glow opacity <= 0.22.

## Behavior

Shot intensity is derived from the existing move VFX feedback rather than new gameplay data. Subtle status and healing effects remain still. Reduced-motion mode disables every camera transform and light overlay. Fast playback halves only camera transition durations. The existing damage, RNG, turn order, cue scheduling, and checkpoint semantics are unchanged.

Expose data-battle-camera-beat, data-battle-camera-target, data-battle-camera-zoom, data-battle-camera-intensity and data-battle-director-phase for debug inspection.

## Evidence

- Unit tests: src/components/battle/battleCameraLanguage.test.ts.
- Existing motor and Battle Director regression tests continue.
- Real Playwright battle under normal and reduced motion: e2e/rework-cinematic-battle.spec.ts.
- GitHub Actions artifact arkamon-test-cinematic-battle includes battle clips, screenshots and phase traces.

This does not replace exhaustive testing of all moves or performance measurements on streaming hardware. Next increment: review actual clips, then adapt the camera to move archetypes before expanding to new animation assets.
