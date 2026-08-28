import { createHash } from 'node:crypto';
import { enqueueProcessingJob } from '../../jobs/processingJobQueue.js';
import { normalizeTagList } from '../persistence/tags.js';

export const ARTICLE_ENRICHMENT_JOB_TYPE = 'article_enrichment';
export const ARTICLE_ANALYSIS_CONTRACT_VERSION = 1;

const articleValue = (article, field) => typeof article?.getDataValue === 'function'
  ? article.getDataValue(field)
  : article?.[field];

const normalizedTags = tags => normalizeTagList(tags, { splitHierarchies: true }).sort();

export const buildArticleAnalysisInputHash = ({ article, providerTags }) => createHash('sha256')
  .update(JSON.stringify({
    title: articleValue(article, 'title') || '',
    description: articleValue(article, 'description') || '',
    contentTextHash: articleValue(article, 'contentTextHash') || null,
    providerTags: normalizedTags(providerTags)
  }))
  .digest('hex');

const scoreOverrides = actionResult => ({
  advertisementScore: actionResult?.advertisementScore ?? null,
  qualityScore: actionResult?.qualityScore ?? null
});

// Enqueues only identifiers and immutable guards; the worker reloads owned article content.
export const enqueueArticleEnrichmentJob = async ({
  article,
  userId,
  providerTags = [],
  actionResult = null,
  transaction
}) => {
  const articleId = articleValue(article, 'id');
  const expectedContentTextHash = articleValue(article, 'contentTextHash') || null;
  const expectedAnalysisInputHash = buildArticleAnalysisInputHash({ article, providerTags });

  return enqueueProcessingJob({
    type: ARTICLE_ENRICHMENT_JOB_TYPE,
    userId,
    articleId,
    dedupeKey: `article:${articleId}:analysis:${ARTICLE_ANALYSIS_CONTRACT_VERSION}:${expectedAnalysisInputHash}`,
    payload: {
      articleId,
      userId,
      expectedContentTextHash,
      expectedAnalysisInputHash,
      analysisContractVersion: ARTICLE_ANALYSIS_CONTRACT_VERSION,
      scoreOverrides: scoreOverrides(actionResult)
    }
  }, { transaction, reactivateTerminal: true });
};

export default enqueueArticleEnrichmentJob;
