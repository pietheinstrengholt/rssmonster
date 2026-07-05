// client/src/api/manager.js
import api from './client';
import { normalizeQuerySortAliasesForApi, normalizeSortValueForApi } from '../services/queryValidation';

/**
 * Fetch overview data with current selection
 * Backend expects POST with body
 */
export const fetchOverview = (currentSelection) =>
  api.post('/manager/overview', {
    ...currentSelection,
    search: normalizeQuerySortAliasesForApi(currentSelection.search),
    sort: normalizeSortValueForApi(currentSelection.sort),
    grouping: String(currentSelection.grouping)
  });

/**
 * Fetch overview structure only.
 */
export const fetchOverviewLite = () =>
  api.get('/manager/overview-lite');

/**
 * Fetch overview counts for current selection.
 */
export const fetchOverviewCounts = (currentSelection) =>
  api.post('/manager/overview-counts', {
    ...currentSelection,
    search: normalizeQuerySortAliasesForApi(currentSelection.search),
    sort: normalizeSortValueForApi(currentSelection.sort),
    grouping: String(currentSelection.grouping)
  });

/**
 * Update category order
 */
export const updateCategoryOrder = (order) =>
  api.post('/manager/updateorder', { order });
