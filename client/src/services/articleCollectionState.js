// This function reports whether the unfiltered all-sources Briefing introduction is visible.
export function shouldShowDailyBriefingIntro({ status, categoryId, feedId, tag }) {
  return status === 'briefing'
    && categoryId === '%'
    && feedId === '%'
    && !tag;
}

// This function determines whether loading or review progress reached the collection boundary.
export function hasReachedArticleCollectionEnd({
  articleCount,
  distance,
  status,
  remainingItems,
  fetchCount,
  allowUnreadFinalPage = false,
  hasMore = null
}) {
  if (!articleCount) return false;

  if (typeof hasMore === 'boolean') return !hasMore;

  const loadedEveryArticle = distance >= articleCount;
  const reviewedToFinalPage = allowUnreadFinalPage
    && status === 'unread'
    && remainingItems < fetchCount;
  return loadedEveryArticle || reviewedToFinalPage;
}

// This function derives the shared collection-tail presentation from explicit collection state.
export function getArticleCollectionTailState({
  supportsEndState = true,
  hasReachedEnd,
  isDismissed,
  status,
  isFlushed,
  unreadCount,
  articles,
  markAsReadOnScroll,
  unreadsSinceLastUpdate,
  articleCount,
  newerArticlesAvailable = false
}) {
  const hasUnreadArticles = articles.some(article => article.status !== 'read');
  const supportsMarkAllRead = status === 'unread'
    || (status === 'briefing' && markAsReadOnScroll === true);

  return {
    hasUnreadArticles,
    showEndState: supportsEndState && hasReachedEnd && !isDismissed,
    showEndStateActions: supportsMarkAllRead
      && !isFlushed
      && unreadCount > 0
      && hasUnreadArticles,
    showEndStateDismiss: markAsReadOnScroll !== true,
    showRefreshState: status === 'unread'
      && articleCount > 0
      && (isFlushed === true || newerArticlesAvailable)
      && unreadsSinceLastUpdate > 0
  };
}
