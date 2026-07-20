import api from './client';

// This function fetches the current user's Daily Briefing preferences.
export const fetchBriefingPreferences = () =>
  api.get('/briefing/preferences');

// This function replaces the current user's Daily Briefing preferences.
export const saveBriefingPreferences = preferences =>
  api.put('/briefing/preferences', { preferences });
