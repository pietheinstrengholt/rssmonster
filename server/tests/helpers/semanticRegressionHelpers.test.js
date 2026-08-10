import { beforeEach, describe, expect, it, vi } from 'vitest';

// These mocks isolate helper behavior from the database, filesystem, and semantic services.
const mocked = vi.hoisted(() => {
  // This function gives each mocked Sequelize model independent method spies.
  const makeModel = () => ({
    bulkCreate: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    findOrCreate: vi.fn()
  });

  return {
    Article: makeModel(),
    ArticleTopic: makeModel(),
    Category: makeModel(),
    Event: makeModel(),
    EventTopic: makeModel(),
    Feed: makeModel(),
    Island: makeModel(),
    IslandTaxonomy: makeModel(),
    IslandTopic: makeModel(),
    Tag: makeModel(),
    Topic: makeModel(),
    User: makeModel(),
    cosineSimilarity: vi.fn(),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    runIslandCalibrationForUser: vi.fn(),
    sequelize: {
      connectionManager: {
        getConnection: vi.fn(),
        releaseConnection: vi.fn()
      },
      getDialect: vi.fn(),
      getDatabaseName: vi.fn(),
      getQueryInterface: vi.fn(),
      sync: vi.fn()
    },
    writeFile: vi.fn()
  };
});

vi.mock('node:fs/promises', () => ({
  mkdir: mocked.mkdir,
  readFile: mocked.readFile,
  writeFile: mocked.writeFile
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: mocked.Article,
    ArticleTopic: mocked.ArticleTopic,
    Category: mocked.Category,
    Event: mocked.Event,
    EventTopic: mocked.EventTopic,
    Feed: mocked.Feed,
    Island: mocked.Island,
    IslandTaxonomy: mocked.IslandTaxonomy,
    IslandTopic: mocked.IslandTopic,
    sequelize: mocked.sequelize,
    Tag: mocked.Tag,
    Topic: mocked.Topic,
    User: mocked.User
  }
}));

vi.mock('../../services/islands/runIslandCalibration.js', () => ({
  runIslandCalibrationForUser: mocked.runIslandCalibrationForUser
}));

vi.mock('../../services/vectors/index.js', async importOriginal => ({
  ...await importOriginal(),
  cosineSimilarity: mocked.cosineSimilarity
}));

vi.mock('../../services/recommendations/recommendedScore.js', () => ({
  computeRecommended: vi.fn(article => article.recommended || 0),
  computeRecommendedBreakdown: vi.fn(article => article.breakdown || {})
}));

import {
  INCREMENTAL_FIXTURE_PATH,
  articleContent,
  articleTitle,
  buildFixturePublishedResolver,
  buildVectorMap,
  findIncrementalArticleIds,
  fixtureContentHashes,
  hashContent,
  hasIncrementalVectorFixture,
  insertMissingFixtureArticles,
  loadFixture,
  loadIncrementalFixture,
  loadIncrementalVectorFixture
} from './semanticRegressionIncremental.js';
import {
  expectSemanticRegressionIslandsBuilt,
  hasTaxonomyVectorFixture,
  runSemanticRegressionIslandBuild
} from './semanticRegressionIslands.js';
import {
  printSemanticArticleRankingTable,
  printSemanticArticleRankingTableForUser,
  semanticArticleRankingRows
} from './semanticRegressionReport.js';
import {
  markSemanticRegressionArticles,
  printSemanticRegressionTrace,
  refreshSemanticRegressionTrace,
  resetSemanticRegressionTrace
} from './semanticRegressionTrace.js';
import { resetDatabase } from './resetDb.js';

// This function creates a filesystem error with the code branches used by the helpers.
function fileError(code) {
  return Object.assign(new Error(code), { code });
}

// This function resets every dependency mock to a safe default for helper tests.
function resetMocks() {
  vi.clearAllMocks();
  mocked.readFile.mockRejectedValue(fileError('ENOENT'));
  mocked.mkdir.mockResolvedValue(undefined);
  mocked.writeFile.mockResolvedValue(undefined);
  mocked.cosineSimilarity.mockReturnValue(0.9);
  mocked.sequelize.connectionManager.getConnection.mockReset();
  mocked.sequelize.connectionManager.releaseConnection.mockReset();
  mocked.sequelize.getDialect.mockReset().mockReturnValue('mysql');
  mocked.sequelize.getDatabaseName.mockReset();
  mocked.sequelize.getQueryInterface.mockReset();
  mocked.sequelize.sync.mockReset();

  for (const model of [
    mocked.Article,
    mocked.ArticleTopic,
    mocked.Category,
    mocked.Event,
    mocked.EventTopic,
    mocked.Feed,
    mocked.Island,
    mocked.IslandTaxonomy,
    mocked.IslandTopic,
    mocked.Tag,
    mocked.Topic,
    mocked.User
  ]) {
    model.bulkCreate.mockResolvedValue([]);
    model.count.mockResolvedValue(0);
    model.create.mockResolvedValue({});
    model.findAll.mockResolvedValue([]);
    model.findOne.mockResolvedValue(null);
    model.findOrCreate.mockResolvedValue([{ id: 1 }]);
  }
}

