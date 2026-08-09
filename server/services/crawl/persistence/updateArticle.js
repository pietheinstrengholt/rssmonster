import { createHash } from 'node:crypto';
import db from '../../../models/index.js';
import buildArticlePersistenceValues, {
  normalizeArticleDate,
  selectMutableArticleSourceValues
} from './buildArticlePersistenceValues.js';
import { replaceArticleDerivedTags } from './tags.js';
import {
  assertExecutionLeaseOwnership,
  throwIfExecutionExpired
} from '../../feeds/executionDeadline.js';
import {
  isStableArticleIdentity,
  resolvePublisherUrlIdentity
} from '../extraction/articleIdentityResolver.js';

// Provides the shared dependencies used by this service.
const { Article, sequelize } = db;

// Defines the raw source fields enforced by this service.
const RAW_SOURCE_FIELDS = ['contentOriginal', 'contentSourceHash'];
// Defines the content fields enforced by this service.
const CONTENT_FIELDS = [
  'contentHtml',
  'contentText',
  'contentTextHash',
  'descriptionHtml',
  'descriptionText',
  'language'
];
// Defines the url fields enforced by this service.
const URL_FIELDS = ['url', 'urlHash', 'normalizedUrl', 'normalizedUrlHash'];
// Defines identity fields changed only while upgrading a legacy crawl identity.
const IDENTITY_FIELDS = ['externalId', 'externalIdType'];
// Defines the lead image fields enforced by this service.
const LEAD_IMAGE_FIELDS = [
  'imageUrl',
  'imageWidth',
  'imageHeight',
  'imageMimeType',
  'imageSource'
];
// Defines the published fields enforced by this service.
const PUBLISHED_FIELDS = ['publishedAt', 'publishedSource', 'publishInferred'];
// Defines the content revision fields enforced by this service.
const CONTENT_REVISION_FIELDS = new Set([
  'contentHtml',
  'contentText',
  'contentTextHash',
  'title',
  'description'
]);
// Defines extractor-owned fields that may change when visible-text normalization improves.
const VISIBLE_TEXT_EXTRACTION_FIELDS = new Set(['contentText', 'contentTextHash']);
// Defines fields populated when legacy raw descriptions gain sanitized derivatives.
const DESCRIPTION_DERIVATION_FIELDS = new Set([
  'descriptionHtml',
  'descriptionText',
  'contentHtml',
  'contentText',
  'contentTextHash',
  'language'
]);
// Defines the fingerprint fields enforced by this service.
const FINGERPRINT_FIELDS = [
  'contentOriginal',
  'contentHtml',
  'contentText',
  'description',
  'descriptionHtml',
  'descriptionText',
  'media'
];
// Defines the comparable media fields enforced by this service.
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
  'items',
  'sources',
  'tracks',
  'kind',
  'language',
  'label',
  'default'
]);

// This function reads a stored value from a Sequelize article or a plain test object.
const storedValue = (article, field) => typeof article.getDataValue === 'function'
  ? article.getDataValue(field)
  : article[field];

// This function prevents direct reconciliation from crossing user or feed ownership boundaries.
const validateSuppliedArticleOwnership = (feed, article) => {
  // Derives the article id required while performing validate supplied article ownership.
  const articleId = storedValue(article, 'id') ?? 'unknown';

  // Rejects processing when stored value is not feed user id.
  if (storedValue(article, 'userId') !== feed.userId) {
    throw new Error(`Cannot reconcile article ${articleId}: user ownership does not match the feed.`);
  }
  // Rejects processing when stored value is not feed id.
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
  // Returns early when value is an array.
  if (Array.isArray(value)) return value.map(stableValue);
  // Preserves primitive and Date values without recursive key sorting.
  if (!value || typeof value !== 'object' || value instanceof Date) return value;

  // Maps source values into the result produced while performing stable value.
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableValue(value[key])])
  );
};

