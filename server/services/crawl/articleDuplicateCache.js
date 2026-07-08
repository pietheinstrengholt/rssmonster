// This function creates an in-memory duplicate index for one feed crawl.
const createArticleDuplicateCache = (articles = [], userContentHashIds = new Map()) => {
  const articleIdsByUrl = new Map();
  const articleIdsByNormalizedUrl = new Map();
  const articleIdsByTitle = new Map();
  const articleIdsByContentHash = new Map();

  // This function adds an article to each applicable duplicate index.
  const add = (article) => {
    if (article.url) articleIdsByUrl.set(article.url, article.id);
    if (article.normalizedUrl) articleIdsByNormalizedUrl.set(article.normalizedUrl, article.id);
    if (article.title) articleIdsByTitle.set(article.title, article.id);
    if (article.contentHash) {
      articleIdsByContentHash.set(article.contentHash, article.id);
      userContentHashIds.set(article.contentHash, article.id);
    }
  };

  articles.forEach(add);

  return {
    // This function finds duplicates using the same precedence as the database fallback.
    find(title, link, contentHash, normalizedUrl = null) {
      if (contentHash) {
        const id = userContentHashIds.get(contentHash) || articleIdsByContentHash.get(contentHash);
        if (id) return { id };
      }

      if (link) {
        const id = articleIdsByUrl.get(link);
        if (id) return { id };
      }

      if (normalizedUrl) {
        const id = articleIdsByNormalizedUrl.get(normalizedUrl);
        if (id) return { id };
      }

      if (title) {
        const id = articleIdsByTitle.get(title);
        if (id) return { id };
      }

      return null;
    },
    add
  };
};

export default createArticleDuplicateCache;
