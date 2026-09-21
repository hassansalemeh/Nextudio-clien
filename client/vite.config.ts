import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Development only: the page and the API then share one address (like in production), so the login cookie works
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
