import db from '../../../models/index.js';
import buildArticlePersistenceValues, {
  selectMutableArticleSourceValues
} from './buildArticlePersistenceValues.js';
import { replaceArticleDerivedTags } from './tags.js';

const { Article, sequelize } = db;

const CONTENT_FIELDS = [
  'contentOriginal',
  'contentHtml',
  'contentText',
  'contentSourceHash',
  'contentTextHash',
  'language'
];
const URL_FIELDS = ['url', 'urlHash', 'normalizedUrl', 'normalizedUrlHash'];
const LEAD_IMAGE_FIELDS = [
  'imageUrl',
  'imageWidth',
  'imageHeight',
  'imageMimeType',
  'imageSource'
];
const PUBLISHED_FIELDS = ['published', 'publishedSource', 'publishInferred'];

// This function reads a stored value from a Sequelize article or a plain test object.
const storedValue = (article, field) => typeof article.getDataValue === 'function'
  ? article.getDataValue(field)
  : article[field];

// This function prevents direct reconciliation from crossing user or feed ownership boundaries.
const validateSuppliedArticleOwnership = (feed, article) => {
  const articleId = storedValue(article, 'id') ?? 'unknown';

  if (storedValue(article, 'userId') !== feed.userId) {
    throw new Error(`Cannot reconcile article ${articleId}: user ownership does not match the feed.`);
  }
  if (storedValue(article, 'feedId') !== feed.id) {
    throw new Error(`Cannot reconcile article ${articleId}: feed ownership does not match.`);
  }
};

// This function reports whether an incoming feed value contains meaningful data.
const hasIncomingValue = incoming => incoming !== null &&
  incoming !== undefined &&
  (typeof incoming !== 'string' || incoming.trim() !== '');

// This function prefers meaningful incoming feed data and otherwise preserves stored data.
const preferIncomingValue = (incoming, existing) => hasIncomingValue(incoming)
  ? incoming
  : existing;

// This function recursively sorts object keys for deterministic structured comparisons.
const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableValue(value[key])])
  );
};

