import { describe, expect, it } from 'vitest';
import {
  getArticleCollectionTailState,
  hasReachedArticleCollectionEnd,
  shouldShowDailyBriefingIntro
} from '../src/services/articleCollectionState.js';

describe('article collection state', () => {
  it('shows Briefing context only for the unfiltered all-sources collection', () => {
    const selection = {
      status: 'briefing',
      categoryId: '%',
      feedId: '%',
      tag: ''
    };

    expect(shouldShowDailyBriefingIntro(selection)).toBe(true);
    expect(shouldShowDailyBriefingIntro({ ...selection, categoryId: 4 })).toBe(false);
    expect(shouldShowDailyBriefingIntro({ ...selection, feedId: 8 })).toBe(false);
    expect(shouldShowDailyBriefingIntro({ ...selection, tag: 'security' })).toBe(false);
    expect(shouldShowDailyBriefingIntro({ ...selection, status: 'unread' })).toBe(false);
  });

  it('distinguishes loaded completion from the stream unread-final-page capability', () => {
    const collection = {
      articleCount: 21,
      distance: 20,
      status: 'unread',
      remainingItems: 1,
      fetchCount: 20
    };

    expect(hasReachedArticleCollectionEnd(collection)).toBe(false);
    expect(hasReachedArticleCollectionEnd({
      ...collection,
      allowUnreadFinalPage: true
    })).toBe(true);
    expect(hasReachedArticleCollectionEnd({
      ...collection,
      status: 'read',
      allowUnreadFinalPage: true
    })).toBe(false);
    expect(hasReachedArticleCollectionEnd({
      ...collection,
      articleCount: 0,
      distance: 0,
      allowUnreadFinalPage: true
    })).toBe(false);
  });

  it('derives shared end-state actions from unread collection state', () => {
    expect(getArticleCollectionTailState({
      supportsEndState: true,
      hasReachedEnd: true,
      isDismissed: false,
      status: 'unread',
      isFlushed: false,
      unreadCount: 2,
      articles: [{ status: 'unread' }, { status: 'read' }],
      markAsReadOnScroll: false,
      unreadsSinceLastUpdate: 0,
      articleCount: 2
    })).toEqual({
      hasUnreadArticles: true,
      showEndState: true,
      showEndStateActions: true,
      showEndStateDismiss: true,
      showRefreshState: false
    });
  });

  // Verifies Briefing offers final cleanup only when its scroll-to-read behavior is active.
  it('offers the final mark-all-read action for scroll-to-read Briefings', () => {
    const briefingState = {
      supportsEndState: true,
      hasReachedEnd: true,
      isDismissed: false,
      status: 'briefing',
      isFlushed: false,
      unreadCount: 2,
      articles: [{ status: 'unread' }, { status: 'read' }],
      markAsReadOnScroll: true,
      unreadsSinceLastUpdate: 0,
      articleCount: 2
    };

    expect(getArticleCollectionTailState(briefingState)).toMatchObject({
      showEndState: true,
      showEndStateActions: true,
      showEndStateDismiss: false
    });
    expect(getArticleCollectionTailState({
      ...briefingState,
      markAsReadOnScroll: false
    }).showEndStateActions).toBe(false);
  });

  it('hides redundant actions and exposes refresh state after a flush', () => {
    expect(getArticleCollectionTailState({
      supportsEndState: true,
      hasReachedEnd: true,
      isDismissed: true,
      status: 'unread',
      isFlushed: true,
      unreadCount: 0,
      articles: [{ status: 'read' }],
      markAsReadOnScroll: true,
      unreadsSinceLastUpdate: 3,
      articleCount: 1
    })).toEqual({
      hasUnreadArticles: false,
      showEndState: false,
      showEndStateActions: false,
      showEndStateDismiss: false,
      showRefreshState: true
    });
  });
});
