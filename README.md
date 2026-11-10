# Arkamon Test — Rework 2.0

**Experimental fork of [Andreatz/Arkamon-Beta](https://github.com/Andreatz/Arkamon-Beta)**. This repository is intentionally separate from the live game: no rework change should be published to Beta automatically.

## Status

The source import is being prepared in `rework/bootstrap-from-beta` with an immutable upstream revision. Arkamon-Test originally contained only `prova.txt`; no complete runnable game should be assumed until the bootstrap GitHub Actions checks finish.

## The strategy

- Keep the existing combat domain rules, save schema, and campaign identifiers compatible.
- Refactor battle presentation and animation coordination before changing gameplay behavior.
- Create shared UI patterns across management screens, battle HUD and world map.
- Preserve native creature animation frames and use the original, pinned heavy media remotely.
- Keep screenshots, video samples, performance budgets and regression tests for every major increment.

## Lightweight fork

The bootstrap imports TypeScript game code, relevant tests and selected local interface media into this repo. The original multi-gigabyte creature animation pages, VFX and sounds are not duplicated; the runtime refers to a fixed published revision in Arkamon-Beta. See `docs/rework/import-report.json` once imported.

Builds are intentionally different from Beta: the Vite config uses `/Arkamon-Test/` under GitHub Pages and its lightweight build does not run the full media packaging/integrity scan (those original media remain pinned upstream).

## Development after bootstrap

1. `npm ci`
2. `npm run dev`
3. `npx tsc --noEmit`
4. `npm run build`

`ARKAMON_TEST_FULL_MEDIA=true` is an opt-in for the original release process; it is not expected to succeed without restoring the complete upstream media tree.

**Do not copy production saves or tokens into this repository.** Screenshots and Playwright demos should use the isolated UI fixtures wherever possible.

See [Rework roadmap](docs/rework/ROADMAP.md).