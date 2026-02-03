import api from './client';

export const fetchSettings = () =>
  api.get('/setting');