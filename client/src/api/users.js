import api from './client';

/**
 * Fetch all users
 */
export const fetchUsers = () =>
  api.get('/users');

export const fetchEmailConfiguration = () =>
  api.get('/users/email-configuration');

export const testSmtpConnectivity = () =>
  api.post('/users/email-configuration/test');

/**
 * Update a user
 */
export const updateUser = (userId, userData) =>
  api.post(`/users/${userId}`, userData);

/**
 * Delete a user
 */
export const deleteUser = (userId) =>
  api.delete(`/users/${userId}`);
