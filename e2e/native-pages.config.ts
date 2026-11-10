import { defineConfig } from '@playwright/test'
import gameTests from '../playwright.config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const configurationDirectory = dirname(fileURLToPath(import.meta.url))

// Dedicated preview avoids stale HMR modules while the manifest is being generated.
export default defineConfig({
  ...gameTests,
  testDir: configurationDirectory,
  testMatch: ['native-pages.spec.ts', 'native-import-39-60.spec.ts'],
  outputDir: resolve(configurationDirectory, '../../native-pages-test-results'),
  reporter: 'list',
  use: { ...gameTests.use, baseURL: 'http://127.0.0.1:3016' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config e2e/vite.config.ts --port 3016 --strictPort',
    cwd: resolve(configurationDirectory, '..'), url: 'http://127.0.0.1:3016', reuseExistingServer: false, timeout: 60_000 },
})
