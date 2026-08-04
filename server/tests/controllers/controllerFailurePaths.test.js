import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '../../models/index.js';
import articleController from '../../controllers/article.js';
import errorController from '../../controllers/error.js';
import feedController from '../../controllers/feed.js';
import greaderController from '../../controllers/greader.js';
import managerController from '../../controllers/manager.js';
import settingController, { getTopicsOverview } from '../../controllers/setting.js';

// Builds the chainable response surface shared by controller failure paths.
const createResponse = () => {
  const res = {
    json: vi.fn(),
    send: vi.fn(),
    setHeader: vi.fn(),
    status: vi.fn(),
    type: vi.fn()
  };
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  return res;
};

// Builds a request whose authentication state fails at the controller boundary.
const createBrokenRequest = (property, overrides = {}) => {
  const request = {
    body: {},
    file: { buffer: Buffer.from('<opml />') },
    params: { articleId: '1' },
    query: { output: 'json' },
    ...overrides
  };

  Object.defineProperty(request, property, {
    get() {
      throw new Error('Authentication state unavailable');
    }
  });

  return request;
};

describe('article controller failure paths', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies every authenticated article operation converts dependency failures to stable responses.
  it.each([
    ['getArticles', articleController.getArticles],
    ['getDuplicateArticles', articleController.getDuplicateArticles],
    ['getArticle', articleController.getArticle],
    ['markAsRead', articleController.markAsRead],
    ['markClicked', articleController.markClicked],
    ['markNotInterested', articleController.markNotInterested],
    ['markMoreLikeThis', articleController.markMoreLikeThis],
    ['articleDetails', articleController.articleDetails],
    ['articleMarkAsSeen', articleController.articleMarkAsSeen],
    ['articleMarkToUnread', articleController.articleMarkToUnread],
    ['articleMarkAsFavorite', articleController.articleMarkAsFavorite]
  ])('%s handles unavailable authentication state', async (_name, handler) => {
    const res = createResponse();

    await handler(createBrokenRequest('userData'), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('handles Daily Briefing preference lookup failures', async () => {
    vi.spyOn(db.BriefingPreference, 'findOne').mockRejectedValue(new Error('database unavailable'));
    const res = createResponse();

    await articleController.getDailyBriefing({ userData: { userId: 1 }, query: {} }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unable to load Daily Briefing' });
  });

  it('validates feedback identifiers and reports missing clicked articles', async () => {
    const request = { userData: { userId: 1 }, body: {}, params: {} };

    // Exercises feedback validation before any article mutation can occur.
    for (const handler of [articleController.markNotInterested, articleController.markMoreLikeThis]) {
      const res = createResponse();
      await handler(request, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    }

    const missingSingleRes = createResponse();
    await articleController.markClicked(
      { userData: { userId: 1 }, body: {}, params: { articleId: '2147483647' } },
      missingSingleRes,
      vi.fn()
    );
    expect(missingSingleRes.status).toHaveBeenCalledWith(404);

    const missingBatchRes = createResponse();
    await articleController.markClicked(
      { userData: { userId: 1 }, body: { articleIds: [2147483647] }, params: {} },
      missingBatchRes,
      vi.fn()
    );
    expect(missingBatchRes.status).toHaveBeenCalledWith(404);
  });
});

describe('Google Reader controller failure paths', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies Reader handlers consistently hide authentication-state failures.
  it.each([
    ['getToken', greaderController.getToken],
    ['getUserInfo', greaderController.getUserInfo],
    ['getTagList', greaderController.getTagList],
    ['getSubscriptionList', greaderController.getSubscriptionList],
    ['editSubscription', greaderController.editSubscription],
    ['quickAddSubscription', greaderController.quickAddSubscription],
    ['getUnreadCount', greaderController.getUnreadCount],
    ['getStreamContents', greaderController.getStreamContents],
    ['getStreamItemIds', greaderController.getStreamItemIds],
    ['getStreamItemContents', greaderController.getStreamItemContents],
    ['editTag', greaderController.editTag],
    ['markAllAsRead', greaderController.markAllAsRead],
    ['renameTag', greaderController.renameTag],
    ['disableTag', greaderController.disableTag],
    ['importSubscriptions', greaderController.importSubscriptions],
    ['exportSubscriptions', greaderController.exportSubscriptions]
  ])('%s returns the Reader internal-error response', async (_name, handler) => {
    const res = createResponse();

    await handler(createBrokenRequest('greaderUser'), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Internal Server Error');
  });

  it('handles ClientLogin database failures without exposing details', async () => {
    vi.spyOn(db.User, 'findOne').mockRejectedValue(new Error('database unavailable'));
    const res = createResponse();

    await greaderController.clientLogin({
      body: { Email: 'reader@example.test', Passwd: 'secret' },
      query: {}
    }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Internal Server Error');
  });

  it('rejects unsupported non-JSON discovery responses', async () => {
    const request = {
      greaderUser: { id: 1 },
      query: { output: 'xml' }
    };

    // Calls the three discovery handlers that explicitly require Reader JSON output.
    for (const handler of [
      greaderController.getTagList,
      greaderController.getSubscriptionList,
      greaderController.getUnreadCount
    ]) {
      const res = createResponse();
      await handler(request, res);
      expect(res.status).toHaveBeenCalledWith(501);
    }
  });

  it('validates Reader subscription mutations and safely decodes malformed feed references', async () => {
    const missingRes = createResponse();
    await greaderController.editSubscription(
      { greaderUser: { id: 1 }, body: {}, query: {} },
      missingRes
    );
    expect(missingRes.status).toHaveBeenCalledWith(400);

    const invalidRes = createResponse();
    await greaderController.editSubscription(
      { greaderUser: { id: 1 }, body: { s: 'feed/1', ac: 'invalid' }, query: {} },
      invalidRes
    );
    expect(invalidRes.status).toHaveBeenCalledWith(400);

    const malformedRes = createResponse();
    await greaderController.editSubscription(
      { greaderUser: { id: 1 }, body: { s: 'feed/%E0%A4%A', ac: 'unsubscribe' }, query: {} },
      malformedRes
    );
    expect(malformedRes.send).toHaveBeenCalledWith('OK');

    const emptyFeedRes = createResponse();
    await greaderController.editSubscription(
      { greaderUser: { id: 1 }, body: { s: 'feed/', ac: 'unsubscribe' }, query: {} },
      emptyFeedRes
    );
    expect(emptyFeedRes.send).toHaveBeenCalledWith('OK');

    const missingFeedRes = createResponse();
    await greaderController.editSubscription(
      { greaderUser: { id: 1 }, body: { s: 'feed/2147483647', ac: 'edit' }, query: {} },
      missingFeedRes
    );
    expect(missingFeedRes.status).toHaveBeenCalledWith(400);

    const quickAddRes = createResponse();
    await greaderController.quickAddSubscription(
      { greaderUser: { id: 1 }, body: {}, query: {} },
      quickAddRes
    );
    expect(quickAddRes.status).toHaveBeenCalledWith(400);

    const emptyItemsRes = createResponse();
    await greaderController.getStreamItemContents(
      { greaderUser: { id: 1 }, body: {}, query: {} },
      emptyItemsRes
    );
    expect(emptyItemsRes.json).toHaveBeenCalledWith({ items: [] });
  });

  it('returns Reader state tags and category labels', async () => {
    vi.spyOn(db.Category, 'findAll').mockResolvedValue([{ name: 'Technology' }]);
    const res = createResponse();

    await greaderController.getTagList(
      { greaderUser: { id: 1 }, query: { output: 'json' } },
      res
    );

    expect(res.json).toHaveBeenCalledWith({
      tags: expect.arrayContaining([
        { id: 'user/-/label/Technology', type: 'folder' }
      ])
    });
  });
});

describe('feed controller failure paths', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies feed operations expose dependency failures through their HTTP error contract.
  it.each([
    ['getFeeds', feedController.getFeeds],
    ['getFeed', feedController.getFeed],
    ['updateFeed', feedController.updateFeed],
    ['newFeed', feedController.newFeed],
    ['deleteFeed', feedController.deleteFeed],
    ['validateFeed', feedController.validateFeed],
    ['rediscoverFeedRss', feedController.rediscoverFeedRss],
    ['muteFeed', feedController.muteFeed],
    ['startRefresh', feedController.startRefresh],
    ['recalculateFeedTrust', feedController.recalculateFeedTrust]
  ])('%s handles unavailable authentication state', async (_name, handler) => {
    const res = createResponse();

    await handler(createBrokenRequest('userData'), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('enforces feed authorization and validation before dependencies run', async () => {
    const unauthorizedHandlers = [
      feedController.getFeed,
      feedController.updateFeed,
      feedController.newFeed,
      feedController.deleteFeed,
      feedController.validateFeed
    ];

    // Calls each handler without a user id to exercise its controller-level ownership guard.
    for (const handler of unauthorizedHandlers) {
      const res = createResponse();
      await handler({ userData: {}, body: {}, params: {} }, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    }

    const missingCategoryRes = createResponse();
    await feedController.validateFeed(
      { userData: { userId: 1 }, body: {} },
      missingCategoryRes,
      vi.fn()
    );
    expect(missingCategoryRes.status).toHaveBeenCalledWith(400);
  });

  it('rejects malformed feed update controls and reports missing feeds', async () => {
    const feed = {
      applyAiAnalysis: false,
      feedDesc: '',
      feedName: 'Existing feed',
      feedTags: [],
      generateEmbeddings: false,
      status: 'active',
      updateIntervalMinutes: 60
    };
    vi.spyOn(db.Feed, 'findOne')
      .mockResolvedValueOnce(feed)
      .mockResolvedValueOnce(feed)
      .mockResolvedValueOnce(null);

    const invalidIntervalRes = createResponse();
    await feedController.updateFeed({
      userData: { userId: 1 },
      params: { feedId: '1' },
      body: { updateIntervalMinutes: 17 }
    }, invalidIntervalRes, vi.fn());
    expect(invalidIntervalRes.status).toHaveBeenCalledWith(400);

    const invalidBooleanRes = createResponse();
    await feedController.updateFeed({
      userData: { userId: 1 },
      params: { feedId: '1' },
      body: { generateEmbeddings: 'yes' }
    }, invalidBooleanRes, vi.fn());
    expect(invalidBooleanRes.status).toHaveBeenCalledWith(400);

    const missingFeedRes = createResponse();
    await feedController.getFeed({
      userData: { userId: 1 },
      params: { feedId: '404' }
    }, missingFeedRes, vi.fn());
    expect(missingFeedRes.status).toHaveBeenCalledWith(404);
  });
});

describe('error controller', () => {
  it('returns the stable not-found payload', () => {
    const res = createResponse();

    errorController.get404({}, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'page not found!' });
  });
});

describe('settings controller failure paths', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies settings endpoints retain their documented failure status codes.
  it.each([
    ['getCrawlStatistics', settingController.getCrawlStatistics, 500],
    ['getOfficialSources', settingController.getOfficialSources, 500],
    ['setOfficialSources', settingController.setOfficialSources, 500],
    ['getSettings', settingController.getSettings, 500],
    ['setSettings', settingController.setSettings, 400],
    ['setIncludeDevelopingEvents', settingController.setIncludeDevelopingEvents, 500],
    ['setThemeMode', settingController.setThemeMode, 500],
    ['setStartupViewMode', settingController.setStartupViewMode, 500],
    ['setMarkAsReadOnScroll', settingController.setMarkAsReadOnScroll, 500],
    ['getIslandsOverview', settingController.getIslandsOverview, 500],
    ['getTopicsOverview', getTopicsOverview, 500]
  ])('%s handles unavailable authentication state', async (_name, handler, status) => {
    const res = createResponse();

    await handler(createBrokenRequest('userData'), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(status);
  });
});

describe('manager controller failure paths', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies overview query failures return stable manager responses.
  it.each([
    ['getOverviewLite', managerController.getOverviewLite],
    ['getOverviewCounts', managerController.getOverviewCounts],
    ['getOverview', managerController.getOverview]
  ])('%s handles category query failures', async (_name, handler) => {
    vi.spyOn(db.Category, 'findAll').mockRejectedValue(new Error('database unavailable'));
    const res = createResponse();

    await handler({ userData: { userId: 1 }, body: {} }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
