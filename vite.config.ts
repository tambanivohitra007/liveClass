import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// Offline/LAN build: every Firebase SDK entry point is served by the local LiveClass server.
const lan = (file: string) => fileURLToPath(new URL(`./src/lan/${file}`, import.meta.url))
const firebaseShims = [
  { find: /^firebase\/app$/, replacement: lan('app.ts') },
  { find: /^firebase\/auth$/, replacement: lan('auth.ts') },
  { find: /^firebase\/firestore$/, replacement: lan('firestore.ts') },
  { find: /^firebase\/functions$/, replacement: lan('functions.ts') },
  { find: /^firebase\/storage$/, replacement: lan('storage.ts') },
  { find: /^firebase\/database$/, replacement: lan('database.ts') },
  { find: /^@capacitor-firebase\/authentication$/, replacement: lan('capacitor-firebase-auth.ts') },
]

export default defineConfig({
  resolve: { alias: firebaseShims },
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
      '/api': 'http://localhost:8080',
      '/uploads': 'http://localhost:8080',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          gsap: ['gsap', 'gsap/all', '@gsap/react'],
          ui: ['sweetalert2', 'qrcode.react', 'lucide-react'],
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'LiveClass Game',
        short_name: 'LiveClass',
        description: 'Real-time gamified quiz platform',
        theme_color: '#0F1729',
        background_color: '#080F1E',
        display: 'standalone',
        start_url: '/',
        shortcuts: [
          {
            name: 'Join Game',
            short_name: 'Join',
            url: '/join',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            url: '/dashboard',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
        ],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/__\/.*/, /^\/api\//, /^\/uploads\//, /^\/ws/],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