// This function selects predictable media attributes and ignores volatile or unknown metadata.
const comparableMediaValue = value => {
  // Returns early when value is an array.
  if (Array.isArray(value)) return value.map(comparableMediaValue);
  // Returns early when value is unavailable or value is not object.
  if (!value || typeof value !== 'object') return value ?? null;

  // Filters source values to the entries eligible while performing comparable media value.
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
  // Handles the case where published fields contains field and field is not publish inferred.
  if (PUBLISHED_FIELDS.includes(field) && field !== 'publishInferred') {
    // Returns no result when value is unavailable.
    if (!value) return null;
    // Normalizes the date used while performing comparable value.
    const date = new Date(value);
    // Selects the result based on whether get time is na n.
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  // Returns early when field is media.
  if (field === 'media') return JSON.stringify(stableValue(comparableMediaValue(value)));
  // Returns early when field is content html.
  if (field === 'contentHtml') return comparableContentHtml(value) ?? null;
  return value ?? null;
};

// This function returns the exact persisted source fields that changed.
const changedFieldsBetween = (incoming, stored) => Object.keys(incoming)
  .filter(field => comparableValue(field, incoming[field]) !== comparableValue(field, stored[field]));

// This function summarizes large publisher values without exposing article contents in logs.
const diagnosticValue = (field, value) => {
  // Derives the comparable through comparable value while performing diagnostic value.
  const comparable = comparableValue(field, value);
  // Returns early when comparable is value or fingerprint fields does not contain field.
  if (comparable === null || !FINGERPRINT_FIELDS.includes(field)) return comparable;

  // Selects the serialized based on whether comparable is string.
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
  // Returns an empty result when stored is incoming.
  if (stored === incoming) return [];

  // Derives the stored is object required while performing media differences.
  const storedIsObject = stored !== null && typeof stored === 'object';
  // Derives the incoming is object required while performing media differences.
  const incomingIsObject = incoming !== null && typeof incoming === 'object';
  // Returns an empty result when stored is object is unavailable or incoming is object is unavailable.
  if (!storedIsObject || !incomingIsObject) {
    return [{
      path,
      stored: diagnosticMediaScalar(stored),
      incoming: diagnosticMediaScalar(incoming)
    }];
  }

  // Derives the keys through sort while performing media differences.
  const keys = [...new Set([...Object.keys(stored), ...Object.keys(incoming)])].sort();
  // Runs the callback required while performing media differences.
  return keys.flatMap(key => mediaDifferences(stored[key], incoming[key], `${path}.${key}`));
};

// This function logs enough detail to diagnose publisher fields that change on every crawl.
const logArticleUpdate = ({ feed, article, data, changedFields, storedValues, updateValues }) => {
  // Derives the differences through from entries while performing log article update.
  const differences = Object.fromEntries(changedFields.map(field => [field, {
    stored: diagnosticValue(field, storedValues[field]),
    incoming: diagnosticValue(field, updateValues[field])
  }]));
  // Selects the structured media differences based on whether changed fields contains media.
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
  // Performs the changed operation.
  const changed = field => changedFields.includes(field);
  // Performs the any changed operation.
  const anyChanged = fields => fields.some(changed);
  // Derives the title changed through changed while performing classify changes.
  const titleChanged = changed('title');
  // Derives the description changed through changed while performing classify changes.
  const descriptionChanged = changed('description');
  // Derives the author changed through changed while performing classify changes.
  const authorChanged = changed('author');
  // Derives the published changed through any changed while performing classify changes.
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
    identityChanged: anyChanged(IDENTITY_FIELDS),
    changedFields
  };
};

// This function checks that a legacy suffix match also names the same complete URL.
const legacyArticleUrlMatches = (article, data) => {
  // Selects the incoming normalized url required while checking legacy article url matches.
  const incomingNormalizedUrl = data.normalizedUrl || data.link || data.url;
  // Selects the stored normalized url required while checking legacy article url matches.
  const storedNormalizedUrl = storedValue(article, 'normalizedUrl') || storedValue(article, 'url');
  return Boolean(incomingNormalizedUrl && storedNormalizedUrl) &&
    incomingNormalizedUrl === storedNormalizedUrl;
};

