import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFocusedStores } from './helpers/focusedStores.js';
import { completeSmartFolderQuery, smartFolderPresentation } from '../src/services/smartFolderPresentation.js';
import { fetchSettings } from '../src/api/settings.js';

vi.mock('../src/api/settings.js', () => ({ fetchSettings: vi.fn() }));

let store;
beforeEach(() => {
  const stores = createFocusedStores();
  vi.spyOn(stores.overviewStore, 'fetchTopTags').mockResolvedValue();
  store = stores.selectionStore;
  store.setCurrentSelection({ sort: 'recommended', grouping: 'event', includeDevelopingEvents: true });
});

const folder = { id: 1, query: 'tag:science sort:asc grouping:event limit:12', limitCount: 50 };

describe('Smart Folder presentation ownership', () => {
  it('uses the expression and locks direct presentation actions while active', () => {
    store.setSmartFolder(folder);
    store.setSelectedSort('quality');
    store.setGrouping('none');
    expect(store.currentSelection).toMatchObject({ sort: 'asc', grouping: 'event', search: folder.query, smartFolderId: 1 });
  });

  it.each(['status', 'category', 'feed', 'tag', 'clear', 'filters', 'search'])('restores ordinary preferences when leaving via %s', exit => {
    store.setSmartFolder(folder);
    store.setSmartFolder({ id: 2, query: 'sort:quality grouping:none' });
    const actions = {
      status: () => store.setSelectedStatus('favorite'),
      category: () => store.selectCategory(3),
      feed: () => store.selectFeed(4, 3),
      tag: () => store.setTag('news'),
      clear: () => store.setSmartFolder(null),
      filters: () => store.resetArticleFilters(),
      search: () => store.setSelectedSearch('title:new')
    };
    actions[exit]();
    expect(store.currentSelection).toMatchObject({ smartFolderId: null, sort: 'recommended', grouping: 'event', includeDevelopingEvents: true });
    expect(store.ordinaryPresentation).toBeNull();
    if (exit === 'search') expect(store.currentSelection.search).toBe('title:new');
  });

  it('preserves the active expression when settings reload', async () => {
    store.setSmartFolder(folder);
    fetchSettings.mockResolvedValue({ data: { sort: 'desc', grouping: 'none', search: null, AIEnabled: true } });
    await store.fetchSettings();
    expect(store.currentSelection).toMatchObject({ sort: 'asc', grouping: 'event', search: folder.query });
  });

  it('removes inherited sort and grouping tokens when editing folder search text', () => {
    store.setSmartFolder(folder);
    store.setSelectedSearch('tag:news sort:asc grouping:event limit:12');
    expect(store.currentSelection).toMatchObject({ smartFolderId: null, search: 'tag:news limit:12', sort: 'recommended', grouping: 'event' });
  });

  it('honors presentation tokens explicitly changed in the new manual search', () => {
    store.setSmartFolder(folder);
    store.setSelectedSearch('tag:news sort:quality grouping:none');
    expect(store.currentSelection).toMatchObject({ smartFolderId: null, sort: 'quality', grouping: 'none' });
  });

  it.each(['trust', 'attention'])('does not select removed sort %s', sort => {
    expect(smartFolderPresentation(`sort:${sort}`).sort).toBe('desc');
  });

  it('completes legacy expressions without treating quoted text as presentation', () => {
    const query = completeSmartFolderQuery('title:"sort:asc grouping:event"', 50);
    expect(query).toBe('title:"sort:asc grouping:event" sort:desc grouping:none limit:50');
    expect(completeSmartFolderQuery(query, 50)).toBe(query);
    expect(smartFolderPresentation('sort:desc sort:TOPSTORIES grouping:event developing:true'))
      .toEqual({ sort: 'topStories', grouping: 'event', includeDevelopingEvents: true });
  });
});
