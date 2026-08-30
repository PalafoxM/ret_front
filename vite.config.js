import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'TOKEN_ESTABLECIMIENTO'],
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
