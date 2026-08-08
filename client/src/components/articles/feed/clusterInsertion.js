// Removes event-cluster children belonging to one parent from an article collection.
export function removeClusterArticlesFromCollection(articles, articleId) {
  return articles.filter(article => article.clusterParentId !== articleId);
}

// Inserts server-ordered event-cluster children after their parent without mutating the input collection.
export function insertClusterArticlesIntoCollection(articles, { articleId, articles: relatedArticles }, reportError = console.error) {
  const nextArticles = removeClusterArticlesFromCollection(articles, articleId);
  const relatedWithoutParent = relatedArticles.filter(article => article.id !== articleId);

  if (relatedWithoutParent.length === 0) return nextArticles;

  // Re-home existing related items to the parent location instead of dropping them.
  const articlesToInsert = relatedWithoutParent.map((article) => {
    const existingIndex = nextArticles.findIndex(existingArticle => existingArticle.id === article.id);

    if (existingIndex !== -1) {
      const [existingArticle] = nextArticles.splice(existingIndex, 1);
      return {
        ...existingArticle,
        ...article
      };
    }

    return article;
  });

  // Find the index of the clicked article after re-homing.
  const clickedIndex = nextArticles.findIndex(article => article.id === articleId);

  if (clickedIndex === -1) {
    reportError('Could not find clicked article in articles list');
    return nextArticles;
  }

  // Mark cluster children with their presentation parent reference.
  const markedArticles = articlesToInsert.map(article => ({
    ...article,
    isEventArticle: true,
    clusterParentId: articleId
  }));

  nextArticles.splice(clickedIndex + 1, 0, ...markedArticles);
  return nextArticles;
}

// Removes duplicate children belonging to one canonical parent from an article collection.
export function removeDuplicateArticlesFromCollection(articles, articleId) {
  return articles.filter(article => article.duplicateParentId !== articleId);
}

// Inserts duplicate children after their canonical parent without mutating the input collection.
export function insertDuplicateArticlesIntoCollection(articles, { articleId, articles: duplicateArticles }, reportError = console.error) {
  const nextArticles = removeDuplicateArticlesFromCollection(articles, articleId);
  const clickedIndex = nextArticles.findIndex(article => article.id === articleId);

  if (clickedIndex === -1) {
    reportError('Could not find canonical article in articles list');
    return nextArticles;
  }

  const markedArticles = duplicateArticles.map(article => ({
    ...article,
    isEventArticle: true,
    duplicateParentId: articleId
  }));

  nextArticles.splice(clickedIndex + 1, 0, ...markedArticles);
  return nextArticles;
}

// Adapts pure collection transforms to the ArticleFeed Options API state contract.
export const articleFeedClusterInsertionMethods = {
  // Inserts related cluster articles into the component-owned article collection.
  insertClusterArticles(payload) {
    this.articles = insertClusterArticlesIntoCollection(this.articles, payload);
  },

  // Removes related cluster articles from the component-owned article collection.
  removeClusterArticles({ articleId }) {
    this.articles = removeClusterArticlesFromCollection(this.articles, articleId);
  },

  // Inserts duplicate articles into the component-owned article collection.
  insertDuplicateArticles(payload) {
    this.articles = insertDuplicateArticlesIntoCollection(this.articles, payload);
  },

  // Removes duplicate articles from the component-owned article collection.
  removeDuplicateArticles({ articleId }) {
    this.articles = removeDuplicateArticlesFromCollection(this.articles, articleId);
  }
};
