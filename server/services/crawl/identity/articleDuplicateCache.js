// This function returns the cache key used for exact article-title fallback lookups.
export const normalizeTitleKey = title =>
  typeof title === 'string'
    ? title.trim().toLowerCase()
    : '';

const createSharedUserArticleHashIds = () => ({
  contentTextHashIds: new Map(),
  contentSourceHashIds: new Map()
});

// This function determines whether an article may suppress active content or title duplicates.
const isActiveDuplicateCandidate = article => !Boolean(article.filteredInd);

// This function adds an active article to the shared user-wide content hash indexes.
const addSharedUserArticleHashes = (sharedUserArticleHashIds, article) => {
  if (!isActiveDuplicateCandidate(article)) return;

  if (article.contentTextHash) {
    sharedUserArticleHashIds.contentTextHashIds.set(article.contentTextHash, article.id);
  }
  if (article.contentSourceHash) {
    sharedUserArticleHashIds.contentSourceHashIds.set(article.contentSourceHash, article.id);
  }
};

// This function creates an in-memory duplicate index for one feed crawl.
const createArticleDuplicateCache = (articles = [], userArticleHashIds = createSharedUserArticleHashIds()) => {
  const articleIdsByUrlHash = new Map();
  const articleIdsByNormalizedUrlHash = new Map();
  const articlesByTitle = new Map();

  const sharedUserArticleHashIds = {
    contentTextHashIds: userArticleHashIds.contentTextHashIds || new Map(),
    contentSourceHashIds: userArticleHashIds.contentSourceHashIds || new Map()
  };

  // This function adds an article to each applicable duplicate index.
  const add = (article) => {
    if (article.urlHash) articleIdsByUrlHash.set(article.urlHash, article.id);
    if (article.normalizedUrlHash) articleIdsByNormalizedUrlHash.set(article.normalizedUrlHash, article.id);

    if (!isActiveDuplicateCandidate(article)) return;

    const titleKey = normalizeTitleKey(article.title);
    if (titleKey) {
      const matches = articlesByTitle.get(titleKey) || [];
      matches.push({
        id: article.id,
        published: article.published
      });
      articlesByTitle.set(titleKey, matches);
    }
    addSharedUserArticleHashes(sharedUserArticleHashIds, article);
  };

  // This function removes one article from a title index without disturbing other matches.
  const removeTitleCandidate = (article) => {
    const titleKey = normalizeTitleKey(article.title);
    if (!titleKey) return;

    const matches = articlesByTitle.get(titleKey) || [];
    const remainingMatches = matches.filter(match => match.id !== article.id);
    if (remainingMatches.length) {
      articlesByTitle.set(titleKey, remainingMatches);
    } else {
      articlesByTitle.delete(titleKey);
    }
  };

  // This function replaces an article's old duplicate identities with its committed state.
  const update = (previousArticleState, updatedArticle) => {
    if (
      previousArticleState.urlHash &&
      articleIdsByUrlHash.get(previousArticleState.urlHash) === previousArticleState.id
    ) {
      articleIdsByUrlHash.delete(previousArticleState.urlHash);
    }
    if (
      previousArticleState.normalizedUrlHash &&
      articleIdsByNormalizedUrlHash.get(previousArticleState.normalizedUrlHash) === previousArticleState.id
    ) {
      articleIdsByNormalizedUrlHash.delete(previousArticleState.normalizedUrlHash);
    }
    if (
      previousArticleState.contentTextHash &&
      sharedUserArticleHashIds.contentTextHashIds.get(previousArticleState.contentTextHash) === previousArticleState.id
    ) {
      sharedUserArticleHashIds.contentTextHashIds.delete(previousArticleState.contentTextHash);
    }
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
      const id = sharedUserArticleHashIds.contentTextHashIds.get(contentTextHash);
      return id ? { id } : null;
    },
    findByUserContentSourceHash(contentSourceHash) {
      const id = sharedUserArticleHashIds.contentSourceHashIds.get(contentSourceHash);
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
