import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/map':    'http://localhost:8000',
      '/route':  'http://localhost:8000',
      '/scan':   'http://localhost:8000',
      '/search': 'http://localhost:8000',
      '/event':  'http://localhost:8000',
      '/maps':   'http://localhost:8000',   // static floor plan image
    }
  }
})
