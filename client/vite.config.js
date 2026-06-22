import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const bootstrapIconNames = [
  'arrow-down-circle-fill',
  'arrow-clockwise',
  'arrow-repeat',
  'arrow-up-circle-fill',
  'award-fill',
  'bookmark-fill',
  'box-arrow-right',
  'check-circle-fill',
  'check2-square',
  'check-square-fill',
  'collection-fill',
  'download',
  'eraser-fill',
  'exclamation-circle-fill',
  'exclamation-triangle-fill',
  'fire',
  'folder',
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
  'plus-square',
  'plus-square-fill',
  'record-circle-fill',
  'robot',
  'rss-fill',
  'slash-circle-fill',
  'tag',
  'three-dots',
  'trash-fill',
  'trash3-fill',
  'upload',
  'x-octagon-fill',
  'brightness-high'
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
            globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest,vue,txt,woff2}'],
            cleanupOutdatedCaches: false,
          },
          // Favicons generates the manifest and all of its icon assets.
          manifest: false
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
