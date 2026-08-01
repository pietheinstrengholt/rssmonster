import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
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
      reportOnFailure: true,
      thresholds: {
        statements: 90,
        branches: 41,
        functions: 34,
        lines: 90
      }
    }
  }
});
