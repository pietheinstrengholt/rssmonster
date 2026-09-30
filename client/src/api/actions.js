import api from './client';

/**
 * Fetch all actions for the current user
 */
export const fetchActions = () =>
  api.get('/actions');

/**
 * Save actions for the current user
 */
export const saveActions = actions =>
  api.post('/actions', { actions });

// Read-only sample of articles matching an unsaved condition.
export const previewAction = regularExpression =>
  api.post('/actions/preview', { regularExpression });
