import api from './client';

export const fetchSettings = () =>
  api.get('/setting');

/**
 * Save settings
 */
export const saveSettings = (settingsData) =>
  api.post('/setting', settingsData);

// This function saves the developing-events preference for the current user.
export const saveIncludeDevelopingEvents = includeDevelopingEvents =>
  api.patch('/setting/developing-events', { includeDevelopingEvents });

export const saveThemeMode = themeMode =>
  api.patch('/setting/theme', { themeMode });

export const fetchIslandsOverview = () =>
  api.get('/setting/islands');

export const fetchTopicsOverview = () =>
  api.get('/setting/topics');

export const fetchCrawlStatistics = (params = {}) =>
  api.get('/setting/crawl-statistics', { params });

export const fetchOfficialSources = () =>
  api.get('/setting/official-sources');

export const saveOfficialSources = officialSources =>
  api.post('/setting/official-sources', { officialSources });
