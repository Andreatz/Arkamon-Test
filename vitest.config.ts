import { defineConfig, mergeConfig, configDefaults } from 'vitest/config'
import { createGameConfig } from './vite.config'
export default defineConfig(env => mergeConfig(createGameConfig(env), { test: { exclude: [
  ...configDefaults.exclude, 'e2e/**', 'e2e-release/**', 'e2e-desktop/**', 'e2e-native-release/**', 'output/**', 'test-results/**', 'playwright-report/**',
  // These import-pipeline suites use node:test and run through test:ui-assets.
  'tests/reference-svg-atlas.test.mjs', 'tests/provided-png-package.test.mjs', 'scripts/__tests__/catalog-splash-artwork.test.mjs',
  'scripts/__tests__/startup-budget.test.mjs', 'scripts/__tests__/release-verification.test.mjs', 'scripts/__tests__/public-relay.test.mjs',
  'scripts/__tests__/public-media-relay.test.mjs',
  'scripts/__tests__/desktop-resources.test.mjs',
] } }))
