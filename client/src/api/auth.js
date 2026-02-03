import axios from 'axios';
import api, { setAuthToken } from './client';

const BASE_URL = import.meta.env.VITE_VUE_APP_HOSTNAME + '/api/auth';

/**
 * Validate an existing session.
 * IMPORTANT: backend expects Authorization header ONLY.
 */
export const validateSession = async (token) => {
  if (!token) throw new Error('No token');

  // bootstrap call → raw axios
  axios.defaults.headers.common.Authorization = `Bearer ${token}`;

  const response = await axios.post(`${BASE_URL}/validate`);
  return response.data;
};

/**
 * Login with credentials
 */
export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

/**
 * Register new user
 */
export const register = async (credentials) => {
  const response = await api.post('/auth/register', credentials);
  return response.data;
};

/**
 * Apply token globally after successful auth
 */
export const applyAuthToken = (token) => {
  setAuthToken(token);
};
