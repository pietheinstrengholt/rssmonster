import api from '../api/client.js';

export const fetchWebhooks = async () => (await api.get('/webhooks')).data.webhooks;
export const fetchWebhook = async id => (await api.get(`/webhooks/${id}`)).data.webhook;
export const createWebhook = async payload => (await api.post('/webhooks', payload)).data.webhook;
export const updateWebhook = async (id, payload) => (await api.put(`/webhooks/${id}`, payload)).data.webhook;
export const deleteWebhook = id => api.delete(`/webhooks/${id}`);
