import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsSmartFolders from '../src/components/model/SettingsSmartFolders.vue';
import {
  fetchSmartFolderInsights,
  saveSmartFolders
} from '../src/api/smartfolders';
import { notifyActionError } from '../src/services/actionNotifications.js';

vi.mock('../src/api/client', () => ({
  setAuthToken: vi.fn()
}));

vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolderInsights: vi.fn(),
  saveSmartFolders: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

// Creates a Smart Folder editor context with live Options API computed values.
const createContext = (overrides = {}) => {
  const context = {
    ...SettingsSmartFolders.data(),
    $emit: vi.fn(),
    $store: {
      auth: { token: 'token' },
      data: {
        currentSelection: { AIEnabled: true },
        smartFolders: [
          {
            id: 1,
            name: 'Unread',
            query: 'unread:true limit:25',
            limitCount: 25
          }
        ],
        fetchSmartFolders: vi.fn().mockResolvedValue()
      }
    },
    ...SettingsSmartFolders.methods,
    ...overrides
  };

  for (const [name, getter] of Object.entries(SettingsSmartFolders.computed)) {
    Object.defineProperty(context, name, {
      configurable: true,
      get: () => getter.call(context)
    });
  }

  return context;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('SettingsSmartFolders editor', () => {
  // Verifies stored folders are copied into editor-local identity and defaults.
  it('loads Smart Folders from the store', async () => {
    const context = createContext();

    await context.fetchSmartFolders();

    expect(context.smartFolders).toEqual([{
      localId: 1,
      id: 1,
      name: 'Unread',
      query: 'unread:true limit:25',
      limitCount: 25
    }]);
    context.smartFolders[0].name = 'Local edit';
    expect(context.$store.data.smartFolders[0].name).toBe('Unread');
  });

  // Verifies insight loading maps recommendations and finalizes state.
  it('loads Smart Folder insights and exposes an empty recommendation response', async () => {
    const context = createContext();
    fetchSmartFolderInsights.mockResolvedValueOnce({
      data: {
        recommendations: {
          smartFolders: [{ name: 'Security', query: 'tag:security' }]
        }
      }
    }).mockResolvedValueOnce({ data: {} });

    await context.fetchSmartFolderInsights();
    expect(context.smartFolderRecommendations).toEqual([
      { name: 'Security', query: 'tag:security' }
    ]);
    expect(context.smartFolderInsightsLoading).toBe(false);
    expect(context.smartFolderInsightsLoaded).toBe(true);

    await context.fetchSmartFolderInsights();
    expect(context.smartFolderRecommendations).toEqual([]);
  });

  // Verifies insight failures retain deterministic loading and error state.
  it('reports Smart Folder insight failures', async () => {
    const context = createContext();
    fetchSmartFolderInsights.mockRejectedValue(new Error('offline'));

    await context.fetchSmartFolderInsights();

    expect(context.smartFolderInsightsError)
      .toBe('Failed to load smart folder insights. Please try again.');
    expect(context.smartFolderInsightsLoading).toBe(false);
    expect(context.smartFolderInsightsLoaded).toBe(true);
  });

  // Verifies query parsing maps supported tokens and preserves unknown free text.
  it('parses existing queries into the editor draft', () => {
    const context = createContext();

    context.parseExistingQueryIntoDraft(
      'read:true favorite:true clicked:true hot:true firstSeen:12h '
      + 'tag:"machine learning" title:"Daily Brief" author:Jane language:nl '
      + 'quality:>=0.80 freshness:>=.45 eventCount:>=4 sort:asc '
      + 'limit:75 "free phrase"'
    );

    expect(context.draftConfig).toMatchObject({
      limitCount: 75,
      status: {
        unread: false,
        read: true,
        favorite: true,
        clicked: true,
        hot: true
      },
      date: {
        useRelative: true,
        relativeAmount: 12,
        relativeUnit: 'h'
      },
      content: {
        tags: 'machine',
        title: 'Daily Brief',
        author: 'Jane',
        language: 'nl',
        text: 'free phrase'
      },
      scores: {
        quality: 0.8,
        freshness: 0.45
      },
      events: {
        useMinimumCount: true,
        minimumCount: 4
      },
      sort: { field: 'published-asc' }
    });
  });

  // Verifies generated queries reflect draft filters, quoting, aliases, and limits.
  it('generates a validated query from configured filters', () => {
    const context = createContext();
    context.draftConfig = {
      name: 'Configured',
      limitCount: 40,
      status: {
        unread: true,
        read: false,
        favorite: true,
        clicked: false,
        hot: false
      },
      date: {
        preset: '',
        useRelative: true,
        relativeAmount: 3,
        relativeUnit: 'd'
      },
      content: {
        tags: 'security',
        title: 'Daily Brief',
        author: 'Jane Doe',
        text: 'zero trust',
        language: 'en'
      },
      scores: { quality: 0.7, freshness: 0.5 },
      events: {
        isEvent: true,
        isNotEvent: false,
        useMinimumCount: false,
        minimumCount: 2
      },
      sort: { field: 'published-desc' }
    };

    expect(context.generatedSmartFolderQuery).toBe(
      'unread:true favorite:true firstSeen:3d tag:security '
      + 'title:"Daily Brief" author:"Jane Doe" language:en "zero trust" '
      + 'quality:>=0.70 freshness:>=0.50 event:true sort:desc limit:40'
    );
    expect(context.generatedQueryValidation.valid).toBe(true);
    expect(context.generatedQueryInvalid).toBe(false);
  });

  // Verifies mutually exclusive status and event choices clear competing state.
  it('enforces exclusive status and event filters', () => {
    const context = createContext();
    context.draftConfig.status.read = true;
    context.draftConfig.status.unread = true;
    context.onStatusFilterChange('unread');
    expect(context.draftConfig.status.read).toBe(false);

    context.draftConfig.events.isNotEvent = true;
    context.draftConfig.events.useMinimumCount = true;
    context.draftConfig.events.isEvent = true;
    context.onEventFilterChange('isEvent');
    expect(context.draftConfig.events).toMatchObject({
      isEvent: true,
      isNotEvent: false,
      useMinimumCount: false
    });

    context.draftConfig.events.useMinimumCount = true;
    context.onEventFilterChange('useMinimumCount');
    expect(context.draftConfig.events.isEvent).toBe(false);
    expect(context.draftConfig.events.isNotEvent).toBe(false);
  });

  // Verifies tag, score, event count, date, and sort token helpers handle boundaries.
  it('normalizes editor token inputs', () => {
    const context = createContext();
    const separatorEvent = { key: ',', preventDefault: vi.fn() };

    expect(context.normalizeTagValue(' security, ai ')).toBe('security');
    context.draftConfig.content.tags = 'machine learning';
    context.normalizeDraftTag();
    expect(context.draftConfig.content.tags).toBe('machine');
    context.preventTagSeparator(separatorEvent);
    expect(separatorEvent.preventDefault).toHaveBeenCalledOnce();
    expect(context.parseScoreToken('quality:invalid')).toBe(0);

    context.applyFirstSeenToken('firstSeen:8h');
    context.applyEventCountToken('eventCount:invalid');
    context.applySortToken('sort:recommended');
    expect(context.draftConfig.date.relativeAmount).toBe(8);
    expect(context.draftConfig.events.minimumCount).toBe(2);
    expect(context.draftConfig.sort.field).toBe('recommended');
  });

  // Verifies add, edit, copy, cancel, and remove operations maintain coherent draft state.
  it('manages the complete local Smart Folder editing lifecycle', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const context = createContext();
    context.fetchSmartFolders();

    context.addSmartFolder();
    expect(context.smartFolders.at(-1)).toMatchObject({
      localId: 'local-1234',
      name: 'New Smart Folder',
      query: 'sort:recommended limit:50'
    });
    expect(context.selectedSmartFolderId).toBe('local-1234');

    context.draftConfig.name = 'Edited';
    context.saveSmartFolderConfig(1);
    expect(context.smartFolders[1].name).toBe('Edited');
    expect(context.selectedSmartFolderId).toBeNull();

    context.draftConfig.name = 'Copied';
    context.saveSmartFolderAsCopy();
    expect(context.smartFolders.at(-1).name).toBe('Copied copy');

    context.selectedSmartFolderId = context.smartFolders[0].localId;
    context.removeSmartFolder(0);
    expect(context.selectedSmartFolderId).toBeNull();
  });

  // Verifies recommendations reject invalid and duplicate additions.
  it('adds valid recommendations and prevents duplicate queries', () => {
    const context = createContext();
    context.fetchSmartFolders();
    const recommendation = {
      name: 'Suggested',
      query: 'unread:true limit:25'
    };

    context.applySmartFolderRecommendation(null);
    context.applySmartFolderRecommendation(recommendation);
    expect(context.smartFolders).toHaveLength(1);
    expect(notifyActionError).toHaveBeenCalledWith(
      'That Smart Folder is already in your list.'
    );

    context.applySmartFolderRecommendation({
      name: 'Security',
      query: 'tag:security limit:50'
    });
    expect(context.smartFolders).toHaveLength(2);
  });

  // Verifies query copying delegates to the available Clipboard API.
  it('copies the generated query when Clipboard support is available', async () => {
    const context = createContext();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    await context.copyGeneratedQuery();

    expect(writeText).toHaveBeenCalledWith('limit:50');
  });

  // Verifies saving commits an open draft, filters blank folders, refreshes, and emits completion.
  it('saves valid Smart Folders and refreshes store state', async () => {
    const context = createContext();
    context.fetchSmartFolders();
    context.toggleSmartFolder(context.smartFolders[0]);
    context.draftConfig.name = 'Updated unread';
    context.smartFolders.push({
      localId: 'blank',
      name: ' ',
      query: 'limit:50',
      limitCount: 50
    });
    saveSmartFolders.mockResolvedValue({ data: { smartFolders: [] } });

    await context.save();

    expect(saveSmartFolders).toHaveBeenCalledOnce();
    expect(saveSmartFolders.mock.calls[0][0]).toHaveLength(1);
    expect(saveSmartFolders.mock.calls[0][0][0].name).toBe('Updated unread');
    expect(context.$store.data.fetchSmartFolders).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledWith('saved');
    expect(context.$emit).toHaveBeenCalledWith('close');
  });

  // Verifies invalid or failed saves do not emit completion and failures notify the user.
  it('blocks invalid saves and reports persistence failures', async () => {
    const invalidContext = createContext();
    Object.defineProperty(invalidContext, 'generatedQueryInvalid', {
      configurable: true,
      value: true
    });
    await invalidContext.save();
    expect(saveSmartFolders).not.toHaveBeenCalled();

    const context = createContext();
    context.fetchSmartFolders();
    const error = new Error('save failed');
    saveSmartFolders.mockRejectedValue(error);
    await context.save();

    expect(context.$emit).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not save Smart Folders. Please try again.',
      error
    );
  });
});