beforeEach(() => {
  resetMocks();
});

describe('semantic regression incremental helpers', () => {
  it('loads BOM-prefixed fixtures through both fixture entry points', async () => {
    mocked.readFile.mockResolvedValue('\uFEFF{"articles":[]}');

    await expect(loadFixture('/fixture.json')).resolves.toEqual({ articles: [] });
    await expect(loadIncrementalFixture()).resolves.toEqual({ articles: [] });
    expect(mocked.readFile).toHaveBeenLastCalledWith(INCREMENTAL_FIXTURE_PATH, 'utf8');
  });

  it('reports missing vector fixtures and preserves unexpected filesystem errors', async () => {
    await expect(loadIncrementalVectorFixture()).rejects.toThrow(
      'Run `npm run fixture:semantic-incremental-vectors`'
    );
    await expect(hasIncrementalVectorFixture()).resolves.toBe(false);

    mocked.readFile.mockRejectedValue(fileError('EACCES'));

    await expect(loadIncrementalVectorFixture()).rejects.toMatchObject({ code: 'EACCES' });
    await expect(hasIncrementalVectorFixture()).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('detects an available vector fixture', async () => {
    mocked.readFile.mockResolvedValue('{}');

    await expect(hasIncrementalVectorFixture()).resolves.toBe(true);
  });

  it('normalizes fixture content, titles, hashes, and vector defaults', () => {
    const vectorMap = buildVectorMap({
      embeddingModel: 'fixture-model',
      articles: [
        { contentSourceHash: 'one', articleVector: [1], embeddingModel: 'row-model' },
        { contentSourceHash: 'two', articleVector: [2] }
      ]
    });

    expect(articleContent({ contentHtml: '  html  ', contentOriginal: 'raw' })).toBe('html');
    expect(articleContent({ contentOriginal: '  raw  ' })).toBe('raw');
    expect(articleContent({ content: '  body  ' })).toBe('body');
    expect(articleContent({ title: '  title  ' })).toBe('title');
    expect(articleContent({})).toBe('');
    expect(articleTitle({ title: 'Explicit title' }, 0)).toBe('Explicit title');
    expect(articleTitle({ content: 'First sentence. Second sentence.' }, 0)).toBe('First sentence');
    expect(articleTitle({}, 2)).toBe('Semantic incremental fixture article 3');
    expect(vectorMap.get('one').embeddingModel).toBe('row-model');
    expect(vectorMap.get('two').embeddingModel).toBe('fixture-model');
    expect(fixtureContentHashes({ articles: [{ content: 'body' }] })).toEqual([hashContent('body')]);
  });

  it('normalizes fixture dates while retaining deterministic fallbacks', () => {
    const fallback = new Date('2026-01-01T00:00:00.000Z');
    const fallbackResolver = buildFixturePublishedResolver([{ publishedAt: 'invalid' }]);
    const resolver = buildFixturePublishedResolver([
      { publishedAt: '2020-01-01T00:00:00.000Z' },
      { publishedAt: '2020-01-03T00:00:00.000Z' }
    ], Date.parse('2026-01-08T01:00:00.000Z'));

    expect(fallbackResolver({}, fallback)).toBe(fallback);
    expect(resolver({ publishedAt: 'invalid' }, fallback)).toBe(fallback);
    expect(resolver({ publishedAt: '2020-01-03T00:00:00.000Z' }, fallback))
      .toEqual(new Date('2026-01-08T00:00:00.000Z'));
  });

  it('finds incremental IDs from supplied and loaded fixtures', async () => {
    mocked.Article.findAll.mockResolvedValue([{ id: '4' }, { id: 7 }]);

    await expect(findIncrementalArticleIds(9, {
      articles: [{ content: 'fixture body' }]
    })).resolves.toEqual([4, 7]);

    mocked.readFile.mockResolvedValue('{"articles":[{"content":"loaded body"}]}');
    await expect(findIncrementalArticleIds(9)).resolves.toEqual([4, 7]);
    expect(mocked.Article.findAll).toHaveBeenCalledTimes(2);
  });

  it('inserts only missing fixture articles with fallback fixture defaults', async () => {
    const fixture = {
      categories: [],
      feeds: [{
        id: 3,
        url: 'https://feed.example.test/rss',
        feedName: 'Fixture feed',
        categoryId: 99
      }],
      articles: [
        { feedId: 3, content: 'existing body' },
        { feedId: 3, content: 'new body' }
      ]
    };
    mocked.Category.findOrCreate.mockResolvedValue([{ id: 11 }]);
    mocked.Feed.findOrCreate.mockResolvedValue([{ id: 12 }]);
    mocked.Article.findOne
      .mockResolvedValueOnce({ id: 20 })
      .mockResolvedValueOnce(null);
    const vectorMap = new Map([[
      hashContent('new body'),
      { articleVector: [0.1, 0.2], embeddingModel: 'fixture-model' }
    ]]);

    await expect(insertMissingFixtureArticles(9, fixture, vectorMap, 'https://fixture.test'))
      .resolves.toBe(1);
    expect(mocked.Article.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 9,
      feedId: 12,
      title: 'new body',
      url: 'https://fixture.test/2',
      articleVector: [0.1, 0.2],
      embedding_model: 'fixture-model'
    }));
  });

  it('rejects missing article vectors before inserting an article', async () => {
    const fixture = {
      categories: [{ id: 1, name: 'Fixture category' }],
      feeds: [{ id: 1, categoryId: 1, url: 'https://fixture.test/feed' }],
      articles: [{ feedId: 1, content: 'missing vector' }]
    };

    await expect(insertMissingFixtureArticles(9, fixture, new Map(), 'https://fixture.test'))
      .rejects.toThrow(`Missing semantic vector for fixture article ${hashContent('missing vector')}`);
    expect(mocked.Article.create).not.toHaveBeenCalled();
  });
});

