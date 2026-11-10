# Battle Rendering & Decoded-Media Memory — Rework v4

Scope: internal performance only in **Arkamon-Test**. No changes to gameplay logic, native frame data, frame rates, VFX timings, save schema or Beta.

## Bottlenecks identified

The paged native renderer used `willReadFrequently: true` for a canvas that never reads pixels, potentially forcing CPU backing despite using only `drawImage`. The atlas renderer used the same hint. Paged playback also called `nativeSpritePageCache.stats()` and wrote multiple dataset attributes every newly drawn frame (up to 60 Hz), even though memory telemetry is sampled for diagnostics rather than gameplay. The first frame of a long page immediately requested the next large decoded page. Finally, battle readiness launched preloads for every move of both active creatures concurrently, with a default VFX retained budget of 128 MiB.

## Changes

- Both canvas paths now request `getContext('2d')` without the readback-specific hint; browsers may choose accelerated backing. No frame crop geometry or pixels change.
- Native page painting still advances at its original FPS and emits frame/cue attributes every painted frame, but the more expensive cache-stat scan and corresponding memory DOM writes occur only on first paint, page handover or every 500 ms.
- Next-page decoded prefetch starts at most about **1.2 seconds before** its actual display. Short pages still begin prefetch immediately. On a slow connection the previous frame remains painted while loading; neither source frames nor game rules are skipped.
- The VFX decoded-image cache budget is now **32 MiB low / 64 MiB auto / 128 MiB full**, instead of 48 MiB low / 128 MiB auto/full. The existing native page budget remains 32 MiB low / 64 MiB auto on typical desktops or full. These are **retained cache ceilings, not a total GPU-memory guarantee**.
- Initial VFX warmups have **at most two concurrent move tasks**; each recipe can contain multiple assets. In-flight requests safely finish after unmount, but queued requests no longer start. The exact attack VFX continues to preload on demand before its visible first frame.
- No placeholder species are warmed before the real combatants have loaded.

## Regression and measurement

- `spriteRenderPerformance.test.ts`: bounded stats cadence and safe late-page prefetch.
- `warmBattleMediaBounded.test.ts`: concurrency, cancellation and asset failure fallback.
- `battleMediaBudget.test.ts`: cache ceilings by user preference.
- Existing `spritePageCache.test.ts` and `prepareImageAsset.test.ts`: lease lifetimes, decoded cache limits, late async decode and fallback.
- Existing full combat, director, camera/impact and reduced-motion Chromium suites remain enabled.
- Four filmed battle tests now export `memorySnapshots` roughly every 500 ms alongside existing p50/p95 frame cadence and scene-level decoded bytes.

## Interpretation

Read the JSON and compare the same cold/warm test runs against v3. The browser headless runner can change its frame rate depending on CPU contention; an apparent p95 improvement alone is not proof of sustained 60 FPS. GPU memory also includes compositor surfaces and external GIF decoders not captured by the two cache budgets. Follow-up benchmarking should use the target PC with OBS, the same creature/attack sequence and warm/cold repetitions before introducing new VFX assets.
