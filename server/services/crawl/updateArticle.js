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

// This function normalizes scalar source data before fingerprint comparison.
const normalizeFingerprintValue = value => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);

  return String(value).replace(/\s+/g, ' ').trim();
};

// This function creates the mutable source fingerprint used to detect real feed changes.
const createSourceFingerprint = ({
  title,
  description,
  contentText,
  url,
  imageUrl,
  media,
  author,
  published
}) => hashValue(JSON.stringify([
  normalizeFingerprintValue(title),
  normalizeFingerprintValue(description),
  normalizeFingerprintValue(contentText),
  normalizeFingerprintValue(url),
  normalizeFingerprintValue(imageUrl),
  normalizeFingerprintValue(media),
  normalizeFingerprintValue(author),
  normalizeFingerprintValue(published)
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
  const contentStrippedHash = hasIncomingContentStripped
    ? data.contentStrippedHash || hashVisibleText(data.contentText)
    : storedValue(article, 'contentStrippedHash');
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
  const incomingFingerprint = createSourceFingerprint({
    ...updateValues,
    url: normalizedUrl
  });
  const storedFingerprint = createSourceFingerprint({
    title: storedValue(article, 'title'),
    description: storedValue(article, 'description'),
    contentText: storedValue(article, 'contentText'),
    url: storedValue(article, 'normalizedUrl') || normalizeUrl(storedValue(article, 'url')),
    imageUrl: storedValue(article, 'imageUrl'),
    media: storedValue(article, 'media'),
    author: storedValue(article, 'author'),
    published: storedValue(article, 'published')
  });

  if (incomingFingerprint === storedFingerprint) {
    return { article, matched: true, changed: false };
  }

  await article.update(updateValues);

  return { article, matched: true, changed: true };
}

export default updateArticle;
