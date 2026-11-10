# Battle Performance Lab — Profiling v1

**Project:** Arkamon-Test only. This is a developer diagnostic tool, not a player-facing mechanic. Arkamon-Beta is unchanged.

## How to use during a battle

1. Open a battle in the test game. Press **Ctrl+Shift+A** (Cmd+Shift+A on Mac) to enable/open Admin.
2. Select **Prestazioni**, then **Avvia registrazione**.
3. Close the Admin window and play the battle normally. The recorder keeps running because it is not owned by the panel component.
4. Reopen Admin → Prestazioni, choose **Termina**, inspect the graph and export **JSON** (full report) or **CSV** (numeric samples). **Azzera** discards the current in-memory report.

Start is refused if the active DOM has no battle stage. A battle's timeline is sampled only while its scene is present. The recorder uses a bounded ring of at most 1,200 half-second samples (last ~10 minutes) and 320 phase/camera events. A page reload clears the report. Nothing is uploaded or saved to campaign storage.

## Signals

| Metric | Source | Caveat |
| --- | --- | --- |
| FPS estimate / p50 / p95 | `requestAnimationFrame` callback intervals (500ms windows) | Measures browser callback cadence, not compositor/GPU presentation FPS |
| Late frames and estimated missed 60Hz frames | rAF gaps above 1.5 × 16.67ms / rounded missing 60Hz slots | Cannot distinguish JS load, CPU decoding, compositor or monitor refresh; estimates only |
| Native image bytes and budget | `nativeSpritePageCache.stats()` | Decoded cache estimate, not total VRAM or texture allocations |
| VFX image bytes and budget | `getPreparedImageStats()` | Estimates decoded images held by the VFX cache, not all image/video allocations |
| Canvas time | Latest `data-sprite-draw-ms` among visible sprite canvases | Snapshot of drawing duration; not GPU trace or all frames |
| Renderer count | DOM `data-sprite-renderer` | Counts present paged/native and atlas renderers |
| Native page preparation | Native sprite page fetch + decode latency on completed loads | Measures network plus decode, not decode alone |\n| VFX image preparation | VFX image load + decode latency on completed preparations | Only retained asset preparation; not all CSS/GIF image work |\n| Long tasks | Browser `PerformanceObserver` `longtask`, when supported | Main-thread blocking tasks ≥50ms; browser support differs |
| Animation phase timeline | DOM mutation observer filtered to director phase and camera beat | Does not log combat state, move names, or source URLs |

Suspension gaps above 250ms and intervals while the tab is hidden are excluded from FPS analysis. Sampling is limited to 2Hz; the profiler should not scan all caches or DOM on every rendered frame. It is opt-in, and normal gameplay has no monitoring overhead while it is stopped.

## Data contract and privacy

`battleProfilerModel.ts` defines `schemaVersion: 1`, a fixed 60Hz reference and a bounded report. JSON contains timestamps, anonymous phase/camera tags and aggregate performance. CSV contains numeric metrics only. No player data, save contents, creature names, move names, asset URLs or session credentials are included. All exports are created locally by the browser via Blob.

## Verification

- `battleProfilerModel.test.ts` checks frame statistics, hidden/suspended gaps, bounded history and export fields.
- `e2e/battle-profiler-lab.spec.ts` verifies Admin access, recording while Admin closes, a real move and an anonymous downloaded JSON/CSV file.
- Existing full engine tests, KO/dice checkpoint, cinematic and reduced-motion browser checks remain active.

## Next step

For reproducible performance comparison on the target OBS PC, record the same 30–60 second attack script with the same browser viewport, display refresh, cache warm state and OBS configuration. Compare p95 intervals and decoded-cache peaks, not only average FPS. If a VFX spikes, correlate the time window with the phase timeline and its asset decode behavior.
