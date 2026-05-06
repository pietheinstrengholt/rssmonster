// client/src/api/manager.js
import api from './client';

/**
 * Fetch overview data with current selection
 * Backend expects POST with body
 */
export const fetchOverview = (currentSelection) =>
  api.post('/manager/overview', {
    ...currentSelection,
    clusterView: String(currentSelection.clusterView)
  });

/**
 * Fetch overview structure only (fast)
 * Returns categories + feeds with zero counts
 */
export const fetchOverviewLite = () =>
  api.get('/manager/overview-lite');

/**
 * Fetch overview counts only (lazy background)
 * Returns global and feed-level counts to populate badges
 */
export const fetchOverviewCounts = (currentSelection) =>
  api.post('/manager/overview-counts', {
    clusterView: String(currentSelection.clusterView)
  });

/**
 * Update category order
 */
export const updateCategoryOrder = (order) =>
  api.post('/manager/updateorder', { order });
