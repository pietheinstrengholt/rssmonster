import api from './client';

export const fetchOverview = (selection) =>
  api.get('/manager/overview', { params: selection });