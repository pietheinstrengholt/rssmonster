import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const testRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'virtual:bootstrap-icons-sprite': resolve(
        testRoot,
        'tests/fixtures/bootstrap-icons-sprite.js'
      )
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    coverage: {
      all: true,
      include: ['src/**/*.{js,vue}'],
      exclude: ['src/main.js'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', ['lcov', { projectRoot: '..' }]],
      reportsDirectory: 'coverage',
      reportOnFailure: true
    }
  }
});
