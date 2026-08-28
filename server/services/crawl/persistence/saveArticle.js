import db from '../../../models/index.js';
import { saveArticleTags } from './tags.js';
import buildArticlePersistenceValues from './buildArticlePersistenceValues.js';
import { enqueueArticleEnrichmentJob } from '../enrichment/articleEnrichmentJobs.js';
import { buildActionScoreOverrideIndicators } from '../enrichment/articleAnalysis.js';
import {
  assertExecutionLeaseOwnership,
  throwIfExecutionExpired
} from '../../feeds/executionDeadline.js';

// Provides the shared dependencies used by this service.
const { Article, sequelize } = db;

// Defines the article unique conflicts enforced by this service.
const ARTICLE_UNIQUE_CONFLICTS = [
  {
    identity: 'urlHash',
    constraint: 'articles_feedId_urlHash_unique',
    fields: ['feedId', 'urlHash']
  },
  {
    identity: 'normalizedUrlHash',
    constraint: 'articles_feedId_normalizedUrlHash_unique',
    fields: ['feedId', 'normalizedUrlHash']
  }
];

// This function returns strings that may identify the violated MySQL unique index.
const uniqueErrorMetadata = error => [
  error?.constraint,
  error?.index,
  error?.parent?.constraint,
  error?.parent?.index,
  error?.original?.constraint,
  error?.original?.index,
  error?.message,
  error?.parent?.message,
  error?.parent?.sqlMessage,
  error?.original?.message,
  error?.original?.sqlMessage,
  ...Object.keys(error?.fields || {}),
  ...(error?.errors || []).flatMap(item => [item?.path, item?.message])
].filter(value => typeof value === 'string' && value.trim());

// This function checks metadata tokens without accepting partial index-name matches.
const metadataContainsConstraint = (metadata, constraint) => metadata.some(value => (
  String(value)
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .includes(constraint.toLowerCase())
));

// This function identifies an article unique index from explicit field metadata.
const conflictFromFields = error => {
  // Tracks distinct field names while performing conflict from fields.
  const fieldNames = new Set([
    ...Object.keys(error?.fields || {}),
    ...(error?.errors || []).map(item => item?.path)
  ].filter(Boolean));
  // Keeps the matches entries eligible while performing conflict from fields.
  const matches = ARTICLE_UNIQUE_CONFLICTS.filter(conflict => (
    fieldNames.has(conflict.identity) &&
    [...fieldNames].every(field => conflict.fields.includes(field))
  ));

  // Selects the result based on whether matches count is 1.
  return matches.length === 1 ? matches[0] : null;
};

// This function maps one recognized article constraint to one exact winner lookup.
export const buildConcurrentWinnerLookup = ({ error, articleValues }) => {
  // Derives the metadata through unique error metadata while building concurrent winner lookup.
  const metadata = uniqueErrorMetadata(error);
  // Keeps the named matches entries eligible while building concurrent winner lookup.
  const namedMatches = ARTICLE_UNIQUE_CONFLICTS.filter(conflict => (
    metadataContainsConstraint(metadata, conflict.constraint)
  ));
  // Selects the conflict based on whether named matches count is 1.
  const conflict = namedMatches.length === 1
    ? namedMatches[0]
    : namedMatches.length === 0
      ? conflictFromFields(error)
      : null;

  // Returns no result when conflict is unavailable.
  if (!conflict) return null;
  // Rejects conflict recovery when any required lookup field is missing.
  if (conflict.fields.some(field => !articleValues?.[field])) return null;

  // Maps source values into the result produced while building concurrent winner lookup.
  return {
    identity: conflict.identity,
    constraint: conflict.constraint,
    where: Object.fromEntries(
      conflict.fields.map(field => [field, articleValues[field]])
    )
  };
};

// This function reloads the exact article that won a recognized unique-key insert race.
const findConcurrentWinner = async ({ articleValues, error }) => {
  // Builds the concurrent winner lookup while finding concurrent winner.
  const conflict = buildConcurrentWinnerLookup({ error, articleValues });
  // Returns no result when conflict is unavailable.
  if (!conflict) return null;

  // Loads the article needed while finding concurrent winner.
  const article = await Article.findOne({ where: conflict.where });
  // Selects the result based on whether article is available.
  return article ? { article, conflict } : null;
};

/* ======================================================
   Save article & tags to database
   ------------------------------------------------------
   Persists article and generated tags
====================================================== */
async function saveArticle(
  feed,
  data,
  analysis,
  actionResult,
  execution = {},
  articleEnrichment = null
) {
  throwIfExecutionExpired(execution);
  // Validate userId presence
  if (!feed || !feed.userId) {
    throw new Error('Invalid feed: userId is missing. Cannot save article without valid userId.');
  }

  // Derives the is discard match required while performing save article.
  const isDiscardMatch = actionResult?.shouldDiscard === true;
  // Selects the article values based on whether is discard match is available.
  const articleValues = buildArticlePersistenceValues(feed, {
    ...data,
    status: actionResult.status,
    filteredInd: isDiscardMatch,
    favoriteInd: isDiscardMatch ? undefined : actionResult.favoriteInd,
    clickedAmount: isDiscardMatch ? undefined : actionResult.clickedAmount,
    hotInd: isDiscardMatch ? undefined : data.hotInd ?? actionResult.hotInd,
    hotlinks: isDiscardMatch ? undefined : data.hotlinks,
    contentSummaryBullets: analysis?.contentSummaryBullets,
    isOfficialSource: data.isOfficialSource,
    officialOrganization: data.officialOrganization,
    advertisementScore: analysis?.advertisementScore,
    ...buildActionScoreOverrideIndicators(actionResult),
    sentimentScore: analysis?.sentimentScore,
    qualityScore: analysis?.qualityScore,
    publishedAt: data.publishedAt || new Date()
  });
  try {
    // Derives the article through transaction while performing save article.
    const article = await sequelize.transaction(async transaction => {
      throwIfExecutionExpired(execution);
      await assertExecutionLeaseOwnership(execution, { transaction });
      // Performs the create operation while performing save article.
      const createdArticle = await Article.create(articleValues, { transaction });
      throwIfExecutionExpired(execution);

      // Handles the case where is discard match is unavailable.
      if (!isDiscardMatch) {
        await saveArticleTags({
          articleId: createdArticle.id,
          userId: feed.userId,
          inferredTags: analysis.tags,
          providerTags: data.categories,
          feedTags: feed.feedTags,
          ruleTags: actionResult.tags,
          transaction
        });
        throwIfExecutionExpired(execution);
      }

      if (articleEnrichment) {
        await enqueueArticleEnrichmentJob({
          article: createdArticle,
          userId: feed.userId,
          ...articleEnrichment,
          transaction
        });
        throwIfExecutionExpired(execution);
      }

      return createdArticle;
    });

    return { article, created: true };
  } catch (err) {
    throwIfExecutionExpired(execution);
    // Rejects processing when err name is not sequelize unique constraint error.
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;

    // The failed transaction has rolled back; reload the concurrently committed winner.
    const recovery = await findConcurrentWinner({
      articleValues,
      error: err
    });
    // Rejects processing when recovery is unavailable.
    if (!recovery) throw err;

    return {
      article: recovery.article,
      created: false,
      conflict: {
        identity: recovery.conflict.identity,
        constraint: recovery.conflict.constraint,
        recovered: true
      }
    };
  }
}

export default saveArticle;
