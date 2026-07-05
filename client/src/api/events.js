import api from './client';

// This function fetches related articles for one event.
export const fetchEventArticles = (
  eventId,
  articleId = null
) =>
  api.post('/events/articles', {
    eventId,
    articleId
  });
