import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: {
        name: 'Leao Brinquedos',
        short_name: 'Leao Brinquedos',
        description:
          'Gestão de brinquedos: timer em tempo real, caixa e relatórios.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        id: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        categories: ['business', 'productivity'],
        prefer_related_applications: false,
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Painel de brinquedos',
            short_name: 'Painel',
            url: '/',
            description: 'Ver brinquedos e aluguéis em andamento',
          },
          {
            name: 'Histórico',
            short_name: 'Histórico',
            url: '/historico',
            description: 'Consultar sessões e pagamentos',
          },
        ],
      },
      workbox: {
        // autoUpdate: o novo SW assume na hora; o banner controla só o reload.
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/socket\.io\//,
          /^\/uploads\//,
        ],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2,wav}'],
        cleanupOutdatedCaches: true,
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            // Timer, status, autenticação e qualquer dado do negócio SEMPRE vêm do
            // servidor local. Nunca cachear respostas de API.
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            // O WebSocket não é cacheável; o polling do Socket.IO também não deve
            // ser servido do cache.
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/socket.io/'),
            handler: 'NetworkOnly',
          },
          {
            // JS, CSS, imagens e fontes: atualiza em segundo plano.
            urlPattern: ({ request }: { request: Request }) =>
              ['script', 'style', 'font', 'image'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'leaobrinquedos-assets',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000',
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