describe('semantic regression island helpers', () => {
  it('handles available, missing, and unreadable taxonomy fixtures', async () => {
    mocked.readFile.mockResolvedValueOnce('{}');
    await expect(hasTaxonomyVectorFixture()).resolves.toBe(true);

    mocked.readFile.mockRejectedValueOnce(fileError('ENOENT'));
    await expect(hasTaxonomyVectorFixture()).resolves.toBe(false);

    mocked.readFile.mockRejectedValueOnce(fileError('EACCES'));
    await expect(hasTaxonomyVectorFixture()).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('requires the semantic regression user before building islands', async () => {
    await expect(runSemanticRegressionIslandBuild()).rejects.toThrow(
      'semantic regression user should exist before island build'
    );
  });

  it('loads taxonomy rows, calibrates islands, and returns persisted counts', async () => {
    mocked.User.findOne.mockResolvedValue({ id: 7 });
    mocked.readFile.mockResolvedValue(JSON.stringify({
      embeddingModel: 'taxonomy-model',
      taxonomy: [{
        identity: 'technology',
        categoryName: 'Technology',
        displayName: 'Technology',
        vector: [1, 0]
      }]
    }));
    mocked.IslandTaxonomy.count.mockResolvedValue(1);
    mocked.runIslandCalibrationForUser.mockResolvedValue({
      islandCount: 2,
      enrichedIslandCount: 1,
      islandTopicLinkCount: 3
    });
    mocked.Island.count.mockResolvedValue(2);
    mocked.IslandTopic.count.mockResolvedValue(3);
    mocked.Article.count.mockResolvedValue(4);

    await expect(runSemanticRegressionIslandBuild()).resolves.toEqual(expect.objectContaining({
      taxonomyCount: 1,
      islandCount: 2,
      islandTopicLinkCount: 3,
      scoredArticleCount: 4
    }));
    expect(mocked.runIslandCalibrationForUser).toHaveBeenCalledWith(7, {
      topicConfidenceThreshold: 0.02
    });

    await expectSemanticRegressionIslandsBuilt(expect);
  });
});

describe('semantic regression report helpers', () => {
  it('returns ranked semantic rows using direct and vector-fallback islands', async () => {
    mocked.Island.findAll.mockResolvedValue([
      { id: 1, label: 'Direct Island Name', weight: 0.5, islandVector: [1, 0] },
      { id: 2, label: 'Fallback Island Name', weight: 0.8, islandVector: [0, 1] }
    ]);
    mocked.IslandTopic.findAll.mockResolvedValue([
      { islandId: 99, topicId: 10 },
      { islandId: 1, topicId: 10 }
    ]);
    mocked.cosineSimilarity
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.9);
    mocked.Article.findAll.mockResolvedValue([
      {
        id: 1,
        topicId: 10,
        interestScore: 1,
        recommended: 0.4,
        breakdown: { freshness: 0.1 },
        get: vi.fn(field => field === 'topic' ? { id: 10, name: 'Topic Name Long' } : null)
      },
      {
        id: 2,
        articleVector: [0, 1],
        interestScore: 2,
        recommended: 0.8,
        breakdown: { coverage: 0.3 },
        get: vi.fn(field => field === 'event' ? { id: 3, name: 'Event Name Long' } : null)
      },
      {
        id: 3,
        interestScore: 0,
        get: vi.fn()
      }
    ]);

    await expect(semanticArticleRankingRows(7, { newArticleIds: ['2'], limit: 2 }))
      .resolves.toEqual([
        expect.objectContaining({ ID: 2, New: '*', Event: 'Event Name', Island: 'Fallback Island' }),
        expect.objectContaining({ ID: 1, Topic: 'Topic Name', Island: 'Direct Island' })
      ]);
  });

  it('treats missing semantic tables as an empty report and preserves other errors', async () => {
    mocked.Island.findAll.mockRejectedValueOnce({
      original: { code: 'ER_NO_SUCH_TABLE' }
    });
    mocked.Article.findAll.mockResolvedValueOnce([]);
    await expect(semanticArticleRankingRows(7)).resolves.toEqual([]);

    mocked.Island.findAll.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(semanticArticleRankingRows(7)).rejects.toThrow('database unavailable');

    mocked.Island.findAll.mockResolvedValueOnce([]);
    mocked.Article.findAll.mockRejectedValueOnce({
      parent: { code: 'ER_NO_SUCH_TABLE' }
    });
    await expect(semanticArticleRankingRows(7)).resolves.toEqual([]);
  });

  it('prints reports only when a user is available', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocked.Article.findAll.mockResolvedValue([]);

    await expect(printSemanticArticleRankingTable(null)).resolves.toEqual([]);
    await expect(printSemanticArticleRankingTable(7)).resolves.toEqual([]);
    expect(consoleSpy).toHaveBeenCalledOnce();

    mocked.User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 7 });
    await expect(printSemanticArticleRankingTableForUser('missing')).resolves.toEqual([]);
    await expect(printSemanticArticleRankingTableForUser('present')).resolves.toEqual([]);

    consoleSpy.mockRestore();
  });
});

