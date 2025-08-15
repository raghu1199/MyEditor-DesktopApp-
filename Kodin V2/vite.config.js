// // import { defineConfig } from 'vite';
// // // import monacoEditorPlugin from 'vite-plugin-monaco-editor';

// // export default defineConfig({
// //   root: '.',           // Project root is current directory
// //   base: './',          // Important for local file paths!
// //   build: {
// //     outDir: 'dist',
// //     emptyOutDir: true
// //   },
// //   server: {
// //     port: 5173,
// //     open: true
// //   }
// //   // plugins: [monacoEditorPlugin()],
// // });

// // // vite.config.js

// import { defineConfig } from 'vite';
// import monacoEditorPlugin from 'vite-plugin-monaco-editor';

// export default defineConfig({
//   base: './',
//   build: {
//     outDir: 'dist',
//     emptyOutDir: true
//   },
//    server: {
//     port: 5173,
//     open: true
//   },
//   plugins: [
//     monacoEditorPlugin({
//       // ✅ minimum required
//       languageWorkers: ['editorWorkerService', 'typescript'],
//     })
//   ]
// });

import { defineConfig } from 'vite';
import path from 'path';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      firebase: path.resolve(__dirname, 'node_modules/firebase')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    open: true
  },
  plugins: [
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService', 'typescript']
    })
  ]
});
