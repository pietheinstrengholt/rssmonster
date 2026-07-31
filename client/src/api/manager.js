// client/src/api/manager.js
import api from './client';

// This function limits overview requests to the filters consumed by manager endpoints.
const overviewCountFilters = currentSelection => ({
  grouping: String(currentSelection.grouping ?? 'none'),
  includeDevelopingEvents: currentSelection.includeDevelopingEvents === true
});

/**
 * Fetch overview data with current selection
 * Backend expects POST with body
 */
export const fetchOverview = (currentSelection) =>
  api.post('/manager/overview', overviewCountFilters(currentSelection));

/**
 * Fetch overview structure only.
 */
export const fetchOverviewLite = () =>
  api.get('/manager/overview-lite');

/**
 * Fetch overview counts for current selection.
 */
export const fetchOverviewCounts = (currentSelection) =>
  api.post('/manager/overview-counts', overviewCountFilters(currentSelection));

/**
 * Update category order
 */
export const updateCategoryOrder = (order) =>
  api.post('/manager/updateorder', { order });
