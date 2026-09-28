import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Builds the extension's React-based Timeline/History page into extension/,
// alongside the hand-written background.js/content.js/popup.* files Chrome
// loads unpacked from that same folder. Run `npm run build:extension` after
// changing anything under extension-src/. emptyOutDir is false so this build
// never wipes those hand-written files.
export default defineConfig({
  root: resolve(import.meta.dirname, 'extension-src'),
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'extension'),
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'extension-src/timeline.html'),
    },
  },
})
