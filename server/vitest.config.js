import { defineConfig } from 'vitest/config';
import { BaseSequencer } from 'vitest/node';

const SEMANTIC_BASELINE_TEST = '/tests/semanticRegression.pipeline.test.js'; // This test is the baseline for semantic regression; it must run first and only loads articles and creates the initial events.
const CHECK_NO_ISLANDS = '/tests/semanticRegression.noIslands.test.js'; // This test checks that no islands exist after the baseline test; it must run second and only checks for islands.
const CHECK_CREATE_ISLANDS = '/tests/semanticRegression.buildIslands.test.js'; // This test checks that islands can be created after the baseline test; it must run third and only checks for islands.
const SEMANTIC_INCREMENTAL_TEST = '/tests/semanticRegression.incremental.pipeline.test.js'; // This test checks that incremental processing produces the same semantic state as the baseline test; it must run fourth and only loads articles and creates events.
const SEMANTIC_INCREMENTAL_UNREAD_TEST = '/tests/semanticRegression.incremental.unread.pipeline.test.js'; // This test checks that incremental processing produces the same semantic state as the baseline test, but with unread articles; it must run fifth and only loads articles and creates events.
const REPAIR_RECENT_EVENTS_TEST = '/tests/repairRecentEventsForUser.service.test.js'; // This test checks that the repairRecentEventsForUser service produces the same semantic state as the baseline test; it must run sixth and only loads articles and creates events.
const CHECK_RECREATE_ISLANDS = '/tests/semanticRegression.rebuildIslands.test.js'; // This test checks that islands can be recreated after the repair test; it must run seventh and only checks for islands.

// This class keeps Vitest's default sequencing while pinning dependent semantic tests.
class RssMonsterSequencer extends BaseSequencer {
  // This function checks whether a test file matches a normalized path suffix.
  isTestFile(file, testPath) {
    return file.moduleId.replaceAll('\\', '/').endsWith(testPath);
  }

  // This function ensures semantic regression and repair tests run in dependency order.
  async sort(files) {
    const rankForFile = file => {
      if (this.isTestFile(file, SEMANTIC_BASELINE_TEST)) return 0;
      if (this.isTestFile(file, CHECK_NO_ISLANDS)) return 1;
      if (this.isTestFile(file, CHECK_CREATE_ISLANDS)) return 2;
      if (this.isTestFile(file, SEMANTIC_INCREMENTAL_TEST)) return 3;
      if (this.isTestFile(file, SEMANTIC_INCREMENTAL_UNREAD_TEST)) return 4;
      if (this.isTestFile(file, REPAIR_RECENT_EVENTS_TEST)) return 5;
      if (this.isTestFile(file, CHECK_RECREATE_ISLANDS)) return 6;
      return 7;
    };

    return files
      .map((file, index) => ({ file, index }))
      .sort((left, right) => rankForFile(left.file) - rankForFile(right.file) || left.index - right.index)
      .map(entry => entry.file);
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

