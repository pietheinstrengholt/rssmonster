import { defineConfig } from 'vitest/config';
import { BaseSequencer } from 'vitest/node';

const SEMANTIC_BASELINE_TEST = '/tests/semanticRegression.pipeline.test.js';
const SEMANTIC_INCREMENTAL_TEST = '/tests/semanticRegression.incremental.pipeline.test.js';

// This class keeps Vitest's default sequencing while pinning dependent semantic tests.
class RssMonsterSequencer extends BaseSequencer {
  // This function checks whether a test file matches a normalized path suffix.
  isTestFile(file, testPath) {
    return file.moduleId.replaceAll('\\', '/').endsWith(testPath);
  }

  // This function ensures incremental semantic regression never runs before the baseline.
  async sort(files) {
    const sortedFiles = await super.sort(files);
    const baselineIndex = sortedFiles.findIndex(file => this.isTestFile(file, SEMANTIC_BASELINE_TEST));
    const incrementalIndex = sortedFiles.findIndex(file => this.isTestFile(file, SEMANTIC_INCREMENTAL_TEST));

    if (baselineIndex === -1 || incrementalIndex === -1 || baselineIndex < incrementalIndex) {
      return sortedFiles;
    }

    const reorderedFiles = [...sortedFiles];
    const [baselineFile] = reorderedFiles.splice(baselineIndex, 1);
    const nextIncrementalIndex = reorderedFiles.findIndex(file => this.isTestFile(file, SEMANTIC_INCREMENTAL_TEST));
    reorderedFiles.splice(nextIncrementalIndex, 0, baselineFile);

    return reorderedFiles;
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10000,
    fileParallelism: false,
    sequence: {
      sequencer: RssMonsterSequencer
    },
    globalSetup: ['./tests/setup/globalSetup.js'],
    setupFiles: ['./tests/setup/database.js']
  }
});
