import {
  LABEL_PREFIX,
  READING_LIST_STREAM,
  READ_STREAM,
  STARRED_STREAM
} from './streamQuery.js';
import { serializeGreaderItemId } from './itemIds.js';

// This function returns a deterministic millisecond value for nullable legacy dates.
const dateMilliseconds = value => {
  // Returns early when value is unavailable.
  if (!value) return 0;
  // Derives the milliseconds through get time while performing date milliseconds.
  const milliseconds = new Date(value).getTime();
  // Selects the result based on whether milliseconds is finite.
  return Number.isFinite(milliseconds) ? Math.trunc(milliseconds) : 0;
};

// This function identifies persisted integer favorite values as starred state.
const isFavorite = value => {
  // Coerces the numeric into the representation required while checking favorite.
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric !== 0;
};

// This function returns the subscription stream ID without inventing site metadata.
const feedStreamId = feed => feed?.url
  ? `feed/${encodeURIComponent(feed.url)}`
  : `feed/${feed?.id || ''}`;

// This function builds stable state and subscription-category labels.
const serializeCategories = article => {
  const categoryName = article.feed?.category?.name;
  // Selects the result based on whether article status is read.
  return [...new Set([
    READING_LIST_STREAM,
    ...(article.status === 'read' ? [READ_STREAM] : []),
    ...(isFavorite(article.favoriteInd) ? [STARRED_STREAM] : []),
    ...(categoryName
      ? [`${LABEL_PREFIX}${encodeURIComponent(categoryName)}`]
      : [])
  ])];
};

// This function converts supported persisted media attachments into enclosures.
const serializeEnclosures = media => {
  // Returns an empty result when media is unavailable or media is not object.
  if (!media || typeof media !== 'object') return [];
  // Selects the candidates based on whether media type is gallery and media items is an array.
  const candidates = media.type === 'gallery' && Array.isArray(media.items)
    ? media.items
    : [media];

  // Runs the callback required while performing serialize enclosures.
  return candidates.flatMap(candidate => {
    // Selects the href based on whether candidate is string.
    const href = typeof candidate?.url === 'string'
      ? candidate.url
      : '';
    // Selects the type based on whether candidate is string.
    const type = typeof candidate?.mimeType === 'string'
      ? candidate.mimeType
      : '';
    // Returns an empty result when href is unavailable or type does not match the expected format.
    if (!href || !/^(audio|image|video)\//.test(type)) return [];

    // Coerces the file size into the representation required while performing serialize enclosures.
    const fileSize = Number(candidate.fileSize);
    // Selects the result based on whether file size is safe integer and file size reaches value.
    return [{
      href,
      type,
      ...(Number.isSafeInteger(fileSize) && fileSize >= 0
        ? { length: String(fileSize) }
        : {})
    }];
  });
};

// This function serializes one visible RSSMonster article for Google Reader clients.
export const serializeGreaderArticle = article => {
  const feed = article.feed;
  // Selects the article url based on whether article is string.
  const articleUrl = typeof article.url === 'string' ? article.url : '';
  // Derives the crawl milliseconds through date milliseconds while performing serialize greader article.
  const crawlMilliseconds = dateMilliseconds(article.createdAt);
  // Derives the publication milliseconds through date milliseconds while performing serialize greader article.
  const publicationMilliseconds = dateMilliseconds(article.publishedAt);
  // Derives the enclosure through serialize enclosures while performing serialize greader article.
  const enclosure = serializeEnclosures(article.media);

  // Selects the result based on whether article is string.
  return {
    id: serializeGreaderItemId(article.id),
    crawlTimeMsec: String(crawlMilliseconds),
    timestampUsec: String(BigInt(publicationMilliseconds) * 1000n),
    published: Math.floor(publicationMilliseconds / 1000),
    title: article.title || '',
    summary: {
      // contentHtml is RSSMonster's sanitized display boundary.
      content: typeof article.contentHtml === 'string'
        ? article.contentHtml
        : ''
    },
    canonical: articleUrl ? [{ href: articleUrl }] : [],
    alternate: articleUrl
      ? [{ href: articleUrl, type: 'text/html' }]
      : [],
    categories: serializeCategories(article),
    origin: {
      streamId: feedStreamId(feed || { id: article.feedId }),
      title: feed?.feedName || '',
      // Feed has no publisher-site field; its url is the subscription URL.
      htmlUrl: ''
    },
    author: article.author || '',
    ...(enclosure.length ? { enclosure } : {})
  };
};

export { dateMilliseconds, isFavorite, serializeEnclosures };
