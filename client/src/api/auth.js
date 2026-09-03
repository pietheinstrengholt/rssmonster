import api from './client';

export const getAuthConfiguration = async () => {
  const response = await api.get('/auth/configuration', {
    suppressGlobalError: true
  });
  return response.data;
};

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

export const getEmailSettings = async () => {
  const response = await api.get('/auth/email');
  return response.data;
};

export const updateEmail = async email => {
  const response = await api.patch('/auth/email', { email });
  return response.data;
};

export const requestEmailVerification = async () => {
  const response = await api.post('/auth/verify-email/request');
  return response.data;
};

export const confirmEmailVerification = async token => {
  const response = await api.post('/auth/verify-email/confirm', { token }, {
    suppressGlobalError: true
  });
  return response.data;
};

export const requestPasswordReset = async email => {
  const response = await api.post('/auth/password-reset/request', { email }, {
    suppressGlobalError: true
  });
  return response.data;
};

export const confirmPasswordReset = async ({ token, password, passwordRepeat }) => {
  const response = await api.post('/auth/password-reset/confirm', {
    token,
    password,
    passwordRepeat
  }, { suppressGlobalError: true });
  return response.data;
};

const emailEnrollmentHeaders = token => ({
  headers: { Authorization: `Bearer ${token}` },
  suppressGlobalError: true
});

export const getEmailEnrollmentStatus = async token => {
  const response = await api.get('/auth/email-enrollment', emailEnrollmentHeaders(token));
  return response.data;
};

export const updateEmailEnrollment = async (token, email) => {
  const response = await api.put(
    '/auth/email-enrollment',
    { email },
    emailEnrollmentHeaders(token)
  );
  return response.data;
};

export const resendEmailEnrollment = async token => {
  const response = await api.post(
    '/auth/email-enrollment/resend',
    undefined,
    emailEnrollmentHeaders(token)
  );
  return response.data;
};
