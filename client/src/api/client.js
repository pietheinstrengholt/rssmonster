import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_VUE_APP_HOSTNAME + '/api',
  timeout: 15000
});

/**
 * Set or clear Authorization header
 */
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

/**
 * Response interceptor:
 * - Auto logout on 401
 * - Ignore auth bootstrap endpoints
 */
api.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status;
    const url = error?.config?.url ?? '';

    // Network / backend offline
    if (!error.response) {
      window.dispatchEvent(new CustomEvent('app:error', {
        detail: {
          type: 'offline',
          message: 'Backend unreachable'
        }
      }));
    }

    // Auth expired
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/validate');

    if (status === 401 && !isAuthEndpoint) {
      // Notify app that auth expired
      window.dispatchEvent(new Event('auth:expired'));
    }

    return Promise.reject(error);
  }
);

export default api;