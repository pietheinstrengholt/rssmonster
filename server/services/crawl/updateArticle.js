import { createHash } from 'node:crypto';
import db from '../../models/index.js';
import normalizeUrl from './normalizeUrl.js';
import { hashOriginalContent, hashVisibleText } from '../../utils/articleContentHashes.js';

const { Article } = db;

// This function returns the stable SHA-256 hash for persisted article identity fields.
const hashValue = value => createHash('sha256').update(value || '').digest('hex');

// This function reads a stored value from a Sequelize article or a plain test object.
const storedValue = (article, field) => typeof article.getDataValue === 'function'
  ? article.getDataValue(field)
  : article[field];

// This function reports whether an incoming feed value contains meaningful data.
const hasIncomingValue = incoming => incoming !== null &&
  incoming !== undefined &&
  (typeof incoming !== 'string' || incoming.trim() !== '');

// This function prefers meaningful incoming feed data and otherwise preserves stored data.
const preferIncomingValue = (incoming, existing) => hasIncomingValue(incoming)
  ? incoming
  : existing;

// This function recursively sorts object keys for stable media comparison.
const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableValue(value[key])])
  );
};

// This function serializes media independently of object key insertion order.
const stableMedia = media => JSON.stringify(stableValue(media ?? null));

// This function normalizes stored and incoming publication dates for comparison.
const normalizeDate = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

// This function creates the mutable source fingerprint used to detect real feed changes.
const createSourceFingerprint = ({
  title,
  contentHash,
  description,
  url,
  imageUrl,
  media,
  published
}) => hashValue(JSON.stringify([
  title ?? null,
  contentHash ?? null,
  description ?? null,
  url ?? null,
  imageUrl ?? null,
  stableMedia(media),
  normalizeDate(published)
]));

// This function updates the mutable feed content of an existing externally identified article.
async function updateArticle(feed, data) {
  if (!feed?.id || !feed?.userId || !data?.externalId || !data?.externalIdType) {
    return { article: null, matched: false, changed: false };
  }

  const article = await Article.findOne({
    where: {
      userId: feed.userId,
      feedId: feed.id,
      externalId: data.externalId,
      externalIdType: data.externalIdType
    }
  });

  if (!article) return { article: null, matched: false, changed: false };

  const normalizedUrl = data.normalizedUrl || normalizeUrl(data.link);
  const contentOriginal = preferIncomingValue(
    data.contentOriginal,
    storedValue(article, 'contentOriginal')
  );
  const contentStripped = preferIncomingValue(
    data.contentStripped,
    storedValue(article, 'contentStripped')
  );
  const hasIncomingContentOriginal = hasIncomingValue(data.contentOriginal);
  const hasIncomingContentStripped = hasIncomingValue(data.contentStripped);
  const hasIncomingPublished = hasIncomingValue(data.published);
  let contentStrippedHash = storedValue(article, 'contentStrippedHash');
  if (hasIncomingValue(data.contentStrippedHash)) {
    contentStrippedHash = data.contentStrippedHash;
  } else if (hasIncomingContentStripped) {
    contentStrippedHash = hashVisibleText(data.contentText);
  }
  const contentHash = hasIncomingContentOriginal
    ? data.contentHash || hashOriginalContent(contentOriginal)
    : storedValue(article, 'contentHash');
  const updateValues = {
    media: preferIncomingValue(data.media, storedValue(article, 'media')),
    url: data.link,
    imageUrl: preferIncomingValue(data.leadImage, storedValue(article, 'imageUrl')),
    title: preferIncomingValue(data.title, storedValue(article, 'title')),
    author: preferIncomingValue(data.author, storedValue(article, 'author')),
    description: preferIncomingValue(data.description, storedValue(article, 'description')),
    contentOriginal,
    contentStripped,
    contentText: preferIncomingValue(data.contentText, storedValue(article, 'contentText')),
    published: preferIncomingValue(data.published, storedValue(article, 'published')),
    publishedSource: hasIncomingPublished
      ? data.publishedSource || null
      : storedValue(article, 'publishedSource'),
    publishInferred: hasIncomingPublished
      ? Boolean(data.publishInferred)
      : storedValue(article, 'publishInferred'),
    urlHash: hashValue(data.link),
    normalizedUrl,
    normalizedUrlHash: hashValue(normalizedUrl),
    contentStrippedHash,
    contentHash
  };
  const incomingFingerprint = createSourceFingerprint(updateValues);
  const storedFingerprint = createSourceFingerprint({
    title: storedValue(article, 'title'),
    contentHash: storedValue(article, 'contentHash'),
    description: storedValue(article, 'description'),
    url: storedValue(article, 'url'),
    imageUrl: storedValue(article, 'imageUrl'),
    media: storedValue(article, 'media'),
    published: storedValue(article, 'published')
  });

  if (incomingFingerprint === storedFingerprint) {
    return { article, matched: true, changed: false };
  }

  await article.update(updateValues);

  return { article, matched: true, changed: true };
}

export default updateArticle;
