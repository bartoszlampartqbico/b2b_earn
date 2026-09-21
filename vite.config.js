import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // W dev frontend (Vite) i API (npm run server) działają na osobnych portach.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
