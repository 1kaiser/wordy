import { defineConfig } from 'vite'
import { writeFileSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  base: '/wordy/',
  server: {
    host: '0.0.0.0', // Allow external connections
    port: 3004,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        rag: 'rag-demo.html',
        muvera: 'muvera.html',
      },
    },
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers']
  },
  define: {
    global: 'globalThis',
  },
  plugins: [
    {
      name: 'add-nojekyll',
      closeBundle() {
        // Create .nojekyll file to disable Jekyll on GitHub Pages
        writeFileSync(join(__dirname, 'dist', '.nojekyll'), '')
      }
    }
  ]
})