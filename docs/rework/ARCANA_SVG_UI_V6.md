# Arcana v6 — Engraved SVG / CSS art direction

Scope: **Arkamon-Test only**. This replaces the proposed ImageGen raster v2 draft and refines the existing Aether v5 UI, without replacing the native creature clips, sprites, combat resolution, HP checkpoints or game save schema.

## Visual identity

Arcana combines forged brass and burnished gold, translucent petrol-blue enamel, carved geometric filigree, gem highlights and astrolabe/cartographic motifs. Panels are illustrated **with SVG paths**, not flat rounded rectangles with a generic background gradient. Gradients now model physical metal and enamel; stroked borders, chamfered silhouettes, inner engraving, micro-dot patterns and jewels add layered depth. The center of each plate stays high contrast for live text.

## Source vector assets

| SVG asset | Use |
| --- | --- |
| `hp-ally.svg` / `hp-rival.svg` | Mirrored brushed-metal HP housings with carved teal medallion, double rim and diamond details |
| `move-card.svg` | Hand-etched ability plates, decorative rails and a type-reactive CSS illumination layer |
| `chronicle.svg` | Manuscript-style battle narrative, dice/result frame and supporting modal artwork |
| `command.svg` | Engraved secondary and title navigation control surfaces, with focus/hover lighting |
| `supreme.svg` | Gold/ember magical seal with a central radial ornament and readable tactical label zone |
| `title-panel.svg` | Illuminated celestial manuscript around the title navigation |
| `battle-glyph.svg` | A small astrolabe that appears only during active attack phases |

The SVG assets have genuine transparent corners and no embedded text, remote images, scripts or external SVG references. The app continues to render species/move names, HP, dice counts and action text as native, accessible HTML. Layout Studio/custom HP frames retain their override path.

## Motion language

- Hover/focus: a subtle color-coded internal bloom and light sweep, no permanent pulsing card animations.
- Supremes: lighting and brightness of an illustrated sigil rather than a flat gold rectangle.
- Target impact: brief gilt rim flash coordinated with the existing Battle Director and existing target side.
- Attack phase: a short-lived ornamental astrolabe enters on preparing/windup, then withdraws on released/impact.
- Title: very slow astrolabe rotation behind the original logo, disabled with the OS/application reduced-motion setting.

Neither dice outcomes nor sprite/VFX frame timing depend on these effects. CSS does not animate expensive bitmap atlases and the decorative DOM nodes have `pointer-events: none` and `aria-hidden=true`.

## Testing

- `scripts/check-arcana-vectors.mjs`: verify eight authored vectors, rich geometry, safe local references, no embedded text and finite total size.
- Existing `e2e/rework-aether-ui.spec.ts`: desktop and compact 16:9, named controls, HP, actual SVG image decode and canvas alpha corners, readable text, capture button bounds and reduced motion.
- Existing title visual test: 1920×1080 and 390×844 navigation visibility, with the new illustrated title frame.
- Mandatory CI: TypeScript, engine, full web build, dice/KO/checkpoint, cinematic/regia, four attack archetypes and profiling tests.

## Relationship to previous PR

PR #13 was an incomplete ImageGen WebP proposal with unuploaded binaries. It was closed without merge. Arcana v6 branches from the tested Aether v5 `main` instead; `Arkamon-Beta` is unaffected. The art direction can be extended later to the map, starter laboratory, team screen and deposit once battle/title QA is stable.
