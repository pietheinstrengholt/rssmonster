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

// This function saves the user's preferred startup selection behavior.
export const saveStartupViewMode = startupViewMode =>
  api.patch('/setting/startup-view', { startupViewMode });

// This function saves whether scrolling past unread articles marks them as read.
export const saveMarkAsReadOnScroll = markAsReadOnScroll =>
  api.patch('/setting/mark-as-read-on-scroll', { markAsReadOnScroll });

// This function saves the generic unread high-trust preference.
export const savePrioritizeHighTrust = prioritizeHighTrust =>
  api.patch('/setting/prioritize-high-trust', { prioritizeHighTrust });

export const fetchIslandsOverview = () =>
  api.get('/setting/islands');

export const fetchTopicsOverview = () =>
  api.get('/setting/topics');

export const fetchCrawlStatistics = (params = {}) =>
  api.get('/setting/crawl-statistics', { params });

export const fetchProcessingFailureGroups = (params = {}) =>
  api.get('/setting/observability', { params });

export const fetchProcessingFailureOccurrences = (fingerprint, params = {}) =>
  api.get(`/setting/observability/groups/${encodeURIComponent(fingerprint)}`, { params });

export const fetchProcessingFailureDetail = failureId =>
  api.get(`/setting/observability/failures/${failureId}`);

export const clearProcessingFailures = () =>
  api.delete('/setting/observability');

export const fetchOfficialSources = () =>
  api.get('/setting/official-sources');

export const saveOfficialSources = officialSources =>
  api.post('/setting/official-sources', { officialSources });
