import { defineConfig } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export default defineConfig({
  testDir: resolve(root, 'e2e'), testMatch: ['splash-artwork.spec.ts', 'splash-catalog.spec.ts', 'splash-responsive-framing.spec.ts', 'splash-fullscreen.spec.ts'],
  timeout: 90_000, workers: 1, retries: 0,
  outputDir: resolve(root, 'output/splash-art/results'),
  reporter: [['list'], ['json', { outputFile: resolve(root, 'output/splash-art/results.json') }]],
  use: {
    baseURL: 'http://127.0.0.1:3067', reducedMotion: 'reduce',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'compact', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'fullhd', use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config e2e/vite.config.ts --port 3067 --strictPort',
    cwd: root, url: 'http://127.0.0.1:3067', reuseExistingServer: false, timeout: 60_000,
  },
})