describe('semantic regression trace helpers', () => {
  it('persists deduplicated baseline and incremental identities across phases', async () => {
    const initial = await resetSemanticRegressionTrace({
      userId: 7,
      baselineArticleIds: ['2', 1, 2],
      incrementalArticleIds: [4]
    });
    expect(initial.baselineArticleIds).toEqual([1, 2]);
    expect(initial.articles['4']).toMatchObject({ source: 'incremental', isNew: true });

    const persistedText = mocked.writeFile.mock.calls.at(-1)[1];
    mocked.readFile.mockResolvedValue(persistedText);
    const marked = await markSemanticRegressionArticles({
      userId: 7,
      baselineArticleIds: [3],
      incrementalArticleIds: ['4', 5]
    });

    expect(marked.baselineArticleIds).toEqual([1, 2, 3]);
    expect(marked.incrementalArticleIds).toEqual([4, 5]);
  });

  it('creates a new trace for a different user and preserves filesystem failures', async () => {
    mocked.readFile.mockResolvedValue(JSON.stringify({ userId: 6, articles: {} }));
    await expect(markSemanticRegressionArticles({
      userId: 7,
      baselineArticleIds: [1]
    })).resolves.toMatchObject({ userId: 7, baselineArticleIds: [1] });

    mocked.readFile.mockRejectedValue(fileError('EACCES'));
    await expect(markSemanticRegressionArticles({ userId: 7 }))
      .rejects.toMatchObject({ code: 'EACCES' });
  });

  it('refreshes topic, fallback, and standalone trace paths from authoritative lookups', async () => {
    await resetSemanticRegressionTrace({
      userId: 7,
      incrementalArticleIds: [1, 2, 3]
    });
    mocked.readFile.mockResolvedValue(mocked.writeFile.mock.calls.at(-1)[1]);
    mocked.Article.findAll.mockResolvedValue([
      {
        id: 1,
        topicId: 10,
        title: 'Topic island',
        get: vi.fn()
      },
      {
        id: 2,
        eventId: 20,
        title: 'Fallback island',
        interestScore: 1,
        articleVector: [0, 1],
        get: vi.fn(field => field === 'event' ? { id: 20, name: 'Event Twenty' } : null)
      },
      {
        id: 3,
        topicId: 11,
        title: 'Topic only',
        get: vi.fn()
      }
    ]);
    mocked.Event.findAll.mockResolvedValue([{ id: 20, articleCount: 1 }]);
    mocked.Topic.findAll.mockResolvedValue([
      { id: 10, name: 'Topic Ten' },
      { id: 11, name: 'Topic Eleven' }
    ]);
    mocked.Island.findAll.mockResolvedValue([
      { id: 30, label: 'Island Thirty', weight: 1, islandVector: [0, 1] }
    ]);
    mocked.IslandTopic.findAll.mockResolvedValue([
      { id: 1, islandId: 30, topicId: 10, similarity: 0.95 }
    ]);

    const trace = await refreshSemanticRegressionTrace({
      userId: 7,
      phase: 'unit-test'
    });

    expect(trace.articles['1'].semanticPath).toBe('A→T→I');
    expect(trace.articles['2'].semanticPath).toBe('A→E→I (fallback)');
    expect(trace.articles['3'].semanticPath).toBe('A→T');
    expect(trace.articles['2'].eventDecision).toBe('new-event');
    expect(trace.articles['1'].topicDecision).toBe('new-topic');
  });

  it('skips invalid refreshes and traces belonging to another user', async () => {
    await expect(refreshSemanticRegressionTrace({ userId: null })).resolves.toBeNull();

    mocked.readFile.mockResolvedValue(JSON.stringify({ userId: 8, articles: {} }));
    await expect(printSemanticRegressionTrace({ userId: 7 })).resolves.toEqual([]);
  });
});

