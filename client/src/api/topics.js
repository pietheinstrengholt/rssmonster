import api from './client';

// This function fetches related articles for the topic attached to an event.
export const fetchTopicArticles = (
  eventId,
  articleId = null
) =>
  api.post('/topics/articles', {
    eventId,
    articleId
  });
