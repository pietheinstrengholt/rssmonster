import api from './client';

export const fetchSidebarSettings = () => api.get('/sidebar/settings');
export const saveSidebarSettings = settings => api.put('/sidebar/settings', { settings });
