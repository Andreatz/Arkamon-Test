import { defineConfig, devices } from '@playwright/test'

// Local proof of the real production bundle against its not-yet-published media
// revision. The spec substitutes only that exact revision's verified files.
export default defineConfig({
  // Fifty-five required cases cover the existing VFX flow, 46 pending native
  // forms and three original portraits. Keep each case's deadline unchanged.
  testDir: './e2e-native-release', timeout: 120_000, globalTimeout: 20 * 60_000,
  expect: { timeout: 15_000 }, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'output/ci/compiled-native.json' }]],
  outputDir: 'output/ci/compiled-native-results',
  use: { baseURL: 'http://127.0.0.1:3067/Arkamon-Beta/', trace: 'retain-on-failure', screenshot: 'only-on-failure', reducedMotion: 'no-preference' },
  projects: [{ name: 'compiled-native-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 3067 --strictPort --base /Arkamon-Beta/', url: 'http://127.0.0.1:3067/Arkamon-Beta/', reuseExistingServer: false, timeout: 60_000 },
})
