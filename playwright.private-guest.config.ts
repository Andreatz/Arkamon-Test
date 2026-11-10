import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const backend = process.env.ARKAMON_GUEST_BACKEND_CHECKOUT
if (!backend || !path.isAbsolute(backend)) throw new Error('Set ARKAMON_GUEST_BACKEND_CHECKOUT to the isolated Arkanight checkout')
process.env.ARKAMON_GUEST_E2E_SERVICE = 'http://127.0.0.1:3047'
export default defineConfig({
  testDir: './e2e', testMatch: 'private-guest-battle.spec.ts', fullyParallel: false, workers: 1, retries: 0, timeout: 120_000,
  expect: { timeout: 20_000 }, reporter: [['list'], ['json', { outputFile: 'output/structural-2026-10-26/private-guest.json' }]],
  use: { baseURL: 'http://127.0.0.1:3035', trace: 'retain-on-failure', screenshot: 'only-on-failure', reducedMotion: 'reduce' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node node_modules/vite/bin/vite.js --config e2e/vite.config.ts --port 3035 --strictPort', url: 'http://127.0.0.1:3035', reuseExistingServer: false, timeout: 60_000 },
    { command: 'node scripts/start-private-guest-service.mjs', url: 'http://127.0.0.1:3047', reuseExistingServer: false, timeout: 120_000 },
  ],
})
