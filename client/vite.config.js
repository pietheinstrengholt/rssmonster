import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootstrapIconNames } from './bootstrap-icons.js'
import {
  OPTIONAL_ASSET_RUNTIME_CACHE,
  PRECACHE_GLOB_PATTERNS
} from './pwa-policy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
  optimizeDeps: {
    include: ['vuedraggable']
  },
  resolve: {
    alias: [{
      find: /^vue$/,
      replacement: resolve(__dirname, 'node_modules/vue/dist/vue.runtime.esm-bundler.js')
    }]
  },
  plugins: [
      vue(),
      bootstrapIconsSprite(),
      VitePWA({
          devOptions: {
              enabled: false
          },
          registerType: 'autoUpdate',
          injectRegister: 'auto',
          workbox: {
            sourcemap: false,
            importScripts: ['/push-sw.js'],
            globPatterns: PRECACHE_GLOB_PATTERNS,
            cleanupOutdatedCaches: true,
            runtimeCaching: [OPTIONAL_ASSET_RUNTIME_CACHE],
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
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.endsWith('/src/api/settings.js')) return 'settings-api';
            if (id.includes('node_modules')) {
              if (id.includes('/vue/') || id.includes('/@vue/') || id.includes('/pinia/')) return 'vue-vendor';
              if (id.includes('/axios/')) return 'axios-vendor';
            }
          }
        }
      },
      chunkSizeWarningLimit: 1000 // Optional: increase warning limit if needed
    },
  }
)
