import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // mupdf loads wasm via import.meta.url and a top-level await: dependency pre-bundling
  // moves the module and loses the path to the wasm, and older targets don't know await.
  optimizeDeps: { exclude: ['mupdf'] },
  build: { target: 'esnext' },
  worker: { format: 'es' },
})
