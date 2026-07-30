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
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
      thresholds: {
        statements: 30,
        branches: 34,
        functions: 26,
        lines: 31
      }
    }
  }
});
