// This function returns whether an article is the newer presentation article for an event.
export const isDevelopingArticle = (articleId, event) => {
  const developingArticleId = event?.developingArticleId;
  const representativeArticleId = event?.representativeArticleId;

  return developingArticleId !== null
    && developingArticleId !== undefined
    && String(articleId) === String(developingArticleId)
    && String(developingArticleId) !== String(representativeArticleId);
};
