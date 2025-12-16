import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
        includePaths: ['node_modules'],
        silenceDeprecations: ['color-functions', 'global-builtin', 'import'] // Suppress deprecation warnings: https://github.com/twbs/bootstrap/issues/40962
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
            // Don't try to cache external images (CORS issues)
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|gif|webp|svg)$/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'external-images',
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
                  },
                  cacheableResponse: {
                    statuses: [0, 200] // Cache opaque responses (status 0)
                  },
                  fetchOptions: {
                    mode: 'no-cors' // Avoid CORS errors for external images
                  }
                }
              }
            ]
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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('vue')) return 'vue-vendor';
              if (id.includes('axios')) return 'axios-vendor';
              return 'vendor';
            }
          }
        }
      },
      chunkSizeWarningLimit: 1000 // Optional: increase warning limit if needed
    },
  }
)
