import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({
  actionBulkCreate: vi.fn(),
  actionDestroy: vi.fn(),
  actionFindAll: vi.fn(),
  articleDestroy: vi.fn(),
  articleFindAll: vi.fn(),
  eventFindAll: vi.fn(),
  eventFindOne: vi.fn(),
  tagFindAll: vi.fn(),
  topicFindOne: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Action: {
      bulkCreate: mocked.actionBulkCreate,
      destroy: mocked.actionDestroy,
      findAll: mocked.actionFindAll
    },
    Article: {
      destroy: mocked.articleDestroy,
      findAll: mocked.articleFindAll
    },
    Event: {
      findAll: mocked.eventFindAll,
      findOne: mocked.eventFindOne
    },
    Feed: {},
    Tag: {
      findAll: mocked.tagFindAll
    },
    Topic: {
      findOne: mocked.topicFindOne
    }
  }
}));

const actionController = (await import('../../controllers/action.js')).default;
const cleanupController = (await import('../../controllers/cleanup.js')).default;
const eventsController = (await import('../../controllers/events.js')).default;
const tagController = (await import('../../controllers/tag.js')).default;
const topicsController = (await import('../../controllers/topics.js')).default;

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

  it('replaces actions while filtering empty entries and applying defaults', async () => {
    const created = [{ id: 7, name: 'Tag security' }];
    mocked.actionDestroy.mockResolvedValue(2);
    mocked.actionBulkCreate.mockResolvedValue(created);
    const res = createResponse();

    await actionController.createAction(
      createRequest({
        body: {
          actions: [
            null,
            {},
            {
              name: 'Tag security',
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
      where: { userId: 42 }
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
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ total: 1, actions: created });
  });

  it('clears actions without bulk inserting when the payload is empty', async () => {
    mocked.actionDestroy.mockResolvedValue(1);
    const res = createResponse();

    await actionController.createAction(
      createRequest({ body: { actions: 'invalid' } }),
      res,
      vi.fn()
    );

    expect(mocked.actionBulkCreate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ total: 0, actions: [] });
  });

  it('passes action persistence errors to Express error handling', async () => {
    const error = new Error('database unavailable');
    mocked.actionFindAll.mockRejectedValue(error);
    const next = vi.fn();

    await actionController.getActions(createRequest(), createResponse(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('tag and cleanup controllers', () => {
  beforeEach(() => {
    resetControllerMocks();
  });

  it('returns unread tags grouped by name for the authenticated user', async () => {
    const tags = [{ name: 'security', count: 4 }];
    mocked.tagFindAll.mockResolvedValue(tags);
    const res = createResponse();

    await tagController.getTags(createRequest({ query: { status: 'unread' } }), res);

    expect(mocked.tagFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 42 },
      group: ['tags.name'],
      include: [{
        model: expect.any(Object),
        attributes: [],
        required: true,
        where: expect.objectContaining({
          userId: 42,
          status: 'unread',
          filteredInd: false
        })
      }],
      limit: 10
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tags });
  });

  it.each([
    ['favorite', 'favoriteInd', 1],
    ['hot', 'hotInd', 1],
    ['clicked', 'clickedAmount', { [Op.gt]: 0 }]
  ])('scopes tags to the %s article collection', async (status, field, value) => {
    mocked.tagFindAll.mockResolvedValue([]);
    const res = createResponse();

    await tagController.getTags(createRequest({ query: { status } }), res);

    const query = mocked.tagFindAll.mock.calls[0][0];
    expect(query.include[0].where[field]).toEqual(value);
  });

  it('rejects unsupported tag collection statuses', async () => {
    const res = createResponse();

    await tagController.getTags(createRequest({ query: { status: 'briefing' } }), res);

    expect(mocked.tagFindAll).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unsupported tag status' });
  });

  it('returns a stable tag error without exposing database details', async () => {
    mocked.tagFindAll.mockRejectedValue(new Error('sensitive database error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createResponse();

    await tagController.getTags(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch tags' });
  });

  it('deletes only old non-favorite articles owned by the user', async () => {
    mocked.articleDestroy.mockResolvedValue(3);
    const res = createResponse();

    await cleanupController.cleanup(createRequest(), res);

    expect(mocked.articleDestroy).toHaveBeenCalledWith({
      where: {
        favoriteInd: 0,
        createdAt: { [Op.lte]: expect.any(Date) },
        userId: 42
      }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Articles cleaned up successfully',
      deletedCount: 3
    });
  });

  it('rejects cleanup without an authenticated user', async () => {
    const res = createResponse();

    await cleanupController.cleanup(
      createRequest({ userData: {} }),
      res
    );

    expect(mocked.articleDestroy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('event and topic article controllers', () => {
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

  it('requires an event to belong to a topic', async () => {
    mocked.eventFindOne.mockResolvedValue({ id: 8, topicId: null });
    const res = createResponse();

    await topicsController.getTopicArticles(
      createRequest({ body: { eventId: 8 } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Topic not found for event'
    });
  });

  it('returns canonical articles from every event in the owned topic', async () => {
    const event = { id: 8, topicId: 3 };
    const topic = { id: 3, name: 'Security' };
    const articles = [{ id: 10 }, { id: 11 }];
    mocked.eventFindOne.mockResolvedValue(event);
    mocked.topicFindOne.mockResolvedValue(topic);
    mocked.eventFindAll.mockResolvedValue([{ id: 8 }, { id: 9 }]);
    mocked.articleFindAll.mockResolvedValue(articles);
    const res = createResponse();

    await topicsController.getTopicArticles(
      createRequest({ body: { eventId: 8, articleId: 7 } }),
      res
    );

    expect(mocked.topicFindOne).toHaveBeenCalledWith({
      where: { id: 3, userId: 42 }
    });
    expect(mocked.eventFindAll).toHaveBeenCalledWith({
      where: { userId: 42, topicId: 3 },
      attributes: ['id']
    });
    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: { [Op.in]: [8, 9] },
        userId: 42,
        duplicateOfArticleId: { [Op.is]: null },
        filteredInd: false,
        id: { [Op.ne]: 7 }
      })
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ topic, event, articles });
  });

  it('returns controller errors as server errors', async () => {
    const error = new Error('query failed');
    mocked.eventFindOne.mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createResponse();

    await topicsController.getTopicArticles(
      createRequest({ body: { eventId: 8 } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'query failed' });
  });
});
