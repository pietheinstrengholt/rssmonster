import api from './client';

export const fetchSettings = () =>
  api.get('/setting');

export const fetchInterestIslands = () =>
  api.get('/setting/interest-islands');

/**
 * Save settings
 */
export const saveSettings = (settingsData) =>
  api.post('/setting', settingsData);
