// The persistence methods define the frontend boundary for the future Webhooks API.
// No Webhooks route exists yet, so this module makes that capability explicit.
export const WEBHOOK_PERSISTENCE_AVAILABLE = false;

const unavailable = () => {
  throw new Error('Webhook persistence is not available yet.');
};

export const fetchWebhooks = unavailable;
export const createWebhook = unavailable;
export const updateWebhook = unavailable;
export const deleteWebhook = unavailable;
