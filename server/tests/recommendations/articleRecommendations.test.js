import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { getArticleRecommendations } from '../../services/recommendations/articleRecommendations.js';

// Provides the database models used by recommendation integration tests.
const { Article, Category, Event, Feed, User } = db;

// This function creates an isolated user, category, and feed for recommendation tests.
async function createUserGraph(label = 'recommendations') {
  const suffix = randomUUID();
  const user = await User.create({
    username: `${label}-${suffix}`,
    password: 'hashed-password',
    feverCredentialHash: `${label}-${suffix}-hash`,
    role: 'user'
  });
  const category = await Category.create({
    userId: user.id,
    name: `${label} category`,
    categoryOrder: 1
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: `${label} feed`,
    url: `https://example.com/${suffix}/feed.xml`
  });

  return { suffix, user, feed };
}

// This function creates a vectorized article with deterministic recommendation metadata.
async function createArticle(graph, slug, vector, overrides = {}) {
  return Article.create({
    userId: graph.user.id,
    feedId: graph.feed.id,
    status: 'unread',
    url: `https://example.com/${graph.suffix}/${slug}`,
    title: `Recommendation ${slug}`,
    description: `Description for ${slug}`,
    articleVector: vector,
    embedding_model: 'recommendation-test-model',
    publishedAt: new Date('2026-08-01T12:00:00.000Z'),
    ...overrides
  });
}

// This function creates an event and links the supplied canonical articles to it.
async function linkArticlesToEvent(graph, articles, name) {
  const event = await Event.create({
    userId: graph.user.id,
    representativeArticleId: articles[0].id,
    name,
    articleCount: articles.length
  });
  await Article.update(
    { eventId: event.id },
    { where: { id: articles.map(article => article.id) } }
  );
  return event;
}

describe('getArticleRecommendations', () => {
  it('ranks recent eligible articles, applies exclusions, diversifies events, and returns at most four', async () => {
    const graph = await createUserGraph();
    const foreignGraph = await createUserGraph('foreign-recommendations');
    const source = await createArticle(graph, 'source', [1, 0]);
    const sourceEventCandidate = await createArticle(graph, 'source-event', [1, 0], {
      publishedAt: new Date('2026-08-02T12:00:00.000Z')
    });
    await linkArticlesToEvent(graph, [source, sourceEventCandidate], 'Source event');

    const strongestEventArticle = await createArticle(graph, 'strongest-event', [1, 0], {
      publishedAt: new Date('2026-08-03T12:00:00.000Z')
    });
    const weakerEventArticle = await createArticle(graph, 'weaker-event', [0.99, 0.01], {
      publishedAt: new Date('2026-08-04T12:00:00.000Z')
    });
    await linkArticlesToEvent(
      graph,
      [strongestEventArticle, weakerEventArticle],
      'Diversified event'
    );

    const standaloneArticles = await Promise.all([
      createArticle(graph, 'standalone-1', [0.98, 0.1]),
      createArticle(graph, 'standalone-2', [0.95, 0.2]),
      createArticle(graph, 'standalone-3', [0.9, 0.3]),
      createArticle(graph, 'standalone-4', [0.85, 0.35])
    ]);
    const filtered = await createArticle(graph, 'filtered', [1, 0], { filteredInd: true });
    const duplicate = await createArticle(graph, 'duplicate', [1, 0], {
      duplicateOfArticleId: source.id,
      status: 'duplicate'
    });
    const incompatible = await createArticle(graph, 'incompatible', [1, 0, 0]);
    const malformed = await createArticle(graph, 'malformed', [1, 'invalid']);
    const differentModel = await createArticle(graph, 'different-model', [1, 0], {
      embedding_model: 'different-model'
    });
    const foreign = await createArticle(foreignGraph, 'foreign', [1, 0]);

    const result = await getArticleRecommendations({
      userId: graph.user.id,
      articleId: source.id
    });
    const resultIds = result.articles.map(article => article.id);

    expect(result.articles).toHaveLength(4);
    expect(resultIds[0]).toBe(strongestEventArticle.id);
    expect(resultIds).not.toContain(weakerEventArticle.id);
    expect(resultIds).toEqual([
      strongestEventArticle.id,
      standaloneArticles[0].id,
      standaloneArticles[1].id,
      standaloneArticles[2].id
    ]);
    expect(resultIds).not.toContain(source.id);
    expect(resultIds).not.toContain(sourceEventCandidate.id);
    expect(resultIds).not.toContain(filtered.id);
    expect(resultIds).not.toContain(duplicate.id);
    expect(resultIds).not.toContain(incompatible.id);
    expect(resultIds).not.toContain(malformed.id);
    expect(resultIds).not.toContain(differentModel.id);
    expect(resultIds).not.toContain(foreign.id);
    expect(result.articles.every(article => !('articleVector' in article))).toBe(true);
    expect(result.diagnostics).toMatchObject({
      invalidVectorCount: 2,
      finalRecommendations: result.articles.map(article => ({
        articleId: article.id,
        similarity: article.recommendationSimilarity
      }))
    });
    expect(result.diagnostics.candidateCount).toBeGreaterThan(result.articles.length);
    expect(result.diagnostics.topSimilarities.length).toBeGreaterThan(0);
  });

  it('returns an empty result without querying candidates when the source vector is missing', async () => {
    const graph = await createUserGraph('missing-vector');
    const source = await createArticle(graph, 'source', null, { embedding_model: null });
    await createArticle(graph, 'candidate', [1, 0]);

    const result = await getArticleRecommendations({
      userId: graph.user.id,
      articleId: source.id
    });

    expect(result).toMatchObject({
      sourceArticleId: source.id,
      articles: [],
      diagnostics: { candidateCount: 0 }
    });
  });

  it('returns an empty result and threshold diagnostics when no candidate qualifies', async () => {
    const graph = await createUserGraph('threshold');
    const source = await createArticle(graph, 'source', [1, 0]);
    await createArticle(graph, 'orthogonal', [0, 1]);

    const result = await getArticleRecommendations({
      userId: graph.user.id,
      articleId: source.id,
      minSimilarity: 0.70
    });

    expect(result.articles).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      candidateCount: 1,
      scoredCandidateCount: 1,
      rejectedByThresholdCount: 1,
      finalRecommendations: []
    });
    expect(result.diagnostics.topSimilarities).toEqual([{
      articleId: expect.any(Number),
      similarity: 0,
      accepted: false
    }]);
  });

  it('returns null for inaccessible, filtered, and noncanonical sources', async () => {
    const ownerGraph = await createUserGraph('source-owner');
    const viewerGraph = await createUserGraph('source-viewer');
    const source = await createArticle(ownerGraph, 'source', [1, 0]);
    const filtered = await createArticle(ownerGraph, 'filtered-source', [1, 0], {
      filteredInd: true
    });
    const duplicate = await createArticle(ownerGraph, 'duplicate-source', [1, 0], {
      duplicateOfArticleId: source.id,
      status: 'duplicate'
    });

    await expect(getArticleRecommendations({
      userId: viewerGraph.user.id,
      articleId: source.id
    })).resolves.toBeNull();
    await expect(getArticleRecommendations({
      userId: ownerGraph.user.id,
      articleId: filtered.id
    })).resolves.toBeNull();
    await expect(getArticleRecommendations({
      userId: ownerGraph.user.id,
      articleId: duplicate.id
    })).resolves.toBeNull();
  });
});