describe('database reset helper', () => {
  it('does not inspect or reset the database outside MySQL', async () => {
    mocked.sequelize.getDialect.mockReturnValue('sqlite');

    await expect(resetDatabase()).resolves.toBeUndefined();

    expect(mocked.sequelize.getDatabaseName).not.toHaveBeenCalled();
    expect(mocked.sequelize.connectionManager.getConnection).not.toHaveBeenCalled();
    expect(mocked.sequelize.sync).not.toHaveBeenCalled();
  });

  it('refuses to reset any database except the dedicated test database', async () => {
    mocked.sequelize.getDatabaseName.mockReturnValue('rssmonster');

    await expect(resetDatabase()).rejects.toThrow(
      'Tests must use "rssmonstertest"'
    );
    expect(mocked.sequelize.connectionManager.getConnection).not.toHaveBeenCalled();
  });

  it('drops test tables with foreign keys disabled and always releases the connection', async () => {
    const connection = {
      query: vi.fn((sql, _values, callback) => {
        callback(null, sql.includes('INFORMATION_SCHEMA')
          ? [{ tableName: 'Articles' }, { tableName: 'Feeds' }]
          : []);
      })
    };
    mocked.sequelize.getDatabaseName.mockReturnValue('rssmonstertest');
    mocked.sequelize.getQueryInterface.mockReturnValue({
      quoteIdentifier: vi.fn(name => `\`${name}\``)
    });
    mocked.sequelize.connectionManager.getConnection.mockResolvedValue(connection);
    mocked.sequelize.connectionManager.releaseConnection.mockResolvedValue(undefined);
    mocked.sequelize.sync.mockResolvedValue(undefined);

    await resetDatabase();

    expect(connection.query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS `Articles`, `Feeds`;',
      [],
      expect.any(Function)
    );
    expect(mocked.sequelize.connectionManager.releaseConnection).toHaveBeenCalledWith(connection);
    expect(mocked.sequelize.sync).toHaveBeenCalledOnce();
  });

  it('restores foreign-key checks and releases the connection after a drop failure', async () => {
    const dropError = new Error('drop failed');
    const connection = {
      query: vi.fn((sql, _values, callback) => {
        if (sql.includes('INFORMATION_SCHEMA')) {
          callback(null, [{ tableName: 'Articles' }]);
          return;
        }
        if (sql.startsWith('DROP TABLE')) {
          callback(dropError);
          return;
        }
        callback(null, []);
      })
    };
    mocked.sequelize.getDatabaseName.mockReturnValue('rssmonstertest');
    mocked.sequelize.getQueryInterface.mockReturnValue({
      quoteIdentifier: vi.fn(name => `\`${name}\``)
    });
    mocked.sequelize.connectionManager.getConnection.mockResolvedValue(connection);

    await expect(resetDatabase()).rejects.toThrow('drop failed');

    expect(connection.query).toHaveBeenCalledWith(
      'SET FOREIGN_KEY_CHECKS = 1;',
      [],
      expect.any(Function)
    );
    expect(mocked.sequelize.connectionManager.releaseConnection).toHaveBeenCalledWith(connection);
    expect(mocked.sequelize.sync).not.toHaveBeenCalled();
  });
});
