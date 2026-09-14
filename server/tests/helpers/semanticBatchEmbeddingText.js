import { buildArticleEventEmbeddingText } from '../../services/articles/embedArticle.js';

// Preserve the original frozen input recipes while consolidating file layout.
// Changing these recipes would be a separate embedding change, not a batch rename.
export function semanticBatchEmbeddingText(article) {
  const r = article.regression || {};
  const controlled = String(article.sourceId).startsWith('long-') || r.originFixture === 'semantic-regression-expansion'
    || r.scenario && r.provenance !== 'real';
  return buildArticleEventEmbeddingText(controlled
    ? { ...article, contentText: article.contentText || article.contentOriginal || article.description || '' }
    : article);
}
