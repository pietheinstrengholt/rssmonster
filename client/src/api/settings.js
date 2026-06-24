import api from './client';

export const fetchSettings = () =>
  api.get('/setting');

/**
 * Save settings
 */
export const saveSettings = (settingsData) =>
  api.post('/setting', settingsData);

export const saveThemeMode = themeMode =>
  api.patch('/setting/theme', { themeMode });

export const fetchIslandsOverview = () =>
  api.get('/setting/islands');

export const fetchTopicsOverview = () =>
  api.get('/setting/topics');
