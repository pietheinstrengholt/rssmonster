import api from './client';

/**
 * Fetch all users
 */
export const fetchUsers = () =>
  api.get('/users');

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
