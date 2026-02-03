import api from './client';

/**
 * Send chat messages to the agent endpoint
 */
export const sendChatMessages = (messages) =>
  api.post('/agent', { messages });
