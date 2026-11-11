# Battle Performance Lab v2 — per-animation benchmark

Scope: Arkamon-Test only. Original Arkamon-Beta, combat logic, dice, saves and animations remain unchanged.

## What's new

Each action is identified by public technical catalog species ID, move ID, front/back view, choreography, and a local sequence number. The profiler listens to read-only DOM markers. The live battle never depends on the profiler.

The measured interval starts at the attack's first preparatory phase and ends at the Battle Director's visual-complete signal (or interrupted when cancelled). Unlike the general 500 ms FPS graph, the benchmark uses individual requestAnimationFrame deltas captured DURING the attack. Each shot contains:

- Per-attack rAF cadence, p50/p95, late-frame interval count and estimated 60 Hz gaps
- Visible presentation duration
- Estimated peak retained decoded native and VFX cache bytes
- Native page and VFX preparation counts, last sampled canvas draw time and long-task counts
- First/repeat status within the recording (NOT a claim of decoded cache residency)

The Admin Prestazioni panel displays comparisons between first and latest completed presentations with matching technical identity. Scarica attacchi CSV exports only per-attack metrics; JSON exports the complete anonymized profile (schema version 2). No player names, creature nicknames, party identifiers, gameplay saves, credentials or asset URLs are included. Public numeric species/move IDs are included because they are essential to identify an animation.

## Controlled manual protocol on the OBS machine

1. Fix the same PC, monitor refresh (ideally 60 Hz), viewport (1280x720 or 1920x1080), graphics-memory preference, browser version, window layout and attack for all trials.
2. First measure WITHOUT OBS, then WITH OBS capturing the identical game window.
3. First-load trial: open a fresh browser profile/incognito context, navigate to a throwaway test battle, open Admin > Prestazioni and start. Close Admin, execute the chosen move, stop and export JSON.
4. HTTP-cache-repeat trial: navigate again in the SAME browser context, repeating the same fixture and move. HTTP cache may be warm, but reloading the application recreates in-memory decoded image caches. Do not label this a warm decoded-cache trial.
5. Decoded-cache-repeat trial: keep the same game tab alive and repeat the SAME attack where normal gameplay allows it. The grouped first/repeat rows reveal p95 deltas. Asset residency is not guaranteed: check native/VFX load counters and memory budgets.
6. Repeat conditions at least three times and compare p95 and late-frame counts, alongside peak decoded memory. Monitor real GPU memory and OBS skipped/lagged frame counters independently: the in-app profiler cannot access them.

Never overwrite real campaign progress to force benchmark situations. Use a throwaway game or Playwright fixed fixture.

## Automated controlled benchmark

e2e/battle-attack-benchmark.spec.ts runs the SAME fixed battle twice in the same Playwright browser context. The first navigation begins in a new isolated browser context. The second navigation reuses the HTTP cache but RELOADS the app, so it resets the JS decoded image and Bitmap caches. It validates matching catalog IDs and completed rAF statistics and exports output/rework-benchmark/cold-http-vs-repeat.json with measured p95 differences and resource-timing caveats.

It deliberately does not assert the second run is faster: CI CPU contention, network, browser caching and display cadence vary. The unit tests cover exact intervals, grouping identity, interruption, bounded memory and anonymous CSV.

## Limitations

- rAF callback timing is not the same as GPU frame presentation.
- First vs repeat describes ordering, not verified cold/warm residency.
- Very short attacks generate few intervals and noisy percentiles.
- Retained decoded-image caches are not total VRAM, and 500 ms sampling can miss short peaks.
- The profiler keeps at most 120 latest shots and 1800 intervals per active attack.
- This diagnostic only starts on user opt-in, stores nothing in campaign saves, and uploads nothing.
