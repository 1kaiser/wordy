import { defineConfig } from 'vite'

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
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers']
  },
  define: {
    global: 'globalThis',
  },
})