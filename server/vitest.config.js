import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    silent: process.env.RSSMONSTER_TEST_DEBUG === 'true' ? false : 'passed-only',
    disableConsoleIntercept: process.env.RSSMONSTER_TEST_DEBUG === 'true',
    testTimeout: 10000,
    fileParallelism: false,
    globalSetup: ['./tests/setup/globalSetup.js'],
    setupFiles: ['./tests/setup/database.js']
  }
});
