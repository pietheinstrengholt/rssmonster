import api from './client';

// This function validates a saved session without persisting its bootstrap token.
export const validateSession = async (token) => {
  if (!token) throw new Error('No token');

  const response = await api.post('/auth/validate', undefined, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    suppressGlobalError: true
  });
  return response.data;
};

/**
 * Login with credentials
 */
export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

// This function requests the server-gated development session without sending credentials.
export const developmentLogin = async () => {
  const response = await api.post('/auth/development-login', undefined, {
    suppressGlobalError: true
  });
  return response.data;
};

/**
 * Register new user
 */
export const register = async (credentials) => {
  const response = await api.post('/auth/register', credentials);
  return response.data;
};
