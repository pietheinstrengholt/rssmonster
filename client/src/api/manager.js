import api, { setAuthToken } from './client';

/**
 * Fetch overview data with current selection
 */
export const fetchOverview = async (currentSelection, token) => {
  setAuthToken(token);
  return api.get(
    import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/overview",
    { params: { ...currentSelection } }
  );
};

/**
 * Update category order
 */
export const updateCategoryOrder = (order) =>
  api.post('/manager/updateorder', { order });