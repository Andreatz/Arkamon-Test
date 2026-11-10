import { defineConfig, mergeConfig } from 'vite'
import { createGameConfig } from '../vite.config'
export default defineConfig(env => mergeConfig(createGameConfig(env), { server: { host: '127.0.0.1', port: 3018, strictPort: true, open: false,
  watch: { ignored: ['**/public/sprites/arkamon-paged/**', '**/src/data/arkamon-paged.json', '**/docs/arkamon-pages-verification.json'] },
} }))
