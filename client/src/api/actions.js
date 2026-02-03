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
