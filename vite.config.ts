import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/zed.ai/',
  build: {
    outDir: 'dist'
  }
})
