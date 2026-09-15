import { articleFeedVisibilityMethods, createArticleFeedVisibilityState } from '../../src/components/articles/feed/visibilityTracking.js';
import ArticleFeed from '../../src/components/articles/ArticleFeed.vue';

// Real browser geometry and events; only persistence is replaced with a capture sink.
const summaries = [];
const context = {
  ...createArticleFeedVisibilityState(),
  articles: [{ id: 1, status: 'read' }, { id: 2, status: 'unread' }],
  pendingSeenArticleIds: new Set(),
  selectionStore: { currentSelection: { viewMode: 'full', status: 'unread' }, effectiveMarkAsReadOnScroll: false },
  getSelectedReadingArticleId: () => null,
  markArticleSeen: async (id, seconds, options) => { summaries.push({ id, seconds, options }); return true; },
  $nextTick: callback => requestAnimationFrame(callback),
  getArticleElement: id => document.getElementById(`article-${id}`),
  getLoadMoreSentinel: () => null,
  getReadingViewportTop: () => document.getElementById('panel').getBoundingClientRect().top,
  handleLoadMoreIntersections: () => {}
};
for (const [name, method] of Object.entries(articleFeedVisibilityMethods)) context[name] = method.bind(context);
context.setupObservers();
context.observeArticles();
context.refreshReadingTime();
window.readingTest = {
  context,
  summaries,
  select: id => {
    ArticleFeed.methods.handleReadingArticleChange.call(context);
    context.isReaderLayoutActive = true;
    context.getSelectedReadingArticleId = () => id;
    document.querySelector(`#article-${id}`).scrollIntoView({ block: 'start' });
  }
};
