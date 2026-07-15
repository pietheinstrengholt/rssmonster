import db from '../../../models/index.js';
import { saveArticleTags } from './tags.js';
import { resolveOfficialSourceForArticle } from '../enrichment/officialSource.js';
import buildArticlePersistenceValues from './buildArticlePersistenceValues.js';

const { Article, sequelize } = db;

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
  const fieldNames = new Set([
    ...Object.keys(error?.fields || {}),
    ...(error?.errors || []).map(item => item?.path)
  ].filter(Boolean));
  const matches = ARTICLE_UNIQUE_CONFLICTS.filter(conflict => (
    fieldNames.has(conflict.identity) &&
    [...fieldNames].every(field => conflict.fields.includes(field))
  ));

  return matches.length === 1 ? matches[0] : null;
};

// This function maps one recognized article constraint to one exact winner lookup.
export const buildConcurrentWinnerLookup = ({ error, articleValues }) => {
  const metadata = uniqueErrorMetadata(error);
  const namedMatches = ARTICLE_UNIQUE_CONFLICTS.filter(conflict => (
    metadataContainsConstraint(metadata, conflict.constraint)
  ));
  const conflict = namedMatches.length === 1
    ? namedMatches[0]
    : namedMatches.length === 0
      ? conflictFromFields(error)
      : null;

  if (!conflict) return null;
  if (conflict.fields.some(field => !articleValues?.[field])) return null;

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
  const conflict = buildConcurrentWinnerLookup({ error, articleValues });
  if (!conflict) return null;

  const article = await Article.findOne({ where: conflict.where });
  return article ? { article, conflict } : null;
};

/* ======================================================
   Save article & tags to database
   ------------------------------------------------------
   Persists article and generated tags
====================================================== */
async function saveArticle(feed, data, analysis, actionResult) {
  // Validate userId presence
  if (!feed || !feed.userId) {
    throw new Error('Invalid feed: userId is missing. Cannot save article without valid userId.');
  }

  const isDiscardMatch = actionResult?.shouldDiscard === true;
  const officialSource = isDiscardMatch
    ? { isOfficialSource: false, officialOrganization: null }
    : await resolveOfficialSourceForArticle(feed.userId, data.link);
  const articleValues = buildArticlePersistenceValues(feed, {
    ...data,
    status: actionResult.status,
    filteredInd: isDiscardMatch,
    favoriteInd: isDiscardMatch ? undefined : actionResult.favoriteInd,
    clickedAmount: isDiscardMatch ? undefined : actionResult.clickedAmount,
    hotInd: isDiscardMatch ? undefined : data.hotInd ?? actionResult.hotInd,
    hotlinks: isDiscardMatch ? undefined : data.hotlinks,
    contentSummaryBullets: analysis?.contentSummaryBullets,
    isOfficialSource: officialSource.isOfficialSource,
    officialOrganization: officialSource.officialOrganization,
    advertisementScore: analysis?.advertisementScore,
    sentimentScore: analysis?.sentimentScore,
    qualityScore: analysis?.qualityScore,
    published: data.published || new Date()
  });
  try {
    const article = await sequelize.transaction(async transaction => {
      const createdArticle = await Article.create(articleValues, { transaction });

      if (!isDiscardMatch) {
        await saveArticleTags({
          articleId: createdArticle.id,
          userId: feed.userId,
          generatedTags: analysis.tags,
          feedTags: feed.feedTags,
          ruleTags: actionResult.tags,
          transaction
        });
      }

      return createdArticle;
    });

    return { article, created: true };
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;

    // The failed transaction has rolled back; reload the concurrently committed winner.
    const recovery = await findConcurrentWinner({
      articleValues,
      error: err
    });
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
