import api from './client';
import { normalizeQuerySortAliasesForApi } from '../services/queryValidation';

export const fetchSmartFolders = () =>
  api.get('/smartfolders?withCounts=false');

export const fetchSmartFolderCounts = () =>
  api.get('/smartfolders/counts');

/**
 * Save smart folders
 */
export const saveSmartFolders = (smartFolders) =>
  api.post('/smartfolders', {
    smartFolders: (smartFolders || []).map(smartFolder => ({
      ...smartFolder,
      query: normalizeQuerySortAliasesForApi(smartFolder.query)
    }))
  });

/**
 * Fetch smart folder insights
 */
export const fetchSmartFolderInsights = () =>
  api.get('/smartfolders/insights');
