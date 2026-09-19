import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({
  actionBulkCreate: vi.fn(),
  actionDestroy: vi.fn(),
  actionFindAll: vi.fn(),
  transaction: vi.fn(),
  prepareArticleEventRemoval: vi.fn(),
  articleDestroy: vi.fn(),
  articleFindAll: vi.fn(),
  articleLiteral: vi.fn(sql => ({ sql })),
  briefingPreferenceFindOne: vi.fn(),
  eventFindAll: vi.fn(),
  eventFindOne: vi.fn(),
  tagFindAll: vi.fn(),
  settingFindOne: vi.fn()
}));

vi.mock('../../services/events/eventReconciliation.js', () => ({
  prepareArticleEventRemoval: mocked.prepareArticleEventRemoval
}));

vi.mock('../../models/index.js', () => ({
  default: {
    sequelize: { transaction: mocked.transaction },
    Action: {
      bulkCreate: mocked.actionBulkCreate,
      destroy: mocked.actionDestroy,
      findAll: mocked.actionFindAll
    },
    Article: {
      destroy: mocked.articleDestroy,
      findAll: mocked.articleFindAll,
      sequelize: {
        literal: mocked.articleLiteral
      }
    },
    BriefingPreference: {
      findOne: mocked.briefingPreferenceFindOne
    },
    Event: {
      findAll: mocked.eventFindAll,
      findOne: mocked.eventFindOne
    },
    Feed: {},
    Setting: {
      findOne: mocked.settingFindOne
    },
    Tag: {
      findAll: mocked.tagFindAll
    }
  }
}));

const actionController = (await import('../../controllers/action.js')).default;
const eventsController = (await import('../../controllers/events.js')).default;
const tagController = (await import('../../controllers/tag.js')).default;

// Builds the minimal chainable response contract used by controller handlers.
const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

// Builds an authenticated controller request with overridable request fields.
const createRequest = (overrides = {}) => ({
  userData: { userId: 42 },
  body: {},
  ...overrides
});

// Resets controller dependencies so every test owns its database behavior.
const resetControllerMocks = () => {
  Object.values(mocked).forEach(mock => mock.mockReset());
};

