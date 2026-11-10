# Battle Camera Choreography v2

Arkamon-Test only. No changes to original Arkamon-Beta assets, game rules, save data or damage/dice calculations.

## Reuse existing VFX vocabulary

Camera movement now derives from `resolveMoveVfxProfile(move).archetype` instead of creating a new move classification or affecting the move engine.

| Existing archetypes | Camera language |
| --- | --- |
| blunt, slash, bite, charge | Physical: close attacker anticipation, short rapid lunge to defender, restrained impact flare |
| beam, plant, fire, electric, water, dark | Projectile: attacker focus, smoother pan to defender, elemental glow |
| wave, storm, eruption, psychic, supreme | Area: pull toward center of field, wide flash/shockwave |
| aura, status, heal | Support: focal hold on caster, soft glow; no physical dash |

Intensity still uses existing `cameraShakePx` tiers. Effect color is the game's existing `VFX_TYPE_COLORS[move.tipo]`. No new PNGs, videos or sprite sheets are introduced. Four kinds, both attack directions, self-targeting, reduced motion, camera limits (<= 2% translation and <= 1.07 scale) and reset behavior are unit-tested.

## Browser validation

The dedicated `e2e/rework-shot-choreography.spec.ts` performs four real seeded attacks:

- Physical: Vyrath #2 using Assalto (charge).
- Projectile: Vyrath #1 using Soffio (beam).
- Area: Felvex #42 using Polverone (storm).
- Support/aura: Fluffet #63 using Lana magica (explicit aura profile).

All tests capture before/after images, a real Chromium video, presentation cue order, decoded graphics memory indicators and frame pacing (p50/p95 milliseconds). This is an illustrative baseline only; frames reported from headless CI are not substitutes for performance testing with OBS.

The CI artifact contains `physical-telemetry.json`, `projectile-telemetry.json`, `area-telemetry.json` and `support-telemetry.json` next to the videos and images; these exports are independent of the Playwright HTML reporter.

## Acceptance and next steps

Keep all combat/KO, XP, checkpoint tests green. Camera must not wrap HUD, HP, commands or dice. The battle returns to neutral by dice reveal. Look at captured four-category videos before tuning intensity further. Later add a per-type camera configuration in UI Studio rather than hardcoding one-off motion for each move.
