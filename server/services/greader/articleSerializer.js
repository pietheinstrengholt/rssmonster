import {
  LABEL_PREFIX,
  READING_LIST_STREAM,
  READ_STREAM,
  STARRED_STREAM
} from './streamQuery.js';
import { serializeGreaderItemId } from './itemIds.js';

// This function returns a deterministic millisecond value for nullable legacy dates.
const dateMilliseconds = value => {
  if (!value) return 0;
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? Math.trunc(milliseconds) : 0;
};

// This function identifies persisted integer favorite values as starred state.
const isFavorite = value => {
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
  if (!media || typeof media !== 'object') return [];
  const candidates = media.type === 'gallery' && Array.isArray(media.items)
    ? media.items
    : [media];

  return candidates.flatMap(candidate => {
    const href = typeof candidate?.url === 'string'
      ? candidate.url
      : '';
    const type = typeof candidate?.mimeType === 'string'
      ? candidate.mimeType
      : '';
    if (!href || !/^(audio|image|video)\//.test(type)) return [];

    const fileSize = Number(candidate.fileSize);
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
  const articleUrl = typeof article.url === 'string' ? article.url : '';
  const crawlMilliseconds = dateMilliseconds(article.createdAt);
  const publicationMilliseconds = dateMilliseconds(article.publishedAt);
  const enclosure = serializeEnclosures(article.media);

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