describe('action controller', () => {
  beforeEach(() => {
    resetControllerMocks();
    mocked.transaction.mockImplementation(callback => callback({ id: 'action-transaction' }));
  });

  it('returns only actions owned by the authenticated user', async () => {
    const actions = [{ id: 1, name: 'Mute advertisements' }];
    mocked.actionFindAll.mockResolvedValue(actions);
    const res = createResponse();

    await actionController.getActions(createRequest(), res, vi.fn());

    expect(mocked.actionFindAll).toHaveBeenCalledWith({
      where: { userId: 42 },
      order: [['createdAt', 'DESC']]
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ total: 1, actions });
  });

  it('rejects action reads without a user ID', async () => {
    const res = createResponse();

    await actionController.getActions(
      createRequest({ userData: {} }),
      res,
      vi.fn()
    );

    expect(mocked.actionFindAll).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('replaces owned actions in one transaction while applying defaults', async () => {
    const created = [{ id: 7, name: 'Tag security' }];
    mocked.actionDestroy.mockResolvedValue(2);
    mocked.actionBulkCreate.mockResolvedValue(created);
    const res = createResponse();

    await actionController.createAction(
      createRequest({
        body: {
          actions: [
            {
              name: 'Tag security',
              userId: 99,
              actionType: 'tag',
              regularExpression: 'security'
            },
            {
              actionType: 'discard',
              tagValue: 'ignored'
            }
          ]
        }
      }),
      res,
      vi.fn()
    );

    expect(mocked.actionDestroy).toHaveBeenCalledWith({
      where: { userId: 42 },
      transaction: { id: 'action-transaction' }
    });
    expect(mocked.actionBulkCreate).toHaveBeenCalledWith([
      {
        userId: 42,
        name: 'Tag security',
        actionType: 'tag',
        regularExpression: 'security',
        tagValue: null
      },
      {
        userId: 42,
        name: '',
        actionType: 'discard',
        regularExpression: '',
        tagValue: 'ignored'
      }
    ], { transaction: { id: 'action-transaction' } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ total: 1, actions: created });
  });

  it('clears actions without bulk inserting when the payload is empty', async () => {
    mocked.actionDestroy.mockResolvedValue(1);
    const res = createResponse();

    await actionController.createAction(
      createRequest({ body: { actions: [] } }),
      res,
      vi.fn()
    );

    expect(mocked.actionBulkCreate).not.toHaveBeenCalled();
    expect(mocked.actionDestroy).toHaveBeenCalledWith({
      where: { userId: 42 },
      transaction: { id: 'action-transaction' }
    });
    expect(res.json).toHaveBeenCalledWith({ total: 0, actions: [] });
  });

  it.each([
    undefined, null, 'invalid', {}, [null], [{}], [[]], ['invalid'],
    [{ name: 123 }], [{ name: 'Rule', regularExpression: {} }],
    [{ name: 'Rule', actionType: false }], [{ name: 'Rule', tagValue: [] }],
    [{ name: 'x'.repeat(256) }],
    [{ name: 'Valid' }, { name: 'Invalid', tagValue: 'x'.repeat(256) }]
  ].map(actions => [actions]))('rejects malformed actions without changing saved rules: %j', async actions => {
    const res = createResponse();
    const next = vi.fn();

    await actionController.createAction(createRequest({ body: { actions } }), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocked.transaction).not.toHaveBeenCalled();
    expect(mocked.actionDestroy).not.toHaveBeenCalled();
    expect(mocked.actionBulkCreate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['[', '/[/i', '/keyword/z', '/keyword/ii'])('rejects invalid expression %s before replacing any rules', async regularExpression => {
    const res = createResponse();
    await actionController.createAction(createRequest({ body: { actions: [
      { name: 'Valid', actionType: 'read', regularExpression: 'valid' },
      { name: 'Invalid', actionType: 'read', regularExpression }
    ] } }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Action 2: invalid regular expression or flags. Use a plain pattern or /pattern/flags.'
    });
    expect(mocked.transaction).not.toHaveBeenCalled();
    expect(mocked.actionDestroy).not.toHaveBeenCalled();
    expect(mocked.actionBulkCreate).not.toHaveBeenCalled();
  });

  it.each(['keyword|phrase', '/keyword|phrase/i', '/releases/version-2$'])('saves valid expression %s unchanged', async regularExpression => {
    mocked.actionBulkCreate.mockResolvedValue([]);
    const res = createResponse();
    await actionController.createAction(createRequest({ body: { actions: [
      { name: 'Match', actionType: 'read', regularExpression }
    ] } }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mocked.actionBulkCreate.mock.calls[0][0][0].regularExpression).toBe(regularExpression);
  });

  it('propagates failed replacement inserts through the transaction without reporting success', async () => {
    const error = new Error('insert failed');
    mocked.actionBulkCreate.mockRejectedValue(error);
    const res = createResponse();
    const next = vi.fn();

    await actionController.createAction(
      createRequest({ body: { actions: [{ name: 'Rule', actionType: 'read' }] } }),
      res,
      next
    );

    await expect(mocked.transaction.mock.results[0].value).rejects.toBe(error);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects action replacement without a user ID', async () => {
    const res = createResponse();

    await actionController.createAction(
      createRequest({ userData: {} }),
      res,
      vi.fn()
    );

    expect(mocked.actionDestroy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('passes action replacement errors to Express error handling', async () => {
    const error = new Error('replacement failed');
    mocked.actionDestroy.mockRejectedValue(error);
    const next = vi.fn();

    await actionController.createAction(
      createRequest({ body: { actions: [] } }),
      createResponse(),
      next
    );

    expect(next).toHaveBeenCalledWith(error);
  });

  it('passes action persistence errors to Express error handling', async () => {
    const error = new Error('database unavailable');
    mocked.actionFindAll.mockRejectedValue(error);
    const next = vi.fn();

    await actionController.getActions(createRequest(), createResponse(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('tag controllers', () => {
  beforeEach(() => {
    resetControllerMocks();
  });

  it('returns unread tags grouped by name for the authenticated user', async () => {
    const tags = [{ name: 'security', count: 4 }];
    mocked.articleFindAll.mockResolvedValue(tags);
    const res = createResponse();

    await tagController.getTags(createRequest({ query: { status: 'unread' } }), res);

    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 42,
        status: 'unread',
        filteredInd: false
      }),
      group: ['tags.name'],
      include: [{
        model: expect.any(Object),
        attributes: [],
        required: true,
        where: { userId: 42 }
      }],
      limit: 10,
      subQuery: false,
      raw: true
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tags });
  });

  it('rejects tag reads without an authenticated user', async () => {
    const res = createResponse();

    await tagController.getTags(
      createRequest({ userData: {} }),
      res
    );

    expect(mocked.articleFindAll).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it.each([
    ['favorite', 'favoriteInd', 1],
    ['hot', 'hotInd', 1],
    ['clicked', 'clickedAmount', { [Op.gt]: 0 }]
  ])('scopes tags to the %s article collection', async (status, field, value) => {
    mocked.articleFindAll.mockResolvedValue([]);
    const res = createResponse();

    await tagController.getTags(createRequest({ query: { status } }), res);

    const query = mocked.articleFindAll.mock.calls[0][0];
    expect(query.where[field]).toEqual(value);
  });

  it('scopes event-grouped tags to standalone and selected event articles', async () => {
    mocked.articleFindAll.mockResolvedValue([]);
    const res = createResponse();

    await tagController.getTags(createRequest({
      query: {
        status: 'unread',
        grouping: 'event',
        includeDevelopingEvents: 'true'
      }
    }), res);

    const articleWhere = mocked.articleFindAll.mock.calls[0][0].where;
    expect(articleWhere[Op.or]).toEqual([
      { eventId: { [Op.is]: null } },
      expect.anything()
    ]);
    expect(articleWhere[Op.or][1].val).toContain(
      'COALESCE(grouped_event.developingArticleId, grouped_event.representativeArticleId)'
    );
    expect(articleWhere[Op.or][1].val).toContain('grouped_event.userId = articles.userId');
  });

  it('scopes tags to the configured Daily Briefing population', async () => {
    mocked.briefingPreferenceFindOne.mockResolvedValue({
      selectionPeriod: '24h',
      includeOnlyUnreadArticles: 1,
      minDistinctSources: 3,
      showOnlyInterestMatchedArticles: 1,
      showOnlyDevelopingEventArticles: 0
    });
    mocked.settingFindOne.mockResolvedValue({
      minAdvertisementScore: 0.2,
      minSentimentScore: 0.3,
      minQualityScore: 0.4
    });
    mocked.articleFindAll.mockResolvedValue([]);
    const res = createResponse();

    await tagController.getTags(createRequest({ query: { status: 'briefing' } }), res);

    expect(mocked.briefingPreferenceFindOne).toHaveBeenCalledWith({
      where: { userId: 42 },
      attributes: [
        'selectionPeriod',
        'includeOnlyUnreadArticles',
        'minDistinctSources',
        'showOnlyInterestMatchedArticles',
        'showOnlyDevelopingEventArticles'
      ],
      raw: true
    });
    const articleWhere = mocked.articleFindAll.mock.calls[0][0].where;
    expect(articleWhere).toMatchObject({
      userId: 42,
      status: 'unread',
      filteredInd: false,
      publishedAt: { [Op.between]: [expect.any(Date), expect.any(Date)] }
    });
    expect(articleWhere[Op.and]).toHaveLength(2);
    expect(articleWhere[Op.and][0][Op.and]).toHaveLength(3);
    expect(articleWhere[Op.and][0][Op.and][0][Op.or][0]).toEqual({
      advertisementScore: { [Op.gte]: 0.2 }
    });
    expect(articleWhere[Op.and][0][Op.and][1][Op.or][0]).toEqual({
      sentimentScore: { [Op.gte]: 0.3 }
    });
    expect(articleWhere[Op.and][0][Op.and][2][Op.or][0]).toEqual({
      qualityScore: { [Op.gte]: 0.4 }
    });
    expect(mocked.articleLiteral).toHaveBeenCalledWith(expect.stringContaining(
      'articles.interestScore <> 0'
    ));
    expect(mocked.articleLiteral).toHaveBeenCalledWith(expect.stringContaining(
      'COUNT(DISTINCT briefing_source_article.feedId)'
    ));
  });

  it('rejects unsupported tag collection statuses', async () => {
    const res = createResponse();

    await tagController.getTags(createRequest({ query: { status: 'archived' } }), res);

    expect(mocked.articleFindAll).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unsupported tag status' });
  });

  it('returns a stable tag error without exposing database details', async () => {
    mocked.articleFindAll.mockRejectedValue(new Error('sensitive database error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createResponse();

    await tagController.getTags(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch tags' });
  });
});

describe('event article controllers', () => {
  beforeEach(() => {
    resetControllerMocks();
  });

  it('validates event article requests before querying', async () => {
    const res = createResponse();

    await eventsController.getEventArticles(createRequest(), res);

    expect(mocked.eventFindOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'eventId is required' });
  });

  it('rejects event article requests without a user ID', async () => {
    const res = createResponse();

    await eventsController.getEventArticles(
      createRequest({ userData: {}, body: { eventId: 8 } }),
      res
    );

    expect(mocked.eventFindOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('does not disclose an event owned by another user', async () => {
    mocked.eventFindOne.mockResolvedValue(null);
    const res = createResponse();

    await eventsController.getEventArticles(
      createRequest({ body: { eventId: 8 } }),
      res
    );

    expect(mocked.eventFindOne).toHaveBeenCalledWith({
      where: { id: 8, userId: 42 }
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Event not found' });
  });

  it('returns canonical event articles and excludes the selected article', async () => {
    const event = { id: 8 };
    const articles = [{ id: 10 }];
    mocked.eventFindOne.mockResolvedValue(event);
    mocked.articleFindAll.mockResolvedValue(articles);
    const res = createResponse();

    await eventsController.getEventArticles(
      createRequest({ body: { eventId: '8', articleId: '9' } }),
      res
    );

    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 8,
        userId: 42,
        duplicateOfArticleId: { [Op.is]: null },
        filteredInd: false,
        id: { [Op.ne]: 9 }
      }),
      order: [['publishedAt', 'DESC']]
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ event, articles });
  });

  it('returns event query errors as server errors', async () => {
    mocked.eventFindOne.mockRejectedValue(new Error('event query failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createResponse();

    await eventsController.getEventArticles(
      createRequest({ body: { eventId: 8 } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'event query failed' });
  });

});
