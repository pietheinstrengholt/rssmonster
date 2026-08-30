import db from '../../../models/index.js';
import { shouldSkipArticleClassification } from '../../../config/intelligentFeatures.js';
import analyzeArticleContent, {
  isInferenceQueueFullError
} from '../../crawl/enrichment/analyzeArticleContent.js';
import {
  applyAnalysisScoreOverrides
} from '../../crawl/enrichment/articleAnalysis.js';
import {
  ARTICLE_ANALYSIS_CONTRACT_VERSION,
  buildArticleAnalysisInputHash
} from '../../crawl/enrichment/articleEnrichmentJobs.js';
import { replaceArticleInferredTags } from '../../crawl/persistence/tags.js';
import { getModelValue as rowValue } from '../../../utils/modelValue.js';

const { Article, Feed, Tag, sequelize } = db;
const RATE_LIMIT_DELAY_MS = 3000;

const positiveId = (value, field) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ArticleEnrichmentJobError(
      'ARTICLE_ENRICHMENT_INVALID_PAYLOAD',
      `Article enrichment ${field} is invalid`,
      { retryable: false }
    );
  }
  return parsed;
};

export class ArticleEnrichmentJobError extends Error {
  constructor(code, message, { retryable = true, cause = null, feedId = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ArticleEnrichmentJobError';
    this.code = code;
    this.retryable = retryable;
    this.processingFeedId = feedId;
    this.requestId = cause?.requestId || null;
  }
}

const obsolete = reason => ({ status: 'obsolete', reason });

const readProviderTags = async (articleId, userId, transaction) => {
  const tags = await Tag.findAll({
    attributes: ['name'],
    where: { articleId, userId, tagType: 'provider' },
    transaction
  });
  return tags.map(tag => rowValue(tag, 'name'));
};

const validScore = value => typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 100;

const validateAnalysis = analysis => {
  if (
    !analysis ||
    !Array.isArray(analysis.contentSummaryBullets) ||
    !analysis.contentSummaryBullets.every(value => typeof value === 'string') ||
    !Array.isArray(analysis.tags) ||
    !analysis.tags.every(value => typeof value === 'string') ||
    !validScore(analysis.advertisementScore) ||
    !validScore(analysis.sentimentScore) ||
    !validScore(analysis.qualityScore)
  ) {
    throw new ArticleEnrichmentJobError(
      'ARTICLE_ENRICHMENT_INVALID_RESULT',
      'Article enrichment returned an invalid result',
      { retryable: false }
    );
  }
  return analysis;
};

const validateScoreOverrides = overrides => {
  const resolved = overrides && typeof overrides === 'object' ? overrides : {};
  for (const field of ['advertisementScore', 'qualityScore']) {
    if (resolved[field] !== null && resolved[field] !== undefined && !validScore(resolved[field])) {
      throw new ArticleEnrichmentJobError(
        'ARTICLE_ENRICHMENT_INVALID_PAYLOAD',
        'Article enrichment score overrides are invalid',
        { retryable: false }
      );
    }
  }
  return {
    advertisementScore: resolved.advertisementScore ?? null,
    qualityScore: resolved.qualityScore ?? null
  };
};

const inferenceFailureCode = error => {
  if (isInferenceQueueFullError(error)) return 'INFERENCE_QUEUE_FULL';
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toUpperCase();
  if (code.includes('TIMEOUT') || message.includes('TIMED OUT')) {
    return 'ARTICLE_ENRICHMENT_TIMEOUT';
  }
  if (code.includes('RATE_LIMIT') || message.includes('RATE LIMIT')) {
    return 'ARTICLE_ENRICHMENT_RATE_LIMITED';
  }
  if (code.includes('UNAVAILABLE') || code.includes('CIRCUIT')) {
    return 'ARTICLE_ENRICHMENT_UNAVAILABLE';
  }
  return 'ARTICLE_ENRICHMENT_INFERENCE_FAILED';
};

const jobTarget = job => {
  const payload = rowValue(job, 'payload') || {};
  const articleId = positiveId(payload.articleId, 'articleId');
  const userId = positiveId(payload.userId, 'userId');
  const storedArticleId = rowValue(job, 'articleId');
  if ((storedArticleId !== null && articleId !== Number(storedArticleId)) ||
      userId !== Number(rowValue(job, 'userId'))) {
    throw new ArticleEnrichmentJobError(
      'ARTICLE_ENRICHMENT_INVALID_PAYLOAD',
      'Article enrichment target identifiers do not match the claimed job',
      { retryable: false }
    );
  }
  if (Number(payload.analysisContractVersion) !== ARTICLE_ANALYSIS_CONTRACT_VERSION) {
    return { obsolete: obsolete('analysis_contract_changed') };
  }
  if (!Object.hasOwn(payload, 'expectedContentTextHash')) {
    throw new ArticleEnrichmentJobError(
      'ARTICLE_ENRICHMENT_INVALID_PAYLOAD',
      'Article enrichment content guard is missing',
      { retryable: false }
    );
  }
  if (typeof payload.expectedAnalysisInputHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(payload.expectedAnalysisInputHash)) {
    throw new ArticleEnrichmentJobError(
      'ARTICLE_ENRICHMENT_INVALID_PAYLOAD',
      'Article enrichment version guard is invalid',
      { retryable: false }
    );
  }
  return {
    articleId,
    userId,
    expectedContentTextHash: payload.expectedContentTextHash ?? null,
    expectedAnalysisInputHash: payload.expectedAnalysisInputHash,
    scoreOverrides: validateScoreOverrides(payload.scoreOverrides)
  };
};

const versionMatches = ({ article, providerTags, target }) =>
  (rowValue(article, 'contentTextHash') || null) === target.expectedContentTextHash &&
  buildArticleAnalysisInputHash({ article, providerTags }) === target.expectedAnalysisInputHash;

const skipArticle = async (article, transaction) => {
  if (rowValue(article, 'aiAnalysisStatus') === 'complete') return;
  await article.update({
    aiAnalysisStatus: 'skipped',
    aiAnalysisCompletedAt: null
  }, { transaction });
};

const prepareAnalysisInput = async target => sequelize.transaction(async transaction => {
  const article = await Article.findByPk(target.articleId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!article) return obsolete('article_deleted');
  if (Number(rowValue(article, 'userId')) !== target.userId) {
    throw new ArticleEnrichmentJobError(
      'PROCESSING_JOB_ARTICLE_OWNERSHIP',
      'Article enrichment target ownership does not match the claimed job',
      { retryable: false }
    );
  }

  const feed = await Feed.findOne({
    where: { id: rowValue(article, 'feedId'), userId: target.userId },
    transaction
  });
  if (!feed) return obsolete('feed_deleted');
  const providerTags = await readProviderTags(target.articleId, target.userId, transaction);
  if (!versionMatches({ article, providerTags, target })) return obsolete('stale_version');
  if (rowValue(article, 'filteredInd')) {
    await skipArticle(article, transaction);
    return obsolete('article_filtered');
  }
  if (rowValue(feed, 'applyAiAnalysis') === false || shouldSkipArticleClassification()) {
    await skipArticle(article, transaction);
    return obsolete('analysis_disabled');
  }
  if (rowValue(article, 'aiAnalysisStatus') === 'complete') {
    return obsolete('already_complete');
  }
  if (['skipped', 'failed'].includes(rowValue(article, 'aiAnalysisStatus'))) {
    return obsolete(`article_${rowValue(article, 'aiAnalysisStatus')}`);
  }

  await article.update({
    aiAnalysisStatus: 'processing',
    aiAnalysisCompletedAt: null
  }, { transaction });

  return {
    status: 'ready',
    articleId: target.articleId,
    feedId: rowValue(feed, 'id'),
    input: {
      text: rowValue(article, 'contentText') || '',
      title: rowValue(article, 'title') || '',
      categories: providerTags,
      feedName: rowValue(feed, 'feedName') || '',
      rateLimitDelayMs: RATE_LIMIT_DELAY_MS
    }
  };
});

const persistAnalysis = async ({ target, analysis, completedAt }) =>
  sequelize.transaction(async transaction => {
    const article = await Article.findByPk(target.articleId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!article) return obsolete('article_deleted');
    if (Number(rowValue(article, 'userId')) !== target.userId) {
      throw new ArticleEnrichmentJobError(
        'PROCESSING_JOB_ARTICLE_OWNERSHIP',
        'Article enrichment target ownership changed before persistence',
        { retryable: false }
      );
    }
    const feed = await Feed.findOne({
      where: { id: rowValue(article, 'feedId'), userId: target.userId },
      transaction
    });
    if (!feed) return obsolete('feed_deleted');
    const providerTags = await readProviderTags(target.articleId, target.userId, transaction);
    if (!versionMatches({ article, providerTags, target })) return obsolete('stale_version');
    if (rowValue(article, 'filteredInd')) {
      await skipArticle(article, transaction);
      return obsolete('article_filtered');
    }
    if (rowValue(feed, 'applyAiAnalysis') === false || shouldSkipArticleClassification()) {
      await skipArticle(article, transaction);
      return obsolete('analysis_disabled');
    }
    if (rowValue(article, 'aiAnalysisStatus') === 'complete') {
      return obsolete('already_complete');
    }

    await replaceArticleInferredTags({
      articleId: target.articleId,
      userId: target.userId,
      inferredTags: analysis.tags,
      transaction
    });
    await article.update({
      contentSummaryBullets: analysis.contentSummaryBullets,
      advertisementScore: analysis.advertisementScore,
      sentimentScore: analysis.sentimentScore,
      qualityScore: analysis.qualityScore,
      aiAnalysisStatus: 'complete',
      aiAnalysisCompletedAt: completedAt
    }, { transaction });

    return { status: 'completed', articleId: target.articleId };
  });

export const handleArticleEnrichmentJob = async (job, {
  assertLease = async () => {},
  signal,
  now = () => new Date()
} = {}) => {
  const target = jobTarget(job);
  if (target.obsolete) return target.obsolete;
  const prepared = await prepareAnalysisInput(target);
  if (prepared.status !== 'ready') return prepared;

  await assertLease();
  let analysis;
  try {
    analysis = await analyzeArticleContent(prepared.input, {
      signal,
      useQueueFullFallback: false,
      processingContext: {
        executionId: rowValue(job, 'id'),
        userId: target.userId,
        feedId: prepared.feedId,
        articleId: target.articleId,
        subjectType: 'article',
        subjectId: target.articleId,
        attemptNumber: Number(rowValue(job, 'attempts'))
      }
    });
  } catch (error) {
    const code = inferenceFailureCode(error);
    throw new ArticleEnrichmentJobError(
      code,
      code === 'INFERENCE_QUEUE_FULL'
        ? 'Article enrichment inference queue is full'
        : 'Article enrichment inference failed',
      { retryable: true, cause: error, feedId: prepared.feedId }
    );
  }
  const resolvedAnalysis = applyAnalysisScoreOverrides(
    validateAnalysis(analysis),
    target.scoreOverrides
  );
  await assertLease();
  return persistAnalysis({ target, analysis: resolvedAnalysis, completedAt: now() });
};

export const markArticleEnrichmentFailed = async job => {
  const target = jobTarget(job);
  if (target.obsolete) return target.obsolete;

  return sequelize.transaction(async transaction => {
    const article = await Article.findByPk(target.articleId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!article || Number(rowValue(article, 'userId')) !== target.userId) {
      return obsolete('article_unavailable');
    }
    const providerTags = await readProviderTags(target.articleId, target.userId, transaction);
    if (!versionMatches({ article, providerTags, target })) return obsolete('stale_version');
    if (!['pending', 'processing'].includes(rowValue(article, 'aiAnalysisStatus'))) {
      return obsolete('analysis_state_changed');
    }
    await article.update({
      aiAnalysisStatus: 'failed',
      aiAnalysisCompletedAt: null
    }, { transaction });
    return { status: 'failed', articleId: target.articleId };
  });
};

export default handleArticleEnrichmentJob;
