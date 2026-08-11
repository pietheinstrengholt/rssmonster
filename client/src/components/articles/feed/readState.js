import {
  markAllAsRead,
  markArticlesAsRead,
  markArticleSeen,
  markArticleUnread
} from '../../../api/articles.js';
import { notifyActionError } from '../../../services/actionNotifications.js';

// Creates local read-state reconciliation and in-flight request state.
export function createArticleFeedReadState() {
  return {
    // is used to keep track of which articles are already flagged as passed
    pool: new Set(),
    isFlushed: false,
    activeMinimalArticleId: null,
    pendingReadStatusArticleIds: new Set(),
    pendingSeenArticleIds: new Set(),
    seenPersistenceAttempts: new Map()
  };
}

// Groups local and server read-state reconciliation across feed view modes.
export const articleFeedReadStateMethods = {
  // Clears read-tracking state before a new article collection becomes active.
  resetReadTracking() {
    this.pool = new Set();
    this.activeMinimalArticleId = null;
    this.pendingReadStatusArticleIds.clear();
    this.pendingSeenArticleIds.clear();
    this.seenPersistenceAttempts.clear();
    this.isFlushed = false;
  },

  // Marks the previously selected reader article as read before navigating away.
  markReaderPreviousArticleRead(articleId) {
    if (this.selectionStore.currentSelection.viewMode !== 'reader') return;

    const normalizedArticleId = Number(articleId);
    const poolArticleId = Number.isFinite(normalizedArticleId) ? normalizedArticleId : articleId;
    const article = this.articles.find(item => item.id === articleId || item.id === poolArticleId);
    if (!article || article.status === 'read' || this.pool.has(poolArticleId)) return;

    this.addToPool(poolArticleId);
  },

  // Marks the live selection as read, then rebuilds that collection from the database.
  async flushPool() {
    if ((!this.totalCount && !this.container.length) || this.isFlushed) return;

    const selection = { ...this.selectionStore.currentSelection };
    const activeRequestId = this.activeRequestId;

    try {
      await markAllAsRead(selection);
    } catch (error) {
      console.error('Error marking all articles as read:', error);
      notifyActionError('Could not mark these articles as read. Please try again.', error);
      return;
    }

    if (activeRequestId !== this.activeRequestId) {
      await this.overviewStore.fetchOverviewSplit({ forceUpdate: true });
      return;
    }

    this.articles = this.articles.map(article => ({ ...article, status: 'read' }));
    this.isFlushed = true;

    try {
      await Promise.all([
        this.overviewStore.fetchOverviewSplit({ forceUpdate: true }),
        this.refreshArticleIds(selection)
      ]);
    } catch (error) {
      console.error('Error refreshing articles after marking all as read:', error);
      notifyActionError('Articles were marked as read, but the list could not be refreshed. Please refresh and try again.', error);
    }
  },

  // Persists an article's seen status and updates local read state.
  async markArticleSeen(articleId, visibleSeconds = 0) {
    const selection = this.selectionStore.currentSelection;
    const shouldMarkRead = selection.status === 'unread'
      || (
        selection.status === 'briefing'
        && this.selectionStore.effectiveMarkAsReadOnScroll === true
      );

    try {
      const response = await markArticleSeen(articleId, {
        grouping: selection.grouping,
        visibleSeconds,
        selectedStatus: shouldMarkRead ? 'unread' : selection.status
      });

      this.applyArticleSeenResponse(response.data, {
        updateReadCounts: shouldMarkRead
      });
      return true;
    } catch (error) {
      console.error(`Error recording seen state for article ${articleId}:`, error);
      return false;
    }
  },

  // Applies the server response from marking articles as seen/read.
  applyArticleSeenResponse(updatedArticle, { updateReadCounts = false } = {}) {
    // Always reflect latest status (and related fields) in local articles array.
    this.updateArticleStatusLocal(updatedArticle);

    const readArticles = updatedArticle.readArticles?.length
      ? updatedArticle.readArticles
      : (updatedArticle.status === "read" ? [updatedArticle] : []);

    for (const readArticle of readArticles) {
      this.updateArticleStatusLocal({ id: readArticle.id, status: 'read' });
    }

    if (updateReadCounts) {
      for (const readArticle of readArticles) {
        this.overviewStore.increaseReadCount(readArticle);
      }
      if (readArticles.length > 0) {
        this.overviewStore.decreaseBriefingCount(updatedArticle);
      }
    }
  },

  // Opens a minimal article and marks the previously open unread article as read.
  async handleMinimalArticleOpened({ id }) {
    if (this.selectionStore.currentSelection.viewMode !== 'minimal') return;

    const previousArticleId = this.activeMinimalArticleId;
    this.activeMinimalArticleId = id;

    if (!previousArticleId || String(previousArticleId) === String(id)) return;

    const previousArticle = this.articles.find(article => String(article.id) === String(previousArticleId));
    if (!previousArticle || previousArticle.status === 'read') return;

    await this.markMinimalArticleRead(previousArticleId);
  },

  // Closes the currently open minimal article content.
  handleMinimalArticleClosed({ id }) {
    if (String(this.activeMinimalArticleId) === String(id)) {
      this.activeMinimalArticleId = null;
    }
  },

  // Marks a minimal article as read and updates local read counts.
  async markMinimalArticleRead(articleId) {
    const pendingArticleId = Number(articleId);
    const normalizedArticleId = Number.isFinite(pendingArticleId) ? pendingArticleId : articleId;
    if (this.pendingReadStatusArticleIds.has(normalizedArticleId)) return;

    const article = this.articles.find(item => String(item.id) === String(articleId));
    const wasUnread = article?.status !== 'read';
    this.pendingReadStatusArticleIds.add(normalizedArticleId);

    try {
      const response = await markArticleSeen(articleId, {
        grouping: this.selectionStore.currentSelection.grouping,
        visibleSeconds: 0,
        selectedStatus: 'unread'
      });

      this.applyArticleSeenResponse(response.data, {
        updateReadCounts: wasUnread
      });
      this.pool.add(normalizedArticleId);
    } catch (error) {
      console.error('Error marking minimal article as read:', error);
    } finally {
      this.pendingReadStatusArticleIds.delete(normalizedArticleId);
    }
  },

  // Toggles a minimal article between read and unread from the status icon.
  async toggleMinimalArticleReadStatus({ id, status }) {
    if (this.selectionStore.currentSelection.viewMode !== 'minimal') return;

    const pendingArticleId = Number(id);
    const normalizedArticleId = Number.isFinite(pendingArticleId) ? pendingArticleId : id;
    if (this.pendingReadStatusArticleIds.has(normalizedArticleId)) return;

    this.pendingReadStatusArticleIds.add(normalizedArticleId);
    if (String(this.activeMinimalArticleId) === String(id)) {
      this.activeMinimalArticleId = null;
    }

    try {
      if (status === 'read') {
        const response = await markArticleUnread(id);
        this.updateArticleStatusLocal(response.data);
        this.overviewStore.decreaseReadCount(response.data);
        this.pool.delete(normalizedArticleId);
        return;
      }

      const response = await markArticleSeen(id, {
        grouping: this.selectionStore.currentSelection.grouping,
        visibleSeconds: 0,
        selectedStatus: 'unread'
      });

      this.applyArticleSeenResponse(response.data, {
        updateReadCounts: status !== 'read'
      });
      this.pool.add(normalizedArticleId);
    } catch (error) {
      console.error('Error toggling minimal article read status:', error);
      notifyActionError('Could not update the article status. Please try again.', error);
    } finally {
      this.pendingReadStatusArticleIds.delete(normalizedArticleId);
    }
  },

  // Toggles an article between read and unread from a keyboard shortcut.
  async toggleShortcutArticleReadStatus({ id, status }) {
    if (this.selectionStore.currentSelection.viewMode === 'minimal') {
      await this.toggleMinimalArticleReadStatus({ id, status });
      return;
    }

    await this.toggleArticleReadStatus({ id, status });
  },

  // Toggles an article between read and unread.
  async toggleArticleReadStatus({ id, status }) {
    const articleId = Number(id);
    const pendingArticleId = Number.isFinite(articleId) ? articleId : id;
    if (this.pendingReadStatusArticleIds.has(pendingArticleId)) return;

    this.pendingReadStatusArticleIds.add(pendingArticleId);

    try {
      if (status === 'read') {
        const response = await markArticleUnread(id);
        this.updateArticleStatusLocal(response.data);
        this.overviewStore.decreaseReadCount(response.data);
        this.pool.delete(pendingArticleId);
        return;
      }

      const response = await markArticleSeen(id, {
        grouping: this.selectionStore.currentSelection.grouping,
        visibleSeconds: 0,
        selectedStatus: 'unread'
      });

      this.applyArticleSeenResponse(response.data, { updateReadCounts: status !== 'read' });
      this.pool.add(pendingArticleId);
    } catch (error) {
      console.error('Error toggling article read status:', error);
      notifyActionError('Could not update the article status. Please try again.', error);
    } finally {
      this.pendingReadStatusArticleIds.delete(pendingArticleId);
    }
  },

  // Returns the articles targeted by a reader bulk read action.
  getReaderBulkReadArticles(action, selectedArticleId) {
    const selectedIndex = this.articles.findIndex(article => String(article.id) === String(selectedArticleId));

    if (action === 'mark-visible-read') {
      return this.articles;
    }

    if (selectedIndex === -1) {
      return [];
    }

    if (action === 'mark-above-read') {
      return this.articles.slice(0, selectedIndex);
    }

    if (action === 'mark-below-read') {
      return this.articles.slice(selectedIndex + 1);
    }

    if (action === 'mark-older-read') {
      const selectedTime = this.articlePublishedTime(this.articles[selectedIndex]);
      if (!Number.isFinite(selectedTime)) return [];

      return this.articles.filter(article => {
        const articleTime = this.articlePublishedTime(article);
        return Number.isFinite(articleTime) && articleTime < selectedTime;
      });
    }

    return [];
  },

  // Returns an article publication timestamp used for relative bulk actions.
  articlePublishedTime(article) {
    const value = article?.publishedAt;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : NaN;
  },

  // Marks the provided reader articles as read.
  async markReaderArticlesRead(articles) {
    const unreadArticles = articles.filter(article => article.status !== 'read');
    if (!unreadArticles.length) return;

    const response = await markArticlesAsRead(unreadArticles.map(article => article.id));
    const updatedArticles = response.data.articles || [];

    for (const article of updatedArticles) {
      const pendingArticleId = Number(article.id);
      const normalizedArticleId = Number.isFinite(pendingArticleId) ? pendingArticleId : article.id;
      this.updateArticleStatusLocal(article);
      this.pool.add(normalizedArticleId);
    }

    await this.overviewStore.fetchOverviewSplit({ forceUpdate: true });
  },

  // Toggles the selected reader article between read and unread.
  async toggleReaderArticleReadStatus({ id, status }) {
    if (this.selectionStore.currentSelection.viewMode !== 'reader') return;
    await this.toggleArticleReadStatus({ id, status });
  },

  // Updates an article's local status and optional returned fields.
  updateArticleStatusLocal(updatedArticle) {
    const idx = this.articles.findIndex(a => a.id === updatedArticle.id);
    if (idx !== -1) {
      const current = this.articles[idx];
      this.articles[idx] = {
        ...current,
        status: updatedArticle.status ?? current.status,
        firstSeen: updatedArticle.firstSeen ?? current.firstSeen,
        attentionBucket: updatedArticle.attentionBucket ?? current.attentionBucket
      };
    }
  }
};
