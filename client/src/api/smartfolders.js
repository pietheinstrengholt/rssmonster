import api from './client';

export const fetchSmartFolders = () =>
  api.get('/smartfolders');