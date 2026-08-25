import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchActions,
  saveActions
} from '../src/api/actions.js';
import {
  createCategory,
  deleteCategory,
  updateCategory
} from '../src/api/categories.js';
import { cleanupOldArticles } from '../src/api/cleanup.js';
import { triggerCrawl } from '../src/api/crawl.js';
import {
  fetchOverview,
  fetchOverviewCounts,
  fetchOverviewLite,
  updateCategoryOrder
} from '../src/api/manager.js';
import {
  clearProcessingFailures,
  fetchCrawlStatistics,
  fetchIslandsOverview,
  fetchOfficialSources,
  fetchProcessingFailureDetail,
  fetchProcessingFailureGroups,
  fetchProcessingFailureOccurrences,
  fetchSettings,
  fetchTopicsOverview,
  saveIncludeDevelopingEvents,
  saveMarkAsReadOnScroll,
  saveOfficialSources,
  saveSettings,
  saveStartupViewMode,
  saveThemeMode
} from '../src/api/settings.js';
import {
  fetchSmartFolderCounts,
  fetchSmartFolderInsights,
  fetchSmartFolders,
  saveSmartFolders
} from '../src/api/smartfolders.js';

const { del, get, patch, post, put } = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  default: {
    delete: del,
    get,
    patch,
    post,
    put
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('actions and category API contracts', () => {
  // Verifies user action configuration requests preserve the action list.
  it('builds action configuration requests', () => {
    const actions = [{ type: 'webhook', enabled: true }];

    fetchActions();
    saveActions(actions);

    expect(get).toHaveBeenCalledWith('/actions');
    expect(post).toHaveBeenCalledWith('/actions', { actions });
  });

  // Verifies category CRUD calls preserve names, icons, and identifiers.
  it('builds category CRUD requests', () => {
    createCategory('Security', 'shield-lock-fill');
    updateCategory(4, 'Infosec', 'shield-fill');
    deleteCategory(5);

    expect(post).toHaveBeenCalledWith('/categories', {
      name: 'Security',
      iconName: 'shield-lock-fill'
    });
    expect(put).toHaveBeenCalledWith('/categories/4', {
      name: 'Infosec',
      iconName: 'shield-fill'
    });
    expect(del).toHaveBeenCalledWith('/categories/5');
  });

  // Verifies maintenance calls use their dedicated endpoints.
  it('builds crawl and cleanup requests', () => {
    cleanupOldArticles();
    triggerCrawl();

    expect(post).toHaveBeenCalledWith('/cleanup');
    expect(get).toHaveBeenCalledWith('/crawl');
  });
});

describe('manager API contracts', () => {
  // Verifies overview endpoints receive only the grouping filters consumed by the server.
  it('builds overview requests', () => {
    const selection = {
      includeDevelopingEvents: true,
      status: 'unread',
      search: 'sort:quality tag:ai',
      sort: 'quality',
      grouping: 'topic',
      themeMode: 'dark',
      userId: 42
    };

    fetchOverview(selection);
    fetchOverviewCounts(selection);
    fetchOverviewLite();

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/manager/overview',
      {
        grouping: 'topic',
        includeDevelopingEvents: true
      }
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/manager/overview-counts',
      {
        grouping: 'topic',
        includeDevelopingEvents: true
      }
    );
    expect(get).toHaveBeenCalledWith('/manager/overview-lite');
  });

  // Verifies category ordering uses the manager mutation endpoint.
  it('builds the category-order request', () => {
    updateCategoryOrder([3, 1, 2]);

    expect(post).toHaveBeenCalledWith('/manager/updateorder', {
      order: [3, 1, 2]
    });
  });
});

