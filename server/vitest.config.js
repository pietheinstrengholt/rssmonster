import { defineConfig } from 'vitest/config';
import { BaseSequencer } from 'vitest/node';

const SEMANTIC_BASELINE_TEST = '/tests/semantic/semanticRegression.pipeline.test.js'; // This test is the baseline for semantic regression; it must only create the first set of events.
const CHECK_CREATE_TOPICS = '/tests/semantic/semanticRegression.createTopics.test.js'; // This test creates and checks topics after baseline events exist.
const CHECK_NO_ISLANDS = '/tests/semantic/semanticRegression.noIslands.test.js'; // Check that no islands exist after the topics are created
const CHECK_CREATE_ISLANDS = '/tests/semantic/semanticRegression.createIslands.test.js'; // This test builds and checks the islands.
const SEMANTIC_INCREMENTAL_TEST = '/tests/semantic/semanticRegression.incremental.pipeline.test.js'; // This test loads the next article wave and only creates or reuses events.
const SEMANTIC_INCREMENTAL_TOPICS_TEST = '/tests/semantic/semanticRegression.incremental.updateTopics.test.js'; // This test updates topics after the incremental event pass.
const SEMANTIC_INCREMENTAL_ISLANDS_TEST = '/tests/semantic/semanticRegression.incremental.updateIslands.test.js'; // This test updates islands after incremental topics.
const SEMANTIC_INCREMENTAL_UNREAD_TEST = '/tests/semantic/semanticRegression.incremental.unread.pipeline.test.js'; // This test adds more articles. It only creates events for the newly added articles.
const REPAIR_RECENT_EVENTS_TEST = '/tests/events/repairRecentEventsForUser.service.test.js'; // This test checks that the repairRecentEventsForUser service produces the same semantic state as the baseline test; it must run sixth and only loads articles and creates events.
const CHECK_RECREATE_ISLANDS = '/tests/semantic/semanticRegression.rebuildIslands.test.js'; // This test checks that islands can be recreated after the repair test; it must run seventh and only checks for islands.
const CHECK_ARTICLE_COUNT = '/tests/semantic/semanticRegression.articleCount.test.js'; // This test checks that all semantic regression fixture articles exist after processing.
//TODO: add here the semanticRegression.incremental.adEvent.test.js. It loads three almost identical articles. It should validate that two of these articles are marked as duplicates

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
      if (this.isTestFile(file, CHECK_CREATE_TOPICS)) return 1;
      if (this.isTestFile(file, CHECK_NO_ISLANDS)) return 2;
      if (this.isTestFile(file, CHECK_CREATE_ISLANDS)) return 3;
      if (this.isTestFile(file, SEMANTIC_INCREMENTAL_TEST)) return 4;
      if (this.isTestFile(file, SEMANTIC_INCREMENTAL_TOPICS_TEST)) return 5;
      if (this.isTestFile(file, SEMANTIC_INCREMENTAL_ISLANDS_TEST)) return 6;
      if (this.isTestFile(file, SEMANTIC_INCREMENTAL_UNREAD_TEST)) return 7;
      if (this.isTestFile(file, REPAIR_RECENT_EVENTS_TEST)) return 8;
      if (this.isTestFile(file, CHECK_RECREATE_ISLANDS)) return 9;
      if (this.isTestFile(file, CHECK_ARTICLE_COUNT)) return 10;
      return 11;
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
