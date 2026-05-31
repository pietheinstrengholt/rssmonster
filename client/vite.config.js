import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const bootstrapIconNames = [
  'arrow-down-circle-fill',
  'arrow-repeat',
  'arrow-up-circle-fill',
  'award-fill',
  'bookmark-fill',
  'box-arrow-right',
  'check-circle-fill',
  'check-square-fill',
  'collection-fill',
  'download',
  'eraser-fill',
  'exclamation-circle-fill',
  'exclamation-triangle-fill',
  'fire',
  'folder-fill',
  'gear-fill',
  'hand-thumbs-down-fill',
  'hand-thumbs-up-fill',
  'heart-fill',
  'info-circle-fill',
  'lightbulb-fill',
  'megaphone-fill',
  'patch-check-fill',
  'pencil-fill',
  'people-fill',
  'plus-circle-fill',
  'plus-square-fill',
  'record-circle-fill',
  'robot',
  'rss-fill',
  'slash-circle-fill',
  'tag-fill',
  'three-dots',
  'trash-fill',
  'trash3-fill',
  'upload',
  'x-octagon-fill'
]

const bootstrapIconsSprite = () => {
  const virtualModuleId = 'virtual:bootstrap-icons-sprite'
  const resolvedVirtualModuleId = `\0${virtualModuleId}`
  const iconsDir = resolve(__dirname, 'node_modules/bootstrap-icons/icons')

  return {
    name: 'bootstrap-icons-sprite',
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) {
        return null
      }

      const symbols = bootstrapIconNames.map(iconName => {
        const iconPath = resolve(iconsDir, `${iconName}.svg`)

        if (!existsSync(iconPath)) {
          throw new Error(`Missing Bootstrap icon: ${iconName}`)
        }

        const svg = readFileSync(iconPath, 'utf8')
        const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] || '0 0 16 16'
        const body = svg
          .replace(/^[\s\S]*?<svg[^>]*>/, '')
          .replace(/<\/svg>\s*$/, '')
          .trim()

        return `<symbol class="bi bi-${iconName}" viewBox="${viewBox}" id="${iconName}">${body}</symbol>`
      }).join('')

      return `export default ${JSON.stringify(`<svg xmlns="http://www.w3.org/2000/svg">${symbols}</svg>`)}`
    }
  }
}

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
      bootstrapIconsSprite(),
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
                src: '/img/icons/web-app-manifest-192x192.png',
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
              if (id.includes('/vue/') || id.includes('/@vue/') || id.includes('/pinia/')) return 'vue-vendor';
              if (id.includes('/axios/')) return 'axios-vendor';
              if (id.includes('/bootstrap/') || id.includes('/@popperjs/')) return 'bootstrap-vendor';
              if (id.includes('/@dvuckovic/vue3-bootstrap-icons/')) return 'icons-vendor';
            }
          }
        }
      },
      chunkSizeWarningLimit: 1000 // Optional: increase warning limit if needed
    },
  }
)
