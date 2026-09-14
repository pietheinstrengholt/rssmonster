import { configDefaults, mergeConfig } from 'vitest/config';
import config from './vitest.config.js';

// Model-backed evaluations are local-only, including fixture checks outside semantic/.
// Ordinary Event, Island, recommendation and embedding service tests stay in CI.
export default mergeConfig(config, {
  test: {
    exclude: [
      ...configDefaults.exclude,
      'tests/semantic/**',
      'tests/helpers/semanticExpansion.test.js',
      'tests/scripts/realIncrementalFixture.test.js',
      'tests/scripts/semanticLongitudinalFixture.test.js'
    ]
  }
});