// This function finds an unambiguous pre-precedence identity that can be upgraded in place.
const findLegacyIdentityAlias = async (feed, data) => {
  // Returns no result unless the incoming identity is a stable format-provided ID.
  if (!isStableArticleIdentity(data)) return null;
  // Selects the incoming complete URL required while finding legacy identity alias.
  const incomingUrl = data.normalizedUrl || data.link || data.url;
  // Returns no result when incoming url is unavailable.
  if (!incomingUrl) return null;

  // First recovers rows stored under the parser's former normalized-URL fallback.
  const normalizedUrlArticle = await Article.findOne({
    where: {
      userId: feed.userId,
      feedId: feed.id,
      externalId: data.normalizedUrl || incomingUrl,
      externalIdType: 'normalized-url'
    }
  });
  // Returns early when normalized url article is available.
  if (normalizedUrlArticle) return normalizedUrlArticle;

  // Resolves the old suffix identity required while finding legacy identity alias.
  const suffixIdentity = resolvePublisherUrlIdentity(incomingUrl);
  // Returns no result when suffix identity is unavailable.
  if (!suffixIdentity) return null;
  // Loads the suffix article needed while finding legacy identity alias.
  const suffixArticle = await Article.findOne({
    where: {
      userId: feed.userId,
      feedId: feed.id,
      ...suffixIdentity
    }
  });

  // A suffix alone is collision-prone; migrate only when the complete URL also agrees.
  return suffixArticle && legacyArticleUrlMatches(suffixArticle, data) ? suffixArticle : null;
};

// This function distinguishes body, title, or description revisions from metadata corrections.
const confirmsContentRevision = changedFields => changedFields.some(
  field => CONTENT_REVISION_FIELDS.has(field)
);

// This function identifies a text repair derived from byte-identical publisher source.
const isVisibleTextExtractionRepair = ({ changedFields, incoming, stored }) =>
  changedFields.length > 0 &&
  changedFields.every(field => VISIBLE_TEXT_EXTRACTION_FIELDS.has(field)) &&
  Boolean(incoming.contentSourceHash) &&
  incoming.contentSourceHash === stored.contentSourceHash;

// This function identifies safe derivative backfills for an unchanged raw description.
const isDescriptionDerivationRepair = ({ changedFields, incoming, stored }) =>
  changedFields.length > 0 &&
  changedFields.some(field => field === 'descriptionHtml' || field === 'descriptionText') &&
  changedFields.every(field => DESCRIPTION_DERIVATION_FIELDS.has(field)) &&
  Boolean(incoming.description) &&
  incoming.description === stored.description;

// This function returns a valid whole-second article timestamp or null.
const validArticleDate = value => {
  // Normalizes the normalized before performing valid article date.
  const normalized = normalizeArticleDate(value);
  // Returns no result when normalized is unavailable or get time is na n.
  if (!(normalized instanceof Date) || Number.isNaN(normalized.getTime())) return null;
  return normalized;
};

// This function advances the best-known modification time for a confirmed content revision.
const resolveConfirmedModifiedAt = (article, incomingModifiedAt) => {
  // Derives the incoming through valid article date while resolving confirmed modified at.
  const incoming = validArticleDate(incomingModifiedAt);
  // Derives the stored through valid article date while resolving confirmed modified at.
  const stored = validArticleDate(storedValue(article, 'modifiedAt'));
  // Derives the detected through valid article date while resolving confirmed modified at.
  const detected = validArticleDate(new Date());

  // Returns early when incoming is available and stored is unavailable or incoming exceeds stored.
  if (incoming && (!stored || incoming > stored)) return incoming;
  // Returns early when detected is available and stored is unavailable or detected exceeds stored.
  if (detected && (!stored || detected > stored)) return detected;
  return stored;
};

