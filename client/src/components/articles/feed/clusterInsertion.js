// Groups the local list operations for expanded event and duplicate articles.
export const articleFeedClusterInsertionMethods = {
  // Inserts related cluster articles directly after their parent article.
  insertClusterArticles({ articleId, articles }) {
    // Remove any previously inserted cluster articles for this parent first
    this.removeClusterArticles({ articleId });

    // Build related list in server order, excluding the parent itself when present
    const relatedArticles = articles.filter(article => article.id !== articleId);

    if (relatedArticles.length === 0) {
      return;
    }

    // Re-home existing related items to the parent location instead of dropping them
    const articlesToInsert = relatedArticles.map((article) => {
      const existingIndex = this.articles.findIndex(a => a.id === article.id);

      if (existingIndex !== -1) {
        const [existingArticle] = this.articles.splice(existingIndex, 1);
        return {
          ...existingArticle,
          ...article
        };
      }

      return article;
    });

    // Find the index of the clicked article after re-homing
    const clickedIndex = this.articles.findIndex(a => a.id === articleId);

    if (clickedIndex === -1) {
      console.error('Could not find clicked article in articles list');
      return;
    }

    // Mark cluster children with parent reference
    const markedArticles = articlesToInsert.map(article => ({
      ...article,
      isEventArticle: true,
      clusterParentId: articleId
    }));

    // Insert cluster articles right after the clicked article
    this.articles.splice(clickedIndex + 1, 0, ...markedArticles);
  },

  // Removes cluster articles currently inserted for a parent article.
  removeClusterArticles({ articleId }) {
    this.articles = this.articles.filter(a => a.clusterParentId !== articleId);
  },

  // Inserts duplicate articles directly after their canonical parent article.
  insertDuplicateArticles({ articleId, articles }) {
    this.removeDuplicateArticles({ articleId });

    const clickedIndex = this.articles.findIndex(article => article.id === articleId);
    if (clickedIndex === -1) {
      console.error('Could not find canonical article in articles list');
      return;
    }

    const markedArticles = articles.map(article => ({
      ...article,
      isEventArticle: true,
      duplicateParentId: articleId
    }));

    this.articles.splice(clickedIndex + 1, 0, ...markedArticles);
  },

  // Removes duplicate articles currently inserted for a canonical parent article.
  removeDuplicateArticles({ articleId }) {
    this.articles = this.articles.filter(article => article.duplicateParentId !== articleId);
  }
};
