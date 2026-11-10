import { defineConfig, devices } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
export default defineConfig({testDir:resolve(root,'e2e'),testMatch:'reference-ui.spec.ts',timeout:90_000,workers:1,retries:0,
  outputDir:resolve(root,'output/reference-ui/results'),reporter:[['list'],['json',{outputFile:resolve(root,'output/reference-ui/results.json')}]],
  use:{baseURL:'http://127.0.0.1:3066',screenshot:'only-on-failure',trace:'retain-on-failure',reducedMotion:'reduce'},
  projects:[{name:'desktop',use:{viewport:{width:1440,height:900}}},{name:'compact',use:{viewport:{width:1366,height:768}}},{name:'mobile',use:{...devices['Pixel 7']}}],
  webServer:{command:'node node_modules/vite/bin/vite.js --config e2e/vite.config.ts --port 3066 --strictPort',cwd:root,url:'http://127.0.0.1:3066',reuseExistingServer:false,timeout:60_000}})
