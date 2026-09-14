import { buildArticleEventEmbeddingText } from '../../services/articles/embedArticle.js';
import { describe, it, expect } from 'vitest';
import { readSemanticFixtureFile as readFile } from '../helpers/semanticBatchFixtures.js';
import { selectDiverseArticles, sanitizeArticle, publicArticleUrl, containsSecret, isRealBackground, sha256, fixtureContent, appendFixtureCollections } from '../../scripts/lib/realIncrementalFixture.js';

describe('real incremental fixture export', () => {
  it('appends without reformatting or replacing existing collection members', () => {
    const before = '{ "categories": [], "feeds": [], "articles": [  { "title" : "Original [brackets]" } ] }';
    const after = appendFixtureCollections(before, { categories: [{ id: 1 }], feeds: [{ id: 2 }], articles: [{ title: 'New' }] });
    expect(after).toContain('{ "title" : "Original [brackets]" }');
    expect(JSON.parse(after).articles).toEqual([{ title: 'Original [brackets]' }, { title: 'New' }]);
  });

  it('selects deterministically regardless of query order and keeps distinct URLs', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: i, feedId: i % 5, url: `https://news.example.org/${i}`,
      title: `Release ${i}`, publishedAt: '2026-09-01T00:00:00Z', language: i % 2 ? 'nld' : 'eng', bodyLength: i * 1000 }));
    expect(selectDiverseArticles(rows, 15)).toEqual(selectDiverseArticles([...rows].reverse(), 15));
    const selected = selectDiverseArticles([...rows, rows[0]], 15);
    expect(new Set(selected.map(a => a.url)).size).toBe(15);
    expect(new Set(selected.map(a => a.feedId)).size).toBe(5);
  });

  it('rejects authenticated/private URLs and secrets and exports only allowed Article fields', () => {
    expect(publicArticleUrl('https://user:password@news.example.org/story')).toBeNull();
    expect(publicArticleUrl('https://news.example.org/story?access_token=private')).toBeNull();
    expect(publicArticleUrl('http://192.168.1.1/story')).toBeNull();
    expect(containsSecret('-----BEGIN PRIVATE KEY-----')).toBe(true);
    const row = { id: 987, userId: 123, eventId: 456, topicId: 789, url: 'https://news.example.org/story',
      title: 'An original headline', description: 'An original description', publishedAt: '2026-09-01T00:00:00Z',
      favoriteInd: 1, negativeInd: 1, clickedAmount: 20, password: 'private', contentOriginal: null };
    const exported = sanitizeArticle(row, 'real-incremental-001', 301);
    expect(exported).toMatchObject({ sourceId: 'real-incremental-001', feedId: 301, contentOriginal: null,
      title: row.title, description: row.description, favoriteInd: 0, negativeInd: 0, clickedAmount: 0 });
    for (const field of ['id', 'userId', 'eventId', 'topicId', 'password']) expect(exported).not.toHaveProperty(field);
    expect(exported.regression).toMatchObject({ originallyEventLinked: true, originallyTopicLinked: true });
  });

  it('freezes exactly 250 real backgrounds alongside the 158 existing inputs', async () => {
    const fixture = JSON.parse(await readFile(new URL('../fixtures/semantic-regression-incremental.json', import.meta.url), 'utf8'));
    const real = fixture.articles.filter(isRealBackground);
    expect(real).toHaveLength(250);
    const frozen = JSON.parse(await readFile(new URL('../fixtures/semantic-regression-incremental.onnx-community--Qwen3-Embedding-0.6B-ONNX.vectors.json', import.meta.url), 'utf8'));
    const cache = new Map(frozen.articles.filter(a => String(a.fixtureSourceId || '').startsWith('real-incremental-')).map(a => [a.fixtureSourceId, a]));
    expect(cache.size).toBe(250);
    expect(fixture.articles.filter(a => !isRealBackground(a) && !String(a.sourceId || '').startsWith('long-'))).toHaveLength(158);
    expect(new Set(fixture.articles.map(a => a.sourceId)).size).toBe(1000);
    expect(new Set(fixture.articles.map(a => a.url)).size).toBe(1000);
    for (const article of real) {
      const vector = cache.get(article.sourceId);
      expect(vector.embeddingInputHash).toBe(sha256(buildArticleEventEmbeddingText(article)));
      expect(vector.contentSourceHash).toBe(sha256(fixtureContent(article)));
      expect(vector.articleVector).toHaveLength(1024);
      expect(vector.articleVector.every(Number.isFinite)).toBe(true);
      expect(fixture.feeds.some(f => f.id === article.feedId)).toBe(true);
      expect(article.favoriteInd + article.negativeInd + article.clickedAmount).toBe(0);
      expect(Number.isFinite(Date.parse(article.publishedAt))).toBe(true);
      expect(article.regression.scenario).toBe('real-background');
    }
    expect(real.some(a => !a.contentOriginal && !a.contentHtml && !a.contentText)).toBe(true);
    expect(real.some(a => a.regression.originallySyndicated)).toBe(true);
  });
});
