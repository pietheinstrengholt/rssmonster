import axios from 'axios';

export const CONNECTIVITY_ERROR_EVENT = 'app:connectivity-error';

const api = axios.create({
  baseURL: import.meta.env.VITE_VUE_APP_HOSTNAME + '/api',
  timeout: 15000
});

const AUTH_BOOTSTRAP_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/validate'
];

let hasActiveAuthToken = false;

// This function identifies responses whose callers own authentication bootstrap failures.
const isAuthBootstrapRequest = url =>
  AUTH_BOOTSTRAP_PATHS.some(path => url.includes(path));

// This function identifies response modes that intentionally accept non-JSON content.
const acceptsNonJsonResponse = responseType =>
  responseType === 'blob' || responseType === 'text';

// This function reports whether Axios classified a failure as a canceled request.
const isCanceledRequest = error =>
  axios.isCancel(error) || error?.code === 'ERR_CANCELED';

// This function reports whether a failure came from the configured request deadline.
const isTimeoutError = error =>
  error?.code === 'ECONNABORTED' ||
  error?.code === 'ETIMEDOUT' ||
  /timeout/i.test(error?.message || '');

// This function rejects successful HTML pages returned where API JSON was expected.
const rejectUnexpectedHtml = response => {
  const contentType = response.headers?.['content-type'] || '';

  if (
    contentType.includes('text/html') &&
    !acceptsNonJsonResponse(response.config.responseType)
  ) {
    const error = new axios.AxiosError(
      `API returned HTML instead of JSON for ${response.config.url}`,
      axios.AxiosError.ERR_BAD_RESPONSE,
      response.config,
      response.request,
      response
    );

    console.error('API returned HTML instead of JSON:', response.config.url);
    return Promise.reject(error);
  }

  return response;
};

// This function dispatches global application events only for eligible Axios failures.
const handleApiError = error => {
  const config = error?.config || {};
  const status = error?.response?.status;
  const url = config.url || '';

  if (
    !config.suppressGlobalError &&
    error?.code === 'ERR_NETWORK' &&
    !isCanceledRequest(error) &&
    !isTimeoutError(error) &&
    !url.includes('/agent')
  ) {
    window.dispatchEvent(new CustomEvent(CONNECTIVITY_ERROR_EVENT, {
      detail: {
        type: 'backend-unreachable',
        message: 'Backend unreachable'
      }
    }));
  }

  if (
    !config.suppressGlobalError &&
    status === 401 &&
    hasActiveAuthToken &&
    !isAuthBootstrapRequest(url)
  ) {
    // Prevent concurrent failed requests from expiring the same session repeatedly.
    hasActiveAuthToken = false;
    window.dispatchEvent(new Event('auth:expired'));
  }

  return Promise.reject(error);
};

// This function sets or clears the shared API client's authenticated-session header.
export const setAuthToken = (token) => {
  hasActiveAuthToken = Boolean(token);

  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
    delete axios.defaults.headers.common.Authorization;
  }
};

api.interceptors.response.use(
  rejectUnexpectedHtml,
  handleApiError
);

export default api;
