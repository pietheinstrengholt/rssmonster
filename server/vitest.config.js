import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10000,
    fileParallelism: false,
    globalSetup: ['./tests/setup/globalSetup.js'],
    setupFiles: ['./tests/setup/database.js']
  }
});
