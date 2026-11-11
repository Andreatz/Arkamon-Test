# Arkamon-Test — Aether Cinematic Interface v5

Goal: replace mixed battle art and inconsistent gray/red/gold panels with a coherent dark-fantasy film interface, while protecting all gameplay, native sprites, local persistence and camera/VFX synchronization.

## Visual direction

- Deep midnight ink and forest-compatible translucent glass preserve visibility of the stage and full creature silhouettes.
- Warm gold is reserved for tactical focus and Supreme; cold jade illuminates HP, with the existing configured thresholds and colors retained.
- Individual type accents distinguish Normale, Fuoco, Acqua, Erba, Elettro, Terra, Psico and Oscurità without relying on color alone: icons, dice/facts and visible names remain.
- HP labels and numbers are semantic DOM elements. Health track is a native accessible progressbar; width still follows Framer Motion and hidden damage is only revealed at the existing dice checkpoint.
- The MoveButton and SupremeButton retain exactly the same handlers, disabled state, tooltips, data-ui layout selectors and battle outcomes. The same rectangle positions are still controlled by Admin/Layout Studio.
- Dialogue is rebuilt as a clear glass chronicle panel, with all text and the opponent turn button remaining actual DOM. No image text baking or extra sprite texture allocations.
- Modal/dice/result panels, chronicle button and title navigation now follow one visual palette.

## Visual animation language

1. Short 420ms panel reveals on entry; move cards stagger by 60ms and 110ms. Hover/keyboard focus adds an illuminated type-colored rail and a quick glint. No ambient infinite motion on the battle HUD.
2. During windup/release/impact, move cards become slightly subdued and the target's HP panel receives a brief rim light.
   A lightweight elemental technique lower-third briefly identifies the active move during windup/release and exits before the impact; it does not affect damage or native sprite playback. These rely only on the existing Battle Director markers. Damage, save and RNG are unchanged.
3. A small atmospheric overlay/letterbox follows anticipation, travel and impact camera beats; HUD remains a sibling of the moving camera and thus stays stable. Native clip timing and frame counts are unchanged.
4. Title retains original video and logo but adds decorative atmospheric lighting, editorial hierarchy, and an improved navigation card; its optional slow halo is disabled for prefers-reduced-motion.
5. Both the application's reducedMotion preference and OS prefers-reduced-motion disable decorative battle entry/impact animations; Framer Motion playback retains its existing preferences.

## Scope & compatibility

This is a **React/CSS UI rework**, not the creation of new prerendered 3D creature clips. Existing sprites are retained at original native fidelity. Changes are isolated to the experimental `Arkamon-Test` repository. Not applied to `Arkamon-Beta`.

New visual regression: `e2e/rework-aether-ui.spec.ts` checks 1280×720, 640×360, type/accent styling, health semantic progressbar, atmospheric layer count, responsive bounds and reduced-motion. The existing title test checks mobile + desktop; existing KO/dice/checkpoint and four cinematic choreography suites stay mandatory. Screenshot artifacts are published by the Actions workflow.

Future work after visual QA: stage-specific motion direction, authored VFX animation polish and a configurable accessibility/contrast profile. Don't assert a GPU/FPS benefit without running the profiler on target OBS hardware.
