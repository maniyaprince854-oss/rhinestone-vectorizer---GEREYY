import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: Change 'rhinestone-vectorizer' below to match your GitHub repo name
  // Example: if your repo is github.com/username/my-tool, use base: '/my-tool/'
  base: process.env.VERCEL ? '/' : (process.env.NODE_ENV === 'production' ? '/rhinestone-vectorizer/' : '/'),
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    open: true,
  },
})
