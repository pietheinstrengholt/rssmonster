import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  actionFindAll: vi.fn(),
  hotlinkCount: vi.fn(),
  extractEntryFields: vi.fn(),
  findExistingArticle: vi.fn(),
  processMedia: vi.fn(),
  processHtmlContent: vi.fn(),
  applyActions: vi.fn(),
  analyzeArticleContent: vi.fn(),
  saveArticle: vi.fn(),
  normalizeUrl: vi.fn(value => value),
  decodeHtmlEntities: vi.fn(value => value),
  extractLeadImage: vi.fn()
}));

vi.mock('../models/index.js', () => ({
  default: {
    Action: {
      findAll: mocked.actionFindAll
    },
    Hotlink: {
      count: mocked.hotlinkCount
    }
  }
}));

vi.mock('../services/crawl/extractEntryFields.js', () => ({
  default: mocked.extractEntryFields
}));

vi.mock('../services/crawl/findExistingArticle.js', () => ({
  default: mocked.findExistingArticle
}));

vi.mock('../services/crawl/processMedia.js', () => ({
  default: mocked.processMedia
}));

vi.mock('../services/crawl/processHtmlContent.js', () => ({
  default: mocked.processHtmlContent
}));

vi.mock('../services/crawl/applyActions.js', () => ({
  default: mocked.applyActions
}));

vi.mock('../services/crawl/analyzeArticleContent.js', () => ({
  default: mocked.analyzeArticleContent
}));

vi.mock('../services/crawl/saveArticle.js', () => ({
  default: mocked.saveArticle
}));

vi.mock('../utils/normalizeUrl.js', () => ({
  default: mocked.normalizeUrl
}));

vi.mock('../utils/decodeHtmlEntities.js', () => ({
  default: mocked.decodeHtmlEntities
}));

vi.mock('../utils/extractLeadImage.js', () => ({
  default: mocked.extractLeadImage
}));

describe('processArticle AI analysis controls', () => {
  beforeEach(() => {
    Object.values(mocked).forEach(mock => {
      if (typeof mock?.mockReset === 'function') {
        mock.mockReset();
      }
    });

    mocked.normalizeUrl.mockImplementation(value => value);
    mocked.decodeHtmlEntities.mockImplementation(value => value);
    mocked.extractEntryFields.mockReturnValue({
      title: 'Article title',
      link: 'https://example.com/article',
      content: '<p>Article body</p>',
      description: 'Article description',
      categories: ['AI'],
      published: new Date('2026-07-01T00:00:00Z')
    });
    mocked.findExistingArticle.mockResolvedValue(null);
    mocked.processMedia.mockReturnValue({});
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Article body</p>',
      stripped: 'Article body with enough text to save.',
      language: 'en',
      contentHash: 'content-hash',
      title: 'Article title'
    });
    mocked.applyActions.mockReturnValue({
      shouldDelete: false,
      status: 'unread',
      favoriteInd: false,
      clickedAmount: 0,
      hotInd: false,
      tags: [],
      advertisementScore: null,
      qualityScore: null
    });
    mocked.saveArticle.mockResolvedValue({ id: 1 });
  });

  it('skips OpenAI analysis when the feed disables AI analysis', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'No AI feed',
        applyAiAnalysis: false
      },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      {
        summary: null,
        contentSummaryBullets: [],
        tags: [],
        advertisementScore: 70,
        sentimentScore: 70,
        qualityScore: 70
      },
      expect.any(Object)
    );
    expect(result).toEqual({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });
  });
});
