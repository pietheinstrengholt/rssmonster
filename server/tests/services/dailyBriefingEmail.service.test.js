import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  briefingPreferenceFindOne: vi.fn(),
  enqueueEmail: vi.fn(),
  extractBriefingExcerpt: vi.fn(),
  searchArticles: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: { findAll: mocked.articleFindAll },
    BriefingPreference: { findOne: mocked.briefingPreferenceFindOne },
    Feed: {}
  }
}));

vi.mock('../../services/articleSearch/articleSearch.service.js', () => ({
  searchArticles: mocked.searchArticles
}));

vi.mock('../../services/dailyBriefing/dailyBriefing.service.js', () => ({
  extractBriefingExcerpt: mocked.extractBriefingExcerpt
}));

vi.mock('../../services/email/emailService.js', () => ({
  enqueueEmail: mocked.enqueueEmail
}));

import {
  enqueueDailyBriefingEmail,
  selectDailyBriefingEmailArticles
} from '../../services/dailyBriefing/dailyBriefingEmail.service.js';

const configuration = {
  enabled: true,
  publicAppUrl: 'https://rss.example.com'
};

const article = id => ({
  id,
  url: `https://news.example.com/articles/${id}`,
  title: `Headline ${id}`,
  contentText: `Content ${id}`,
  publishedAt: new Date(`2026-09-${String((id % 28) + 1).padStart(2, '0')}T08:00:00.000Z`),
  Feed: { feedName: `Source ${id}` }
});

describe('daily briefing email presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.briefingPreferenceFindOne.mockResolvedValue({
      includeDevelopingEvents: true,
      emailDigestEnabled: true,
      emailDigestSkipWhenEmpty: true,
      emailDigestTimezone: 'Europe/Amsterdam'
    });
    mocked.extractBriefingExcerpt.mockImplementation((_content, title) => `Excerpt for ${title}`);
  });

  it('selects at most ten articles per section and removes cross-section duplicates', async () => {
    mocked.searchArticles
      .mockResolvedValueOnce({ itemIds: Array.from({ length: 12 }, (_, index) => index + 1) })
      .mockResolvedValueOnce({ itemIds: [
        ...Array.from({ length: 10 }, (_, index) => index + 1),
        ...Array.from({ length: 12 }, (_, index) => index + 13)
      ] });
    mocked.articleFindAll.mockResolvedValue(
      Array.from({ length: 24 }, (_, index) => article(index + 1))
    );

    const result = await selectDailyBriefingEmailArticles(42);

    expect(mocked.searchArticles).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: 42,
      status: 'briefing',
      briefingSort: 'recommended',
      includeDevelopingEvents: true,
      persistSettings: false,
      executionBounds: { maxResults: 20, maxCandidates: 500 }
    }));
    expect(mocked.searchArticles).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userId: 42,
      status: 'briefing',
      briefingSort: 'topStories'
    }));
    expect(result.recommended.map(item => item.articleId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.topStories.map(item => item.articleId)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(result.recommended[0]).toMatchObject({
      url: 'https://news.example.com/articles/1',
      headline: 'Headline 1',
      excerpt: 'Excerpt for Headline 1',
      source: 'Source 1',
      publishedAt: '2026-09-02T08:00:00.000Z'
    });
    expect(mocked.articleFindAll.mock.calls[0][0].where.userId).toBe(42);
  });

  it('does not enqueue an empty scheduled digest when skip-when-empty is enabled', async () => {
    const result = await enqueueDailyBriefingEmail({
      id: 7,
      email: 'reader@example.com',
      emailVerifiedAt: new Date()
    }, {
      configuration,
      selectArticles: vi.fn().mockResolvedValue({ recommended: [], topStories: [] }),
      enqueue: mocked.enqueueEmail
    });

    expect(result).toEqual({ queued: false, skipped: 'empty', articleCount: 0 });
    expect(mocked.enqueueEmail).not.toHaveBeenCalled();
  });

  it('queues the selected presentation data for a populated digest', async () => {
    mocked.enqueueEmail.mockResolvedValue({ created: true });
    const sections = {
      recommended: [{
        articleId: 1,
        url: 'https://news.example.com/articles/1',
        headline: 'Recommended headline',
        excerpt: 'Recommended excerpt',
        source: 'Recommended source',
        publishedAt: '2026-09-04T06:00:00.000Z'
      }],
      topStories: [{
        articleId: 2,
        url: 'https://news.example.com/articles/2',
        headline: 'Top headline',
        excerpt: 'Top excerpt',
        source: 'Top source',
        publishedAt: '2026-09-04T07:00:00.000Z'
      }]
    };

    const result = await enqueueDailyBriefingEmail({
      id: 7,
      email: 'reader@example.com',
      emailVerifiedAt: new Date()
    }, {
      now: new Date('2026-09-04T08:00:00.000Z'),
      configuration,
      selectArticles: vi.fn().mockResolvedValue(sections),
      enqueue: mocked.enqueueEmail
    });

    expect(result).toEqual({ queued: true, articleCount: 2 });
    expect(mocked.enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateType: 'daily_digest',
      templateData: expect.objectContaining(sections)
    }));
  });

  it('does not select or enqueue a scheduled digest when delivery is disabled', async () => {
    mocked.briefingPreferenceFindOne.mockResolvedValue({
      emailDigestEnabled: false,
      emailDigestSkipWhenEmpty: false,
      emailDigestTimezone: 'UTC'
    });
    const selectArticles = vi.fn();
    const result = await enqueueDailyBriefingEmail({
      id: 7,
      email: 'reader@example.com',
      emailVerifiedAt: new Date()
    }, {
      configuration,
      selectArticles,
      enqueue: mocked.enqueueEmail
    });

    expect(result).toEqual({ queued: false, skipped: 'disabled', articleCount: 0 });
    expect(selectArticles).not.toHaveBeenCalled();
    expect(mocked.enqueueEmail).not.toHaveBeenCalled();
  });

  it('queues the explicit empty-state message when skip-when-empty is disabled', async () => {
    mocked.briefingPreferenceFindOne.mockResolvedValue({
      emailDigestEnabled: true,
      emailDigestSkipWhenEmpty: false,
      emailDigestTimezone: 'UTC'
    });
    mocked.enqueueEmail.mockResolvedValue({ created: true });
    const now = new Date('2026-09-04T08:00:00.000Z');
    const result = await enqueueDailyBriefingEmail({
      id: 8,
      email: 'reader@example.com',
      emailVerifiedAt: new Date()
    }, {
      now,
      configuration,
      selectArticles: vi.fn().mockResolvedValue({ recommended: [], topStories: [] }),
      enqueue: mocked.enqueueEmail
    });

    expect(result).toEqual({ queued: true, articleCount: 0 });
    expect(mocked.enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId: 8,
      recipient: 'reader@example.com',
      templateType: 'daily_digest',
      dedupeKey: 'daily-digest:8:2026-09-04',
      templateData: expect.objectContaining({
        recommended: [],
        topStories: [],
        briefingUrl: 'https://rss.example.com',
        preferencesUrl: 'https://rss.example.com',
        timezone: 'UTC'
      })
    }));
  });
});
