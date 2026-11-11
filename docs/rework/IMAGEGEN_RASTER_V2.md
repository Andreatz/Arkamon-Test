# ImageGen Raster UI v2 — pending binary upload

This branch replaces the ornamental CSS/SVG-style game interface from Aether v5 with real transparent raster art **generated as eight individual ImageGen images**. React content, health values, game rules, sprite timing and dice mechanics remain unchanged.

## What is ready in GitHub

- `src/scenes/battleImageGenV2.css`: raster-only art references with hover/pressed states and accessibility/responsive layout. CSS controls positions and behaviors but does not paint the ornaments.
- The stylesheet is imported by Battle and Title scenes, replacing gradients for HP frames, move cards, Supreme, dialogue, small actions, game modals, and title menu.
- `scripts/check-imagegen-v2.mjs`: verifies 17 genuine WebP files, animated Supreme WebP and the 4MiB runtime budget.
- The battle visual Playwright test checks actual HTTP 200 WebP assets, active UI and reduced-motion static Supreme. All previous battle/checkpoint tests remain.

## Binary upload required to complete draft PR

The ImageGen asset bytes exist in the attached small kit ZIP, not in the source connector. `public/ui/imagegen/v2/*.webp` must be added to the PR branch **before CI can pass**. Do not merge until the actual images are present and Playwright screenshots look correct. The repository's source connector accepts text/base64 blobs but does not have a direct local-binary upload action.

Without cloning the large source repository, use the provided `publish_assets_to_github.py` on a machine with GitHub CLI installed and authenticated (`gh auth login`): it uploads just the 17 WebP images through GitHub Git Data API, creates one commit and moves the PR branch. No GitHub token should be supplied in chat.

The kit also provides original PNGs, a separate offline installer for local checkouts and two static previews. The images use 8 full-resolution original ImageGen compositions. Hover/pressed variations and the Supreme loop are raster transformations/crossfades of these real compositions, not independently ImageGen-rendered new frames.

## Visual review after upload

Check Battle at 1280x720 and 640x360; preserve legible move text, correct HP masking, no clipped Capture button or overlapping portraits, and the original native sprite choreography. Test the user reducedMotion preference and OS `prefers-reduced-motion`, keyboard focus, dark/light forests, KO, checkpoints and title navigation.

## Constraints

This is an experimental branch only. `Arkamon-Beta` must remain unchanged. The current CSS layout still places pre-rendered raster textures; it must not be mistaken for CSS-generated artwork. Do not claim a frame-rate uplift before performance profiler tests on the user's OBS hardware.
