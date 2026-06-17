import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend fica em web/. Build sai em web/dist (servido pelo Fastify em producao).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
