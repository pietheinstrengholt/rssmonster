import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import {
  isCanonicalUnreadArticle,
  resolveDevelopingArticleIdForAssignment,
  selectDevelopingArticleId,
  wasReadBeforeArticleArrived
} from '../../services/events/developingArticlePointer.js';

const representativeArticle = {
  id: 100,
  status: 'read',
  readAt: new Date('2026-07-23T09:00:00Z'),
  createdAt: new Date('2026-07-23T08:00:00Z')
};

const developingWave = [
  {
    id: 105,
    status: 'unread',
    createdAt: new Date('2026-07-23T12:00:00Z')
  },
  {
    id: 103,
    status: 'unread',
    createdAt: new Date('2026-07-23T10:00:00Z')
  },
  {
    id: 104,
    status: 'unread',
    createdAt: new Date('2026-07-23T11:00:00Z')
  }
];

describe('developingArticlePointer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('repairs a missing pointer to the first qualifying arrival regardless of input order', () => {
    const event = {
      representativeArticleId: representativeArticle.id,
      developingArticleId: 999
    };

    expect(selectDevelopingArticleId(event, [
      ...developingWave,
      representativeArticle
    ])).toBe(103);
  });

  it('preserves a valid sticky pointer when later coverage exists', () => {
    const event = {
      representativeArticleId: representativeArticle.id,
      developingArticleId: 103
    };

    expect(selectDevelopingArticleId(event, [
      representativeArticle,
      ...developingWave
    ])).toBe(103);
  });

  it('uses arrival time and article id to repair an event without a representative', () => {
    const sameArrival = new Date('2026-07-23T10:00:00Z');
    const articles = [
      { id: 105, status: 'unread', createdAt: new Date('2026-07-23T11:00:00Z') },
      { id: 104, status: 'unread', createdAt: sameArrival },
      { id: 103, status: 'unread', createdAt: sameArrival }
    ];

    expect(selectDevelopingArticleId({
      representativeArticleId: null,
      developingArticleId: null
    }, articles)).toBe(103);
  });

  it('does not start a wave when read and arrival timestamps are equal', () => {
    const incomingArticle = {
      id: 103,
      status: 'unread',
      createdAt: representativeArticle.readAt
    };

    expect(wasReadBeforeArticleArrived(representativeArticle, incomingArticle)).toBe(false);
    expect(selectDevelopingArticleId({
      representativeArticleId: representativeArticle.id,
      developingArticleId: null
    }, [incomingArticle, representativeArticle])).toBe(representativeArticle.id);
  });

  it('rejects filtered, duplicate, and non-unread developing candidates', () => {
    expect(isCanonicalUnreadArticle({
      status: 'unread',
      duplicateOfArticleId: null,
      filteredInd: false
    })).toBe(true);
    expect(isCanonicalUnreadArticle({
      status: 'read',
      duplicateOfArticleId: null,
      filteredInd: false
    })).toBe(false);
    expect(isCanonicalUnreadArticle({
      status: 'unread',
      duplicateOfArticleId: 1,
      filteredInd: false
    })).toBe(false);
    expect(isCanonicalUnreadArticle({
      status: 'unread',
      duplicateOfArticleId: null,
      filteredInd: true
    })).toBe(false);
  });

  it('falls back to canonical event membership when both stored pointers are invalid', async () => {
    const findOne = vi.spyOn(db.Article, 'findOne')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const findAll = vi.spyOn(db.Article, 'findAll').mockResolvedValue([
      {
        id: 13,
        status: 'unread',
        createdAt: new Date('2026-07-23T11:00:00Z')
      },
      {
        id: 12,
        status: 'unread',
        createdAt: new Date('2026-07-23T10:00:00Z')
      }
    ]);

    const result = await resolveDevelopingArticleIdForAssignment({
      event: {
        id: 7,
        userId: 3,
        representativeArticleId: 11,
        developingArticleId: 99
      },
      incomingArticle: {
        id: 13,
        status: 'unread',
        duplicateOfArticleId: null,
        filteredInd: false
      },
      transaction: { id: 'transaction' }
    });

    expect(result).toBe(12);
    expect(findOne).toHaveBeenCalledTimes(2);
    expect(findAll).toHaveBeenCalledOnce();
  });
});
