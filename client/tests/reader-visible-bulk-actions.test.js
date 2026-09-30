import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { markArticlesAsRead, markManyAsFavorite, markManyClicked } from '../src/api/articles';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles', async importOriginal => ({
  ...await importOriginal(),
  markArticlesAsRead: vi.fn(),
  markManyAsFavorite: vi.fn(),
  markManyClicked: vi.fn()
}));

let surface;
const rect = (top, bottom) => ({ top, bottom, left: 0, right: 400, height: bottom - top, width: 400 });
function setup() {
  const stores = createFocusedStores({
    selection: { currentSelection: { viewMode: 'reader' } },
    overview: { fetchOverviewSplit: vi.fn().mockResolvedValue() }
  });
  surface = document.createElement('section');
  surface.style.overflowY = 'auto';
  surface.getBoundingClientRect = () => rect(100, 500);
  document.body.append(surface);
  let offset = 0;
  const rows = Array.from({ length: 20 }, (_, index) => {
    const row = document.createElement('article');
    row.getBoundingClientRect = () => rect(80 + index * 100 - offset, 180 + index * 100 - offset);
    surface.append(row);
    return row;
  });
  return {
    scroll: value => { offset = value; },
    context: {
      ...stores,
      ...ArticleFeed.methods,
      articles: rows.map((row, index) => ({ id: index + 1, status: 'unread', favoriteInd: 0 })),
      pendingFavoriteArticleIds: new Set(),
      $refs: { articleLayout: { getArticleListElement: id => rows[id - 1] } }
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('innerWidth', 1200);
  for (const api of [markArticlesAsRead, markManyAsFavorite, markManyClicked]) {
    api.mockResolvedValue({ data: { articles: [] } });
  }
});
afterEach(() => { surface?.remove(); vi.unstubAllGlobals(); });

const actions = [
  ['mark-visible-read', markArticlesAsRead],
  ['favorite-visible', markManyAsFavorite],
  ['mark-visible-clicked', markManyClicked]
];

describe('Reader visible bulk actions', () => {
  it.each(actions)('%s sends only on-screen list rows, recalculated after scrolling', async (action, api) => {
    const { context, scroll } = setup();
    await context.handleReaderBulkAction({ action, selectedArticleId: 20 });
    expect(api.mock.calls[0][0]).toEqual([1, 2, 3, 4, 5]);
    scroll(500);
    await context.handleReaderBulkAction({ action, selectedArticleId: 20 });
    expect(api.mock.calls[1][0]).toEqual([6, 7, 8, 9, 10]);
  });

  it.each(actions)('%s excludes supplemental articles and hidden rows', async (action, api) => {
    const { context } = setup();
    context.articles[0].readerRecommendationInd = true;
    context.articles[1].clusterParentId = 20;
    surface.children[2].style.display = 'none';
    await context.handleReaderBulkAction({ action, selectedArticleId: 20 });
    expect(api.mock.calls[0][0]).toEqual([4, 5]);
  });

  it.each(actions)('%s does nothing when no list rows are visible', async (action, api) => {
    const { context, scroll } = setup();
    scroll(3000);
    await context.handleReaderBulkAction({ action, selectedArticleId: 20 });
    expect(api).not.toHaveBeenCalled();
  });
});
