const createSharedUserArticleHashIds = () => ({
  contentStrippedHashIds: new Map(),
  contentHashIds: new Map()
});

// This function creates an in-memory duplicate index for one feed crawl.
const createArticleDuplicateCache = (articles = [], userArticleHashIds = createSharedUserArticleHashIds()) => {
  const articleIdsByUrlHash = new Map();
  const articleIdsByNormalizedUrlHash = new Map();
  const articlesByTitle = new Map();

  const sharedUserArticleHashIds = {
    contentStrippedHashIds: userArticleHashIds.contentStrippedHashIds || new Map(),
    contentHashIds: userArticleHashIds.contentHashIds || new Map()
  };

  // This function adds an article to each applicable duplicate index.
  const add = (article) => {
    if (article.urlHash) articleIdsByUrlHash.set(article.urlHash, article.id);
    if (article.normalizedUrlHash) articleIdsByNormalizedUrlHash.set(article.normalizedUrlHash, article.id);
    if (article.title) {
      const matches = articlesByTitle.get(article.title) || [];
      matches.push({
        id: article.id,
        published: article.published
      });
      articlesByTitle.set(article.title, matches);
    }
    if (article.contentStrippedHash) {
      sharedUserArticleHashIds.contentStrippedHashIds.set(article.contentStrippedHash, article.id);
    }
    if (article.contentHash) {
      sharedUserArticleHashIds.contentHashIds.set(article.contentHash, article.id);
    }
  };

  articles.forEach(add);

  return {
    findByUserContentStrippedHash(contentStrippedHash) {
      const id = sharedUserArticleHashIds.contentStrippedHashIds.get(contentStrippedHash);
      return id ? { id } : null;
    },
    findByUserContentHash(contentHash) {
      const id = sharedUserArticleHashIds.contentHashIds.get(contentHash);
      return id ? { id } : null;
    },
    findByFeedNormalizedUrlHash(normalizedUrlHash) {
      const id = articleIdsByNormalizedUrlHash.get(normalizedUrlHash);
      return id ? { id } : null;
    },
    findByFeedUrlHash(urlHash) {
      const id = articleIdsByUrlHash.get(urlHash);
      return id ? { id } : null;
    },
    findFeedTitleCandidates(title) {
      return articlesByTitle.get(title) || [];
    },
    add
  };
};

export default createArticleDuplicateCache;
export { createSharedUserArticleHashIds };
