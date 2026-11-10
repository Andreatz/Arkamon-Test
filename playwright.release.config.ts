import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-release', timeout: 120_000, globalTimeout: 10 * 60_000,
  expect: { timeout: 20_000 }, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'output/ci/compiled.json' }]],
  outputDir: 'output/ci/compiled-results',
  use: { baseURL: 'http://127.0.0.1:3016/Arkamon-Beta/', trace: 'retain-on-failure', screenshot: 'only-on-failure', reducedMotion: 'reduce' },
  projects: [{ name: 'release-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 3016 --strictPort --base /Arkamon-Beta/', url: 'http://127.0.0.1:3016/Arkamon-Beta/', reuseExistingServer: false, timeout: 60_000 },
})