describe('settings API contracts', () => {
  // Verifies general settings fetch and save calls preserve the settings document.
  it('builds general settings requests', () => {
    const settings = { viewMode: 'reader', grouping: 'event' };

    fetchSettings();
    saveSettings(settings);

    expect(get).toHaveBeenCalledWith('/setting');
    expect(post).toHaveBeenCalledWith('/setting', settings);
  });

  // Verifies dedicated preference patches send only their owned setting.
  it('builds dedicated preference requests', () => {
    saveIncludeDevelopingEvents(true);
    saveThemeMode('dark');
    saveStartupViewMode('briefing');
    saveMarkAsReadOnScroll(false);

    expect(patch).toHaveBeenNthCalledWith(
      1,
      '/setting/developing-events',
      { includeDevelopingEvents: true }
    );
    expect(patch).toHaveBeenNthCalledWith(
      2,
      '/setting/theme',
      { themeMode: 'dark' }
    );
    expect(patch).toHaveBeenNthCalledWith(
      3,
      '/setting/startup-view',
      { startupViewMode: 'briefing' }
    );
    expect(patch).toHaveBeenNthCalledWith(
      4,
      '/setting/mark-as-read-on-scroll',
      { markAsReadOnScroll: false }
    );
  });

  // Verifies semantic and crawl overview reads preserve optional statistics parameters.
  it('builds settings overview requests', () => {
    const params = { period: '30d', limit: 25 };

    fetchIslandsOverview();
    fetchTopicsOverview();
    fetchCrawlStatistics(params);
    fetchCrawlStatistics();

    expect(get).toHaveBeenNthCalledWith(1, '/setting/islands');
    expect(get).toHaveBeenNthCalledWith(2, '/setting/topics');
    expect(get).toHaveBeenNthCalledWith(
      3,
      '/setting/crawl-statistics',
      { params }
    );
    expect(get).toHaveBeenNthCalledWith(
      4,
      '/setting/crawl-statistics',
      { params: {} }
    );
  });

  it('builds bounded processing failure drill-down requests', () => {
    const params = { days: 30, limit: 50 };
    const fingerprint = 'a/b';

    fetchProcessingFailureGroups(params);
    fetchProcessingFailureOccurrences(fingerprint, params);
    fetchProcessingFailureDetail(91);
    clearProcessingFailures();

    expect(get).toHaveBeenNthCalledWith(1, '/setting/observability', { params });
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/setting/observability/groups/a%2Fb',
      { params }
    );
    expect(get).toHaveBeenNthCalledWith(3, '/setting/observability/failures/91');
    expect(del).toHaveBeenCalledWith('/setting/observability');
  });

  // Verifies official-source settings retain the complete source list.
  it('builds official-source requests', () => {
    const officialSources = [{ hostname: 'example.com', enabled: true }];

    fetchOfficialSources();
    saveOfficialSources(officialSources);

    expect(get).toHaveBeenCalledWith('/setting/official-sources');
    expect(post).toHaveBeenCalledWith('/setting/official-sources', {
      officialSources
    });
  });
});

describe('Smart Folder API contracts', () => {
  // Verifies Smart Folder reads use distinct structure, count, and insight endpoints.
  it('builds Smart Folder read requests', () => {
    fetchSmartFolders();
    fetchSmartFolderCounts();
    fetchSmartFolderInsights();

    expect(get).toHaveBeenNthCalledWith(
      1,
      '/smartfolders?withCounts=false'
    );
    expect(get).toHaveBeenNthCalledWith(2, '/smartfolders/counts');
    expect(get).toHaveBeenNthCalledWith(3, '/smartfolders/insights');
  });

  // Verifies Smart Folder saves preserve folder fields and tolerate an empty input.
  it('builds Smart Folder save requests', () => {
    const folders = [{
      id: 2,
      name: 'AI',
      query: 'tag:ai sort:quality',
      limitCount: 50
    }];

    saveSmartFolders(folders);
    saveSmartFolders(null);

    expect(post).toHaveBeenNthCalledWith(1, '/smartfolders', {
      smartFolders: folders
    });
    expect(post).toHaveBeenNthCalledWith(2, '/smartfolders', {
      smartFolders: []
    });
  });
});