// This function normalizes incoming sparse source data against one stored article.
const buildResolvedSourceValues = (feed, article, data) => {
  // Derives the has incoming content original through has incoming value while building resolved source values.
  const hasIncomingContentOriginal = hasIncomingValue(data.contentOriginal);
  // Derives the has incoming content html through has incoming value while building resolved source values.
  const hasIncomingContentHtml = hasIncomingValue(data.contentHtml);
  // Derives the has incoming published through has incoming value while building resolved source values.
  const hasIncomingPublished = hasIncomingValue(data.publishedAt);
  // Derives the has stored published through has incoming value while building resolved source values.
  const hasStoredPublished = hasIncomingValue(storedValue(article, 'publishedAt'));
  // Derives the should use incoming published required while building resolved source values.
  const shouldUseIncomingPublished = hasIncomingPublished && (
    !data.publishInferred || !hasStoredPublished
  );
  // Derives the stored url through stored value while building resolved source values.
  const storedUrl = storedValue(article, 'url');
  // Derives the incoming url required while building resolved source values.
  const incomingUrl = data.link || data.url;
  // Derives the resolved url through prefer incoming value while building resolved source values.
  const resolvedUrl = preferIncomingValue(incomingUrl, storedUrl);
  // Selects the resolved normalized url based on whether has incoming value succeeds.
  const resolvedNormalizedUrl = hasIncomingValue(data.normalizedUrl)
    ? data.normalizedUrl
    : hasIncomingValue(incomingUrl)
      ? null
      : storedValue(article, 'normalizedUrl');
  // Derives the content original through prefer incoming value while building resolved source values.
  const contentOriginal = preferIncomingValue(
    data.contentOriginal,
    storedValue(article, 'contentOriginal')
  );
  // Derives the content html through prefer incoming value while building resolved source values.
  const contentHtml = preferIncomingValue(
    data.contentHtml,
    storedValue(article, 'contentHtml')
  );
  // Derives the content text through prefer incoming value while building resolved source values.
  const contentText = preferIncomingValue(data.contentText, storedValue(article, 'contentText'));
  // Derives the content text hash through stored value while building resolved source values.
  let contentTextHash = storedValue(article, 'contentTextHash');
  // Handles the case where has incoming value succeeds.
  if (hasIncomingValue(data.contentTextHash)) {
    contentTextHash = data.contentTextHash;
  // Handles the case where has incoming content html is available.
  } else if (hasIncomingContentHtml) {
    contentTextHash = null;
  }
  // Selects the content source hash based on whether has incoming content original is available.
  const contentSourceHash = hasIncomingContentOriginal
    ? data.contentSourceHash || null
    : storedValue(article, 'contentSourceHash');
  // Selects the incoming lead image based on whether data is string.
  const incomingLeadImage = typeof data.leadImage === 'string'
    ? { url: data.leadImage }
    : data.leadImage;
  // Builds the stored lead image assembled while building resolved source values.
  const storedLeadImage = {
    url: storedValue(article, 'imageUrl'),
    width: storedValue(article, 'imageWidth'),
    height: storedValue(article, 'imageHeight'),
    mimeType: storedValue(article, 'imageMimeType'),
    source: storedValue(article, 'imageSource')
  };
  // Selects the selected lead image based on whether has incoming value succeeds.
  const selectedLeadImage = hasIncomingValue(incomingLeadImage?.url)
    ? {
        url: incomingLeadImage.url,
        width: incomingLeadImage.width ?? null,
        height: incomingLeadImage.height ?? null,
        mimeType: incomingLeadImage.mimeType || null,
        source: incomingLeadImage.source || null
      }
    : storedLeadImage;

  // Selects the incoming values based on whether should use incoming published is available.
  const incomingValues = buildArticlePersistenceValues(feed, {
    ...data,
    link: resolvedUrl,
    normalizedUrl: resolvedNormalizedUrl,
    media: preferIncomingValue(data.media, storedValue(article, 'media')),
    leadImage: selectedLeadImage,
    title: preferIncomingValue(data.title, storedValue(article, 'title')),
    author: preferIncomingValue(data.author, storedValue(article, 'author')),
    description: preferIncomingValue(data.description, storedValue(article, 'description')),
    descriptionHtml: preferIncomingValue(
      data.descriptionHtml,
      storedValue(article, 'descriptionHtml')
    ),
    descriptionText: preferIncomingValue(
      data.descriptionText,
      storedValue(article, 'descriptionText')
    ),
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
    descriptionHtml: storedValue(article, 'descriptionHtml'),
    descriptionText: storedValue(article, 'descriptionText'),
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
  const execution = options.execution || {};
  throwIfExecutionExpired(execution);
  // Returns early when id is unavailable or user id is unavailable.
  if (!feed?.id || !feed?.userId) {
    return { article: null, matched: false, changed: false, changes: null };
  }

  // Derives the supplied article required while updating article.
  const suppliedArticle = options.article || null;
  let article = suppliedArticle;
  let matchedLegacyIdentityAlias = false;
  // Handles the case where article is unavailable.
  if (!article) {
    // Returns early when external id is unavailable or external id type is unavailable.
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
    throwIfExecutionExpired(execution);
    // Falls back to a narrowly constrained alias lookup for identities stored by old crawls.
    if (!article) {
      article = await findLegacyIdentityAlias(feed, data);
      matchedLegacyIdentityAlias = Boolean(article);
      throwIfExecutionExpired(execution);
    }
  }

  // Returns early when article is unavailable.
  if (!article) {
    return { article: null, matched: false, changed: false, changes: null };
  }
  // Handles the case where supplied article is available.
  if (suppliedArticle) validateSuppliedArticleOwnership(feed, article);

  // Builds the resolved source values while updating article.
  const updateValues = buildResolvedSourceValues(feed, article, data);
  // Builds the stored source values while updating article.
  const storedValues = buildStoredSourceValues(feed, article);
  // Derives the source changed fields through changed fields between while updating article.
  const sourceChangedFields = changedFieldsBetween(updateValues, storedValues);
  // Derives the identity changed required while updating article.
  const identityChanged = matchedLegacyIdentityAlias && isStableArticleIdentity(data) && (
    storedValue(article, 'externalId') !== data.externalId ||
    storedValue(article, 'externalIdType') !== data.externalIdType
  );
  // Upgrades a matched legacy alias to the authoritative stable feed identity.
  if (identityChanged) {
    updateValues.externalId = data.externalId;
    updateValues.externalIdType = data.externalIdType;
    sourceChangedFields.push(...IDENTITY_FIELDS);
  }
  // Keeps the meaningful changed fields entries eligible while updating article.
  const meaningfulChangedFields = sourceChangedFields
    .filter(field => !RAW_SOURCE_FIELDS.includes(field));
  // Detects extractor-only repairs before classifying publisher revisions.
  const visibleTextExtractionRepair = isVisibleTextExtractionRepair({
    changedFields: meaningfulChangedFields,
    incoming: updateValues,
    stored: storedValues
  });
  // Detects description derivative backfills without treating them as publisher revisions.
  const descriptionDerivationRepair = isDescriptionDerivationRepair({
    changedFields: meaningfulChangedFields,
    incoming: updateValues,
    stored: storedValues
  });
  const derivedContentRepair = visibleTextExtractionRepair || descriptionDerivationRepair;
  // Derives the changes through classify changes while updating article.
  const changes = classifyChanges(meaningfulChangedFields);
  changes.contentChanged = changes.contentChanged && !derivedContentRepair;
  changes.visibleTextExtractionRepair = visibleTextExtractionRepair;
  changes.descriptionDerivationRepair = descriptionDerivationRepair;

  // Handles the case where confirms content revision succeeds.
  if (!derivedContentRepair && confirmsContentRevision(meaningfulChangedFields)) {
    updateValues.modifiedAt = resolveConfirmedModifiedAt(article, data.modifiedAt);
  }

  // Logs meaningful article changes only when the caller explicitly enables diagnostics.
  if (options.logArticleUpdates === true && meaningfulChangedFields.length > 0) {
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
  userId,
  execution = {}
}) => sequelize.transaction(async transaction => {
  throwIfExecutionExpired(execution);
  await assertExecutionLeaseOwnership(execution, { transaction });
  await updatePlan.article.update({
    ...updatePlan.updateValues,
    ...derivedValues
  }, { transaction });
  throwIfExecutionExpired(execution);

  // Handles the case where tag updates is available.
  if (tagUpdates) {
    await replaceArticleDerivedTags({
      articleId: updatePlan.article.id,
      userId,
      ...tagUpdates,
      transaction
    });
    throwIfExecutionExpired(execution);
  }

  return updatePlan.article;
});

export default updateArticle;
