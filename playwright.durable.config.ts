import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: /durable-.*\.spec\.ts$/, timeout: 60_000, expect: { timeout: 15_000 }, workers: 1,
  outputDir: '../save-durable-test-results', reporter: [['list'], ['html', { outputFolder: '../save-durable-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3018', trace: 'retain-on-failure', screenshot: 'only-on-failure', reducedMotion: 'reduce' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: { command: 'node node_modules/vite/bin/vite.js --config e2e/vite.durable.config.ts', url: 'http://127.0.0.1:3018', reuseExistingServer: false, timeout: 60_000 },
})
