import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // mupdf грузит wasm через import.meta.url и верхнеуровневый await: предсборка
  // зависимостей переносит модуль и теряет путь к wasm, а старые цели не знают await.
  optimizeDeps: { exclude: ['mupdf'] },
  build: { target: 'esnext' },
  worker: { format: 'es' },
})
