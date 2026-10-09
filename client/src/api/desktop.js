import api from './client';

export const fetchDesktopSettings = () => api.get('/desktop/settings');
export const saveDesktopSettings = settings => api.put('/desktop/settings', settings);
export const fetchDesktopActivity = () => api.get('/desktop/activity');
