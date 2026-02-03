import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_VUE_APP_HOSTNAME + '/api',
  timeout: 15000
});

/**
 * Inject or clear Authorization header
 * Call this once when token changes
 */
export const setAuthToken = token => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export default api;