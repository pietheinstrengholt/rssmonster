import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true
      }
    }
  },
  plugins: [
      vue(),
      VitePWA({
          devOptions: {
              enabled: true
          },
          registerType: 'autoUpdate',
          injectRegister: 'auto',
          workbox: {
            sourcemap: false,
            globPatterns: ['**/*.{js,css,html,ico,png,svg,json,vue,txt,woff2}'],
            cleanupOutdatedCaches: false,
          },
          includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
          manifest: {
            name: 'RSSMonster',
            short_name: 'RSSMonster',
            description: 'RSSMonster is an easy to use web-based RSS aggregator, created as an alternative for Google Reader.',
            theme_color: '#ffffff',
            icons: [
              {
                src: '/img/icons/android-icon-192x192.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: '/img/icons/apple-icon-180x180.png',
                sizes: '180x180',
                type: 'image/png'
              }
            ]
          }
        }
      )
    ],
    server: {
        port: 8080,
        watch: {
            usePolling: true
        }
    },
})
