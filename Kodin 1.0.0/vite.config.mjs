import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor' // <-- works in latest

// recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      firebase: resolve(__dirname, 'node_modules/firebase'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: true,
  },
  plugins: [
    monacoEditorPlugin.default({
      languageWorkers: ['editorWorkerService', 'typescript'],
    }),
  ],
})
