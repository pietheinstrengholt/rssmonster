import api from './client';

export const fetchSettings = () =>
  api.get('/setting');

/**
 * Save settings
 */
export const saveSettings = (settingsData) =>
  api.post('/setting', settingsData);
