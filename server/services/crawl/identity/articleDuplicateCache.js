// This function returns the cache key used for exact article-title fallback lookups.
export const normalizeTitleKey = title =>
  typeof title === 'string'
    ? title.trim().toLowerCase()
    : '';

// Creates the shared user article hash id.
const createSharedUserArticleHashIds = () => ({
  contentTextHashIds: new Map(),
  contentSourceHashIds: new Map()
});

// This function determines whether an article may suppress active content or title duplicates.
const isActiveDuplicateCandidate = article => !Boolean(article.filteredInd);

// This function adds an active article to the shared user-wide content hash indexes.
const addSharedUserArticleHashes = (sharedUserArticleHashIds, article) => {
  // Returns early when article is not active duplicate candidate.
  if (!isActiveDuplicateCandidate(article)) return;

  // Handles the case where article content text hash is available.
  if (article.contentTextHash) {
    sharedUserArticleHashIds.contentTextHashIds.set(article.contentTextHash, article.id);
  }
  // Handles the case where article content source hash is available.
  if (article.contentSourceHash) {
    sharedUserArticleHashIds.contentSourceHashIds.set(article.contentSourceHash, article.id);
  }
};

// This function creates an in-memory duplicate index for one feed crawl.
const createArticleDuplicateCache = (articles = [], userArticleHashIds = createSharedUserArticleHashIds()) => {
  // Derives the article id by url hash required while creating article duplicate cache.
  const articleIdsByUrlHash = new Map();
  // Derives the article id by normalized url hash required while creating article duplicate cache.
  const articleIdsByNormalizedUrlHash = new Map();
  // Derives the articles by title required while creating article duplicate cache.
  const articlesByTitle = new Map();

  // Builds the shared user article hash id assembled while creating article duplicate cache.
  const sharedUserArticleHashIds = {
    contentTextHashIds: userArticleHashIds.contentTextHashIds || new Map(),
    contentSourceHashIds: userArticleHashIds.contentSourceHashIds || new Map()
  };

  // This function adds an article to each applicable duplicate index.
  const add = (article) => {
    // Handles the case where article url hash is available.
    if (article.urlHash) articleIdsByUrlHash.set(article.urlHash, article.id);
    // Handles the case where article normalized url hash is available.
    if (article.normalizedUrlHash) articleIdsByNormalizedUrlHash.set(article.normalizedUrlHash, article.id);

    // Returns early when article is not active duplicate candidate.
    if (!isActiveDuplicateCandidate(article)) return;

    // Normalizes the title key before performing add.
    const titleKey = normalizeTitleKey(article.title);
    // Handles the case where title key is available.
    if (titleKey) {
      // Collects matches for the selection made while performing add.
      const matches = articlesByTitle.get(titleKey) || [];
      matches.push({
        id: article.id,
        publishedAt: article.publishedAt
      });
      articlesByTitle.set(titleKey, matches);
    }
    addSharedUserArticleHashes(sharedUserArticleHashIds, article);
  };

  // This function removes one article from a title index without disturbing other matches.
  const removeTitleCandidate = (article) => {
    // Normalizes the title key before performing remove title candidate.
    const titleKey = normalizeTitleKey(article.title);
    // Returns early when title key is unavailable.
    if (!titleKey) return;

    // Collects matches for the selection made while performing remove title candidate.
    const matches = articlesByTitle.get(titleKey) || [];
    // Keeps the remaining matches entries eligible while performing remove title candidate.
    const remainingMatches = matches.filter(match => match.id !== article.id);
    // Handles the case where remaining matches is non-empty.
    if (remainingMatches.length) {
      articlesByTitle.set(titleKey, remainingMatches);
    } else {
      articlesByTitle.delete(titleKey);
    }
  };

  // This function replaces an article's old duplicate identities with its committed state.
  const update = (previousArticleState, updatedArticle) => {
    // Handles the case where previous article state url hash is available and get is previous article state id.
    if (
      previousArticleState.urlHash &&
      articleIdsByUrlHash.get(previousArticleState.urlHash) === previousArticleState.id
    ) {
      articleIdsByUrlHash.delete(previousArticleState.urlHash);
    }
    // Handles the case where previous article state normalized url hash is available and get is previous article state id.
    if (
      previousArticleState.normalizedUrlHash &&
      articleIdsByNormalizedUrlHash.get(previousArticleState.normalizedUrlHash) === previousArticleState.id
    ) {
      articleIdsByNormalizedUrlHash.delete(previousArticleState.normalizedUrlHash);
    }
    // Handles the case where previous article state content text hash is available and get is previous article state id.
    if (
      previousArticleState.contentTextHash &&
      sharedUserArticleHashIds.contentTextHashIds.get(previousArticleState.contentTextHash) === previousArticleState.id
    ) {
      sharedUserArticleHashIds.contentTextHashIds.delete(previousArticleState.contentTextHash);
    }
    // Handles the case where previous article state content source hash is available and get is previous article state id.
    if (
      previousArticleState.contentSourceHash &&
      sharedUserArticleHashIds.contentSourceHashIds.get(previousArticleState.contentSourceHash) === previousArticleState.id
    ) {
      sharedUserArticleHashIds.contentSourceHashIds.delete(previousArticleState.contentSourceHash);
    }

    removeTitleCandidate(previousArticleState);
    add(updatedArticle);
  };

  articles.forEach(add);

  return {
    findByUserContentTextHash(contentTextHash) {
      // Derives the id through get while creating article duplicate cache.
      const id = sharedUserArticleHashIds.contentTextHashIds.get(contentTextHash);
      // Selects the result based on whether id is available.
      return id ? { id } : null;
    },
    findByUserContentSourceHash(contentSourceHash) {
      // Derives the id through get while creating article duplicate cache.
      const id = sharedUserArticleHashIds.contentSourceHashIds.get(contentSourceHash);
      // Selects the result based on whether id is available.
      return id ? { id } : null;
    },
    findByFeedNormalizedUrlHash(normalizedUrlHash) {
      // Derives the id through get while creating article duplicate cache.
      const id = articleIdsByNormalizedUrlHash.get(normalizedUrlHash);
      // Selects the result based on whether id is available.
      return id ? { id } : null;
    },
    findByFeedUrlHash(urlHash) {
      // Derives the id through get while creating article duplicate cache.
      const id = articleIdsByUrlHash.get(urlHash);
      // Selects the result based on whether id is available.
      return id ? { id } : null;
    },
    findFeedTitleCandidates(title) {
      return articlesByTitle.get(normalizeTitleKey(title)) || [];
    },
    add,
    update
  };
};

export default createArticleDuplicateCache;
export {
  addSharedUserArticleHashes,
  createSharedUserArticleHashIds,
  isActiveDuplicateCandidate
};
