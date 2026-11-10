import { defineConfig } from '@playwright/test'
import gameTests from '../playwright.config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  ...gameTests,
  testDir: directory,
  testMatch: ['native-import-117-139.spec.ts'],
  testIgnore: [],
  outputDir: resolve(directory, '../output/animation-import-2026-11-04/browser-results'),
  reporter: [['list'], ['json', { outputFile: resolve(directory, '../output/animation-import-2026-11-04/browser-results.json') }]],
  use: { ...gameTests.use, baseURL: 'http://127.0.0.1:3068' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config e2e/vite.config.ts --port 3068 --strictPort',
    cwd: resolve(directory, '..'), url: 'http://127.0.0.1:3068', reuseExistingServer: false, timeout: 60_000,
  },
})
