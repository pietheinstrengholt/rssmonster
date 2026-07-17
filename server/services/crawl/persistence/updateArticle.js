import { createHash } from 'node:crypto';
import db from '../../../models/index.js';
import buildArticlePersistenceValues, {
  normalizeArticleDate,
  selectMutableArticleSourceValues
} from './buildArticlePersistenceValues.js';
import { replaceArticleDerivedTags } from './tags.js';

const { Article, sequelize } = db;

const RAW_SOURCE_FIELDS = ['contentOriginal', 'contentSourceHash'];
const CONTENT_FIELDS = [
  'contentHtml',
  'contentText',
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
const PUBLISHED_FIELDS = ['publishedAt', 'publishedSource', 'publishInferred'];
const CONTENT_REVISION_FIELDS = new Set([
  'contentHtml',
  'contentText',
  'contentTextHash',
  'title',
  'description'
]);
const FINGERPRINT_FIELDS = [
  'contentOriginal',
  'contentHtml',
  'contentText',
  'description',
  'media'
];
const COMPARABLE_MEDIA_FIELDS = new Set([
  'type',
  'provider',
  'externalId',
  'url',
  'embedUrl',
  'thumbnailUrl',
  'durationSeconds',
  'width',
  'height',
  'mimeType',
  'fileSize',
  'isLive',
  'items'
]);

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

// This function selects predictable media attributes and ignores volatile or unknown metadata.
const comparableMediaValue = value => {
  if (Array.isArray(value)) return value.map(comparableMediaValue);
  if (!value || typeof value !== 'object') return value ?? null;

  return Object.fromEntries(
    Object.keys(value)
      .filter(key => COMPARABLE_MEDIA_FIELDS.has(key))
      .sort()
      .map(key => [key, comparableMediaValue(value[key])])
  );
};

// This function removes temporary Kickstarter signatures while retaining stable video identities.
const comparableContentHtml = value => typeof value === 'string'
  ? value.replace(
      /https:\/\/v2\.kickstarter\.com\/\d+-[^/\s"'<>]+\/assets\//g,
      'https://v2.kickstarter.com/assets/'
    )
  : value;

// This function normalizes persisted values before deterministic change comparison.
const comparableValue = (field, value) => {
  if (PUBLISHED_FIELDS.includes(field) && field !== 'publishInferred') {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  if (field === 'media') return JSON.stringify(stableValue(comparableMediaValue(value)));
  if (field === 'contentHtml') return comparableContentHtml(value) ?? null;
  return value ?? null;
};

// This function returns the exact persisted source fields that changed.
const changedFieldsBetween = (incoming, stored) => Object.keys(incoming)
  .filter(field => comparableValue(field, incoming[field]) !== comparableValue(field, stored[field]));

// This function summarizes large publisher values without exposing article contents in logs.
const diagnosticValue = (field, value) => {
  const comparable = comparableValue(field, value);
  if (comparable === null || !FINGERPRINT_FIELDS.includes(field)) return comparable;

  const serialized = typeof comparable === 'string'
    ? comparable
    : JSON.stringify(comparable);

  return {
    length: serialized.length,
    sha256: createHash('sha256').update(serialized).digest('hex').slice(0, 16)
  };
};

// This function formats one scalar media value with its type for comparison diagnostics.
const diagnosticMediaScalar = value => ({
  type: value === null ? 'null' : typeof value,
  value: value ?? null
});

// This function returns the exact structured-media leaf values that differ.
const mediaDifferences = (stored, incoming, path = 'media') => {
  if (stored === incoming) return [];

  const storedIsObject = stored !== null && typeof stored === 'object';
  const incomingIsObject = incoming !== null && typeof incoming === 'object';
  if (!storedIsObject || !incomingIsObject) {
    return [{
      path,
      stored: diagnosticMediaScalar(stored),
      incoming: diagnosticMediaScalar(incoming)
    }];
  }

  const keys = [...new Set([...Object.keys(stored), ...Object.keys(incoming)])].sort();
  return keys.flatMap(key => mediaDifferences(stored[key], incoming[key], `${path}.${key}`));
};

// This function logs enough detail to diagnose publisher fields that change on every crawl.
const logArticleUpdate = ({ feed, article, data, changedFields, storedValues, updateValues }) => {
  const differences = Object.fromEntries(changedFields.map(field => [field, {
    stored: diagnosticValue(field, storedValues[field]),
    incoming: diagnosticValue(field, updateValues[field])
  }]));
  const structuredMediaDifferences = changedFields.includes('media')
    ? mediaDifferences(
        comparableMediaValue(storedValues.media),
        comparableMediaValue(updateValues.media)
      )
    : undefined;

  console.info('[CRAWL_ARTICLE_UPDATE]', JSON.stringify({
    articleId: storedValue(article, 'id'),
    feedId: feed.id,
    feedName: feed.feedName || null,
    externalIdType: data.externalIdType || storedValue(article, 'externalIdType') || null,
    externalId: data.externalId || storedValue(article, 'externalId') || null,
    changedFields,
    differences,
    mediaDifferences: structuredMediaDifferences
  }));
};

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

// This function distinguishes body, title, or description revisions from metadata corrections.
const confirmsContentRevision = changedFields => changedFields.some(
  field => CONTENT_REVISION_FIELDS.has(field)
);

// This function returns a valid whole-second article timestamp or null.
const validArticleDate = value => {
  const normalized = normalizeArticleDate(value);
  if (!(normalized instanceof Date) || Number.isNaN(normalized.getTime())) return null;
  return normalized;
};

// This function advances the best-known modification time for a confirmed content revision.
const resolveConfirmedModifiedAt = (article, incomingModifiedAt) => {
  const incoming = validArticleDate(incomingModifiedAt);
  const stored = validArticleDate(storedValue(article, 'modifiedAt'));
  const detected = validArticleDate(new Date());

  if (incoming && (!stored || incoming > stored)) return incoming;
  if (detected && (!stored || detected > stored)) return detected;
  return stored;
};

// This function normalizes incoming sparse source data against one stored article.
const buildResolvedSourceValues = (feed, article, data) => {
  const hasIncomingContentOriginal = hasIncomingValue(data.contentOriginal);
  const hasIncomingContentHtml = hasIncomingValue(data.contentHtml);
  const hasIncomingPublished = hasIncomingValue(data.publishedAt);
  const hasStoredPublished = hasIncomingValue(storedValue(article, 'publishedAt'));
  const shouldUseIncomingPublished = hasIncomingPublished && (
    !data.publishInferred || !hasStoredPublished
  );
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
    publishedAt: shouldUseIncomingPublished
      ? data.publishedAt
      : storedValue(article, 'publishedAt'),
    publishedSource: shouldUseIncomingPublished
      ? data.publishedSource || null
      : storedValue(article, 'publishedSource'),
    publishInferred: shouldUseIncomingPublished
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
    publishedAt: storedValue(article, 'publishedAt'),
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
  const sourceChangedFields = changedFieldsBetween(updateValues, storedValues);
  const meaningfulChangedFields = sourceChangedFields
    .filter(field => !RAW_SOURCE_FIELDS.includes(field));
  const changes = classifyChanges(meaningfulChangedFields);

  if (confirmsContentRevision(meaningfulChangedFields)) {
    updateValues.modifiedAt = resolveConfirmedModifiedAt(article, data.modifiedAt);
  }

  if (meaningfulChangedFields.length > 0) {
    logArticleUpdate({
      feed,
      article,
      data,
      changedFields: sourceChangedFields,
      storedValues,
      updateValues
    });
  }

  return {
    article,
    matched: true,
    changed: meaningfulChangedFields.length > 0,
    changes,
    sourceChangedFields,
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
