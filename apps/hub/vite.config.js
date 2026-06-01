import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const buildInfo = JSON.parse(readFileSync(resolve(__dirname, '../../build.json'), 'utf8'))

export default defineConfig({
  define: {
    __BUILD_NUMBER__: JSON.stringify(buildInfo.build),
    __BUILD_DATE__: JSON.stringify(buildInfo.date),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'pogil apps',
        short_name: 'pogil',
        description: 'Portail des applications pogil',
        theme_color: '#1a1a2e',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