// This function normalizes persisted values before deterministic change comparison.
const comparableValue = (field, value) => {
  if (PUBLISHED_FIELDS.includes(field) && field !== 'publishInferred') {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  if (field === 'media') return JSON.stringify(stableValue(value ?? null));
  return value ?? null;
};

// This function returns the exact persisted source fields that changed.
const changedFieldsBetween = (incoming, stored) => Object.keys(incoming)
  .filter(field => comparableValue(field, incoming[field]) !== comparableValue(field, stored[field]));

// This function creates the explicit deterministic change classification.
const classifyChanges = changedFields => {
  const changed = field => changedFields.includes(field);
  const anyChanged = fields => fields.some(changed);
  const titleChanged = changed('title');
  const descriptionChanged = changed('description');
  const authorChanged = changed('author');
  const publishedChanged = anyChanged(PUBLISHED_FIELDS);

  return {
    contentChanged: anyChanged(CONTENT_FIELDS),
    titleChanged,
    descriptionChanged,
    authorChanged,
    publishedChanged,
    metadataChanged: titleChanged || descriptionChanged || authorChanged || publishedChanged,
    urlChanged: anyChanged(URL_FIELDS),
    mediaChanged: changed('media'),
    leadImageChanged: anyChanged(LEAD_IMAGE_FIELDS),
    changedFields
  };
};

// This function normalizes incoming sparse source data against one stored article.
const buildResolvedSourceValues = (feed, article, data) => {
  const hasIncomingContentOriginal = hasIncomingValue(data.contentOriginal);
  const hasIncomingContentHtml = hasIncomingValue(data.contentHtml);
  const hasIncomingPublished = hasIncomingValue(data.published);
  const storedUrl = storedValue(article, 'url');
  const incomingUrl = data.link || data.url;
  const resolvedUrl = preferIncomingValue(incomingUrl, storedUrl);
  const resolvedNormalizedUrl = hasIncomingValue(data.normalizedUrl)
    ? data.normalizedUrl
    : hasIncomingValue(incomingUrl)
      ? null
      : storedValue(article, 'normalizedUrl');
  const contentOriginal = preferIncomingValue(
    data.contentOriginal,
    storedValue(article, 'contentOriginal')
  );
  const contentHtml = preferIncomingValue(
    data.contentHtml,
    storedValue(article, 'contentHtml')
  );
  const contentText = preferIncomingValue(data.contentText, storedValue(article, 'contentText'));
  let contentTextHash = storedValue(article, 'contentTextHash');
  if (hasIncomingValue(data.contentTextHash)) {
    contentTextHash = data.contentTextHash;
  } else if (hasIncomingContentHtml) {
    contentTextHash = null;
  }
  const contentSourceHash = hasIncomingContentOriginal
    ? data.contentSourceHash || null
    : storedValue(article, 'contentSourceHash');
  const incomingLeadImage = typeof data.leadImage === 'string'
    ? { url: data.leadImage }
    : data.leadImage;
  const storedLeadImage = {
    url: storedValue(article, 'imageUrl'),
    width: storedValue(article, 'imageWidth'),
    height: storedValue(article, 'imageHeight'),
    mimeType: storedValue(article, 'imageMimeType'),
    source: storedValue(article, 'imageSource')
  };
  const selectedLeadImage = hasIncomingValue(incomingLeadImage?.url)
    ? {
        url: incomingLeadImage.url,
        width: incomingLeadImage.width ?? null,
        height: incomingLeadImage.height ?? null,
        mimeType: incomingLeadImage.mimeType || null,
        source: incomingLeadImage.source || null
      }
    : storedLeadImage;

  const incomingValues = buildArticlePersistenceValues(feed, {
    ...data,
    link: resolvedUrl,
    normalizedUrl: resolvedNormalizedUrl,
    media: preferIncomingValue(data.media, storedValue(article, 'media')),
    leadImage: selectedLeadImage,
    title: preferIncomingValue(data.title, storedValue(article, 'title')),
    author: preferIncomingValue(data.author, storedValue(article, 'author')),
    description: preferIncomingValue(data.description, storedValue(article, 'description')),
    contentOriginal,
    contentHtml,
    contentText,
    language: preferIncomingValue(data.language, storedValue(article, 'language')),
    published: preferIncomingValue(data.published, storedValue(article, 'published')),
    publishedSource: hasIncomingPublished
      ? data.publishedSource || null
      : storedValue(article, 'publishedSource'),
    publishInferred: hasIncomingPublished
      ? Boolean(data.publishInferred)
      : storedValue(article, 'publishInferred'),
    contentTextHash,
    contentSourceHash
  });

  return selectMutableArticleSourceValues(incomingValues);
};

// This function maps stored article source state through the canonical persistence mapper.
const buildStoredSourceValues = (feed, article) => selectMutableArticleSourceValues(
  buildArticlePersistenceValues(feed, {
    link: storedValue(article, 'url'),
    normalizedUrl: storedValue(article, 'normalizedUrl'),
    leadImage: {
      url: storedValue(article, 'imageUrl'),
      width: storedValue(article, 'imageWidth'),
      height: storedValue(article, 'imageHeight'),
      mimeType: storedValue(article, 'imageMimeType'),
      source: storedValue(article, 'imageSource')
    },
    title: storedValue(article, 'title'),
    author: storedValue(article, 'author'),
    description: storedValue(article, 'description'),
    contentOriginal: storedValue(article, 'contentOriginal'),
    contentHtml: storedValue(article, 'contentHtml'),
    contentText: storedValue(article, 'contentText'),
    contentSourceHash: storedValue(article, 'contentSourceHash'),
    contentTextHash: storedValue(article, 'contentTextHash'),
    language: storedValue(article, 'language'),
    media: storedValue(article, 'media'),
    published: storedValue(article, 'published'),
    publishedSource: storedValue(article, 'publishedSource'),
    publishInferred: storedValue(article, 'publishInferred')
  })
);

// This function classifies a prospective update without mutating the matched article.
async function updateArticle(feed, data, options = {}) {
  if (!feed?.id || !feed?.userId) {
    return { article: null, matched: false, changed: false, changes: null };
  }

  const suppliedArticle = options.article || null;
  let article = suppliedArticle;
  if (!article) {
    if (!data?.externalId || !data?.externalIdType) {
      return { article: null, matched: false, changed: false, changes: null };
    }

    article = await Article.findOne({
      where: {
        userId: feed.userId,
        feedId: feed.id,
        externalId: data.externalId,
        externalIdType: data.externalIdType
      }
    });
  }

  if (!article) {
    return { article: null, matched: false, changed: false, changes: null };
  }
  if (suppliedArticle) validateSuppliedArticleOwnership(feed, article);

  const updateValues = buildResolvedSourceValues(feed, article, data);
  const storedValues = buildStoredSourceValues(feed, article);
  const changedFields = changedFieldsBetween(updateValues, storedValues);
  const changes = classifyChanges(changedFields);

  return {
    article,
    matched: true,
    changed: changedFields.length > 0,
    changes,
    updateValues
  };
}

// This function atomically applies classified source, derived-field, and tag updates.
export const applyArticleUpdate = async ({
  updatePlan,
  derivedValues = {},
  tagUpdates = null,
  userId
}) => sequelize.transaction(async transaction => {
  await updatePlan.article.update({
    ...updatePlan.updateValues,
    ...derivedValues
  }, { transaction });

  if (tagUpdates) {
    await replaceArticleDerivedTags({
      articleId: updatePlan.article.id,
      userId,
      ...tagUpdates,
      transaction
    });
  }

  return updatePlan.article;
});

export default updateArticle;
