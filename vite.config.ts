import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://octodemo.github.io/ghcp-ulb-ui/ on GitHub Pages.
  base: '/ghcp-ulb-ui/',
  plugins: [react()],
})
