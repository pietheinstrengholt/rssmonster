import api from './client';

export const fetchInterests = (params, signal) => api.get('/interests', { params, signal });
export const fetchInterest = (id, signal) => api.get(`/interests/${encodeURIComponent(id)}`, { signal });
export const setInterestMuted = (id, muted) => api.patch(`/interests/${encodeURIComponent(id)}`, { muted });
