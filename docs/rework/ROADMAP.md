# Arkamon 2.0 — Rework plan

## Goals and non-goals

Improve UI hierarchy, cinematic battle presentation, input feedback and rendering performance without changing existing combat rules, the player experience/leveling model, native animation frames, or campaign checkpoint semantics. Keep Beta as the production source until a measured, reversible transition is approved.

## Phase 0: Independent baseline (current PR)

- Import immutable upstream revision `62d24f0361611daff1ca5211c444fa4acefc196d`.
- Bring in TypeScript source, tests and a bounded subset of public UI media.
- Route missing native page/VFX/sound media to immutable upstream assets, never floating `main`.
- Verify `npm ci`, TypeScript and lightweight Vite build in GitHub Actions.
- Document omitted assets rather than silently declaring complete parity.

## Phase 1: Battle Director and system separation

Separate battle phases, visual cues and presentation scheduling from the 86 KB battle scene. Define deterministic events: attack wind-up, release, VFX impact, defender reaction, roll/result reveal, settled checkpoint, cleanup. Add unit tests for delays, interruption, reduced motion and duplication. Do not recompute damage or change dice rules.

**Acceptance:** existing battle-engine tests still pass; effects cannot change game turn order; stale events are ignored; no timer or player survives a scene reset; reduced motion remains usable.

## Phase 2: UI design system and legibility

Introduce a single token set (spacing, type, color, motion), reusable components (HUD, panes, cards, inventory, modals, primary/secondary actions) and clear differences between gameplay, management and GM modes. Retain existing user-provided art, creature portraits and SVG assets. Add visual regression screenshots at 1920×1080 and portable breakpoints.

**Acceptance:** contrast, tab order, focus, no visual clipping, consistent typography; compare side-by-side with audit baseline.

## Phase 3: Cinematic battle scene

Use a timeline to coordinate native creature clips, camera framing, impact freezes, VFX and audio with one monotonic clock. Prefer reusing the existing preload/canvas playback system before expanding animation inventories.

**Acceptance:** three representative attack categories (light, medium, heavy) have synchronized impact, target reaction and HP reveal; memory and frame timing are measured.

## Phase 4: Management and world exploration

Upgrade Squad, Deposit, Arkadex, Bag, Store, city and route navigation in coherent slices. Keep game-master tools private. Maintain one change at a time behind existing navigation contracts.

## Phase 5: End-to-end and performance gate

Run isolated fixture screenshot corpus, functional Playwright suites, accessibility checks, hot/cold loading tests and stream-like sessions on the target hardware. Verify restore/backup durability, session ownership, no broken front/back sprites.

## Evidence from first audit

The earlier Beta visual collector captured 127 images, eight labs and three animation samples; 20 selected Playwright tests passed. These results are a baseline, **not** proof of complete function coverage. The old desktop Battle screenshot included a loading state: do not treat that as a confirmed runtime defect without a readiness-aware test.

## Deployment protection

Keep modifications exclusively in Arkamon-Test. Never deploy to or mutate Beta as part of CI. Any cross-repo port back to Beta requires a separate, explicit decision.