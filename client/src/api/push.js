import api from './client.js';

export const fetchPushConfiguration = () => api.get('/push/configuration');
export const fetchPushSubscriptionStatus = () => api.get('/push/subscription');
export const savePushSubscription = subscription =>
  api.post('/push/subscription', subscription);
export const deletePushSubscription = endpoint =>
  api.delete('/push/subscription', { data: { endpoint } });
