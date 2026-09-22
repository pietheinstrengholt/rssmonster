// The baseline belongs to this browser, account and article scope, never server settings.
const storageKey = (userId, selection) => `rssmonster.unreadBaseline.${userId}.${JSON.stringify([
  selection.categoryId, selection.feedId, selection.search, selection.tag,
  selection.smartFolderId, selection.minAdvertisementScore, selection.minSentimentScore,
  selection.minQualityScore, selection.grouping, selection.includeDevelopingEvents, selection.sort
])}`;

export const loadUnreadBaseline = (userId, selection) => {
  if (userId == null) return null;
  try {
    const stored = localStorage.getItem(storageKey(userId, selection));
    const value = stored === null ? null : Number(stored);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
};

export const saveUnreadBaseline = (userId, selection, baseline) => {
  if (userId == null) return;
  try {
    localStorage.setItem(storageKey(userId, selection), String(baseline));
  } catch {
    // The current view remains usable when browser storage is unavailable.
  }
};

export const newerUnreadSelection = (selection, baseline) => {
  if (!Number.isSafeInteger(baseline) || baseline < 0) return null;
  return {
    ...selection,
    status: 'unread',
    search: [selection.search, 'unread:true read:false', `id:>${baseline}`].filter(Boolean).join(' '),
    persistSettings: false
  };
};
