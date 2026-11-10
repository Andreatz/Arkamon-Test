import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-desktop', timeout: 120_000, workers: 1, retries: 0,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['json', { outputFile: 'output/structural-2026-10-26/desktop-browser.json' }]],
  outputDir: 'output/structural-2026-10-26/desktop-browser',
  use: { baseURL: 'http://127.0.0.1:3019/', reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop-policy', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } }],
  webServer: { command: 'node scripts/serve-desktop-verification.mjs', url: 'http://127.0.0.1:3019/', reuseExistingServer: false, timeout: 30_000 },
})
