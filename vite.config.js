import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // In production (Vercel) base is '/', for GitHub Pages it stays '/p15/'
  const base = process.env.VITE_BASE || (mode === 'production' ? '/' : '/p15/')

  return {
    plugins: [react()],
    base,
    build: {
      outDir: 'docs'
    },
    server: {
      watch: {
        ignored: ['**/server/backups/**']
      },
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true
        }
      }
    }
  }
})
