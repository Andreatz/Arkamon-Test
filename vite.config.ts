import { defineConfig, type ConfigEnv, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import mediaRelease from './src/data/media-release.json'
// @ts-expect-error The packaging utility also runs as a standalone Node ES module.
import { assertPinnedMediaRevision, readPlayableFrontSpriteIds, webAssetsPlugin } from './scripts/package-web-assets.mjs'
// @ts-expect-error Shared Node build utility; emitted runtime data has a typed virtual module.
import { nativeRuntimeManifestPlugin } from './scripts/native-runtime-manifest.mjs'
// @ts-expect-error Node packaging module is shared with the release checks.
import { separateDesktopResources } from './scripts/separate-desktop-resources.mjs'

// Cambia base se pubblichi su GitHub Pages sotto /Arkamon-Beta/.
// Il workflow .github/workflows/ci.yml setta GITHUB_PAGES=true al build.
export function createGameConfig({ command, mode }: ConfigEnv): UserConfig {
  const web = process.env.GITHUB_PAGES === 'true' && mode !== 'desktop'
  const bounded = command === 'build' && process.env.ARKAMON_TEST_FULL_MEDIA === 'true'
  const mediaRevision = bounded ? assertPinnedMediaRevision(process.env.VITE_MEDIA_REVISION ?? mediaRelease.revision, mediaRelease) : mediaRelease.revision
  return {
  plugins: [react(), nativeRuntimeManifestPlugin(__dirname), ...(bounded ? [webAssetsPlugin(__dirname, mediaRevision, mode === 'desktop'
    ? (output: string) => separateDesktopResources({ output, resources: path.resolve(__dirname, 'dist-desktop-resources'), alreadySeparated: true }) : undefined,
    mode === 'desktop' ? path.resolve(__dirname, 'dist-desktop-resources') : undefined)] : [])],
  publicDir: 'public',
  define: { 'import.meta.env.VITE_MEDIA_REVISION': JSON.stringify(mediaRevision), 'import.meta.env.VITE_SPLIT_MEDIA': JSON.stringify(true),
    'import.meta.env.VITE_LOCAL_FRONT_SPRITE_IDS': JSON.stringify(readPlayableFrontSpriteIds(__dirname)) },
  base: web ? '/Arkamon-Test/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@data': path.resolve(__dirname, './src/data'),
      '@engine': path.resolve(__dirname, './src/engine'),
      '@store': path.resolve(__dirname, './src/store'),
      '@components': path.resolve(__dirname, './src/components'),
      '@scenes': path.resolve(__dirname, './src/scenes'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
  server: {
    port: 3000,
    open: true,
    // Reports and desktop codegen contain HTML. Building or collecting evidence
    // must not reload a live game or an unrelated animation harness.
    watch: { ignored: ['**/output/**', '**/test-results/**', '**/playwright-report/**', '**/src-tauri/target/**', '**/dist/**', '**/dist-desktop/**', '**/dist-desktop-resources/**'] },
  },
  build: {
    // Every release uses the validated package. Source videos and full atlases
    // are retained in the repository and never embedded in the executable.
    copyPublicDir: !bounded,
    manifest: true,
    ...(mode === 'desktop' ? { outDir: 'dist-desktop' } : {}),
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
          zustand: ['zustand'],
        },
      },
    },
  },
  }
}
export default defineConfig(createGameConfig)
