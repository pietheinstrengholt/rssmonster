import { createHash } from 'node:crypto';

import normalizeUrl from './normalizeUrl.js';
import { hashOriginalContent, hashVisibleText } from '../../utils/articleContentHashes.js';

const MUTABLE_ARTICLE_SOURCE_FIELDS = [
  'media',
  'url',
  'imageUrl',
  'imageWidth',
  'imageHeight',
  'imageMimeType',
  'imageSource',
  'title',
  'author',
  'description',
  'contentOriginal',
  'contentHtml',
  'contentText',
  'language',
  'published',
  'publishedSource',
  'publishInferred',
  'urlHash',
  'normalizedUrl',
  'normalizedUrlHash',
  'contentTextHash',
  'contentSourceHash'
];

// This function returns the stable SHA-256 identity for an article URL.
export const hashArticleUrl = value => value
  ? createHash('sha256').update(value).digest('hex')
  : null;

// This function normalizes string and object lead-image inputs into persisted metadata.
const normalizeLeadImage = data => {
  if (typeof data.leadImage === 'string') return { url: data.leadImage };
  if (data.leadImage) return data.leadImage;

  return {
    url: data.imageUrl,
    width: data.imageWidth,
    height: data.imageHeight,
    mimeType: data.imageMimeType,
    source: data.imageSource
  };
};

// This function builds the canonical database values for one processed article.
export default function buildArticlePersistenceValues(feed, data = {}) {
  const url = data.link || data.url || null;
  const normalizedUrl = data.normalizedUrl || (url ? normalizeUrl(url) : null);
  const leadImage = normalizeLeadImage(data);
  const contentOriginal = data.contentOriginal ?? null;
  const contentText = typeof data.contentText === 'string' && data.contentText.trim()
    ? data.contentText
    : null;

  return {
    externalId: data.externalId || null,
    externalIdType: data.externalIdType || null,
    userId: feed?.userId ?? data.userId ?? null,
    feedId: feed?.id ?? data.feedId ?? null,
    status: data.status,
    filteredInd: Boolean(data.filteredInd),
    favoriteInd: data.favoriteInd,
    clickedAmount: data.clickedAmount,
    hotInd: data.hotInd ?? data.hotlinkInd,
    hotlinks: data.hotlinks ?? data.hotlinkCount,
    url,
    urlHash: hashArticleUrl(url),
    normalizedUrl,
    normalizedUrlHash: hashArticleUrl(normalizedUrl),
    imageUrl: leadImage?.url || null,
    imageWidth: leadImage?.width ?? null,
    imageHeight: leadImage?.height ?? null,
    imageMimeType: leadImage?.mimeType || null,
    imageSource: leadImage?.source || null,
    media: data.media || null,
    title: data.title,
    author: data.author ?? null,
    description: data.description ?? null,
    contentOriginal,
    contentHtml: data.contentHtml ?? null,
    contentText,
    contentTextHash: data.contentTextHash || (
      contentText ? hashVisibleText(contentText) : null
    ),
    contentSummaryBullets: data.contentSummaryBullets ?? [],
    contentSourceHash: data.contentSourceHash || (
      contentOriginal ? hashOriginalContent(contentOriginal) : null
    ),
    isOfficialSource: Boolean(data.isOfficialSource),
    officialOrganization: data.officialOrganization || null,
    language: data.language,
    embedding_model: data.embedding_model || null,
    advertisementScore: data.advertisementScore,
    sentimentScore: data.sentimentScore,
    qualityScore: data.qualityScore,
    published: data.published ?? null,
    publishedSource: data.publishedSource || null,
    publishInferred: Boolean(data.publishInferred)
  };
}

// This function applies the mutable-source update policy to canonical persistence values.
export const selectMutableArticleSourceValues = values => Object.fromEntries(
  MUTABLE_ARTICLE_SOURCE_FIELDS.map(field => [field, values[field]])
);

export { MUTABLE_ARTICLE_SOURCE_FIELDS };
