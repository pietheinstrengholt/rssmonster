const STORAGE_KEY = 'rssmonster.recentSearches';
const MAX_SEARCHES = 10;

function normalizeSearches(queries) {
  if (!Array.isArray(queries)) return [];
  return [...new Set(queries.filter(query => typeof query === 'string').map(query => query.trim()).filter(Boolean))].slice(0, MAX_SEARCHES);
}

export function getRecentSearches() {
  try {
    return normalizeSearches(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return [];
  }
}

export function saveRecentSearches(queries) {
  const normalized = normalizeSearches(queries);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Keep search usable when browser storage is unavailable or full.
  }
  return normalized;
}
