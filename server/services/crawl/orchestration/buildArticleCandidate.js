import { load } from 'cheerio';

import extractEntryFields, { resolveUrlPublishedDate } from '../extraction/extractEntryFields.js';
import processMedia from '../media/processMedia.js';
import processHtmlContent from '../content/processHtmlContent.js';
import sanitizeHtmlContent from '../content/sanitizeHtmlContent.js';
import normalizeUrl from '../content/normalizeUrl.js';
import decodeHtmlEntities from '../../../utils/decodeHtmlEntities.js';
import detectArticleImage from '../media/detectArticleImage.js';
import generateTitleFromContent from '../extraction/generateTitleFromContent.js';
import articleIdentityResolver from '../extraction/articleIdentityResolver.js';
import { hashVisibleText } from '../../../utils/articleContentHashes.js';
import language from '../../../utils/language.js';

const MIN_ANALYSIS_LANGUAGE_TEXT_LENGTH = 20;

// This function checks whether a feed entry points to an absolute HTTP(S) article URL.
const isAbsoluteHttpUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return false;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// This function selects publisher fields that action regular expressions may inspect.
const buildActionArticle = articleData => ({
  title: articleData.title,
  contentHtml: articleData.analysisHtml,
  contentText: articleData.analysisText,
  description: articleData.description,
  url: articleData.link || articleData.url
});

// This function renders normalized description text as safe analysis-only HTML.
const renderDescriptionHtml = descriptionText => {
  if (!descriptionText) return '';

  const $ = load('<p></p>', null, false);
  $('p').text(descriptionText);
  return $.html();
};

// This function appends description fallback text and restores the sanitizer boundary.
const appendDescriptionHtml = (contentHtml, descriptionText) => {
  const $ = load(contentHtml, null, false);
  $.root().append($('<p>').text(descriptionText));
  return sanitizeHtmlContent($.html());
};

// This function fills missing body-language metadata from the canonical analysis text.
const resolveAnalysisLanguage = ({ currentLanguage, text, feed, title }) => {
  const fallback = currentLanguage || 'unknown';
  if (
    fallback !== 'unknown' ||
    text.length < MIN_ANALYSIS_LANGUAGE_TEXT_LENGTH ||
    !/\p{L}/u.test(text)
  ) {
    return fallback;
  }

  try {
    const detectedLanguage = language.get(text);
    return detectedLanguage && detectedLanguage !== 'und'
      ? detectedLanguage
      : fallback;
  } catch (err) {
    console.error(
      `[${feed.feedName}] Error detecting language for article "${title}":`,
      err.message
    );
    return fallback;
  }
};

// This function prepares normalized publisher input without querying or persisting articles.
const buildArticleCandidate = async ({
  feed,
  entry,
  feedPublishedFallback = null,
  rssFeedTitle = null,
  feedFormat = null
}) => {
  const fields = extractEntryFields(entry);
  const externalIdentity = articleIdentityResolver(entry, feedFormat);
  const titleWasMissing = !fields.title || fields.title === 'Untitled';

  if (!fields.publishedAt && fields.modifiedAt) {
    fields.publishedAt = fields.modifiedAt;
    fields.publishedSource = fields.modifiedAt;
    fields.publishInferred = true;
  } else if (!fields.publishedAt && feedPublishedFallback) {
    fields.publishedAt = feedPublishedFallback;
    fields.publishedSource = feedPublishedFallback;
    fields.publishInferred = true;
  } else if (!fields.publishedAt) {
    const urlPublishedFallback = resolveUrlPublishedDate(fields.link);
    fields.publishedAt = urlPublishedFallback;
    fields.publishedSource = urlPublishedFallback;
    fields.publishInferred = Boolean(urlPublishedFallback);
  } else {
    fields.publishedSource = null;
    fields.publishInferred = false;
  }

  // Feed titles are text fields, so decode their entities before display and comparison.
  fields.title = decodeHtmlEntities(fields.title);

  // Skip processing if the article is older than the feed's crawlSince.
  if (feed?.crawlSince && fields.publishedAt) {
    const publishedDate = new Date(fields.publishedAt);
    const sinceDate = new Date(feed.crawlSince);
    if (!isNaN(publishedDate.getTime()) && !isNaN(sinceDate.getTime())) {
      if (publishedDate < sinceDate) return null;
    }
  }

  if (!isAbsoluteHttpUrl(fields.link)) return null;

  let contentOriginal = null;
  let contentHtml = null;
  let contentText = null;
  let contentLanguage = 'unknown';
  let contentSourceHash = null;
  let contentTextHash = null;
  let hotlinkUrls = [];

  // Extract known provider iframes before generic HTML cleanup removes unsafe embed tags.
  const media = processMedia(entry, fields.content, fields.link);

  // Generic content overrides media content while preserving structured media metadata.
  if (fields.content) {
    const htmlResult = processHtmlContent(
      fields.content,
      null,
      fields.link,
      feed,
      fields.title
    );
    if (htmlResult) {
      contentOriginal = htmlResult.content;
      contentHtml = htmlResult.html;
      contentText = htmlResult.text;
      contentLanguage = htmlResult.language;
      contentSourceHash = htmlResult.contentSourceHash;
      contentTextHash = htmlResult.contentTextHash;
      hotlinkUrls = htmlResult.hotlinkUrls || [];
      fields.title = htmlResult.title || fields.title;
    }
  }

  // Extract visible description text for body fallback and stable identity hashing.
  const descriptionText = fields.description
    ? load(String(fields.description))
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    : null;

  // If the body contains no text, append the description while preserving media HTML.
  if (contentHtml && !contentText && descriptionText) {
    contentText = descriptionText;
    contentHtml = appendDescriptionHtml(contentHtml, descriptionText);
    contentTextHash = hashVisibleText(contentText);
  }

  // Build one canonical representation for actions, analysis, language, and semantic text.
  const analysisText = contentText || descriptionText || '';
  const analysisHtml = contentHtml || renderDescriptionHtml(descriptionText);
  if (!contentText && analysisText) {
    contentText = analysisText;
    contentTextHash = hashVisibleText(analysisText);
  }
  contentLanguage = resolveAnalysisLanguage({
    currentLanguage: contentLanguage,
    text: analysisText,
    feed,
    title: fields.title
  });

  // Generate a useful title for feeds whose entries do not provide one.
  if (titleWasMissing) {
    fields.title = generateTitleFromContent(
      contentText || descriptionText || rssFeedTitle
    ) || 'Untitled';
  }

  const leadImage = await detectArticleImage({
    entry,
    articleUrl: fields.link,
    contentHtml,
    content: fields.content,
    description: fields.description
  });
  const normalizedUrl = normalizeUrl(fields.link);
  const articleData = {
    ...fields,
    ...externalIdentity,
    normalizedUrl,
    analysisHtml,
    analysisText,
    contentHtml,
    contentText,
    contentOriginal,
    contentSourceHash,
    contentTextHash,
    media,
    leadImage,
    language: contentLanguage,
    publishedAt: fields.publishedAt,
    publishedSource: fields.publishedSource,
    publishInferred: fields.publishInferred
  };

  // Require useful source material before identity or duplicate database work begins.
  if (!contentOriginal && !fields.description && !media && !leadImage) return null;

  return {
    fields,
    articleData,
    actionArticle: buildActionArticle(articleData),
    identityInput: {
      feed,
      title: fields.title,
      link: fields.link,
      normalizedUrl,
      contentSourceHash,
      contentTextHash,
      publishedAt: fields.publishedAt
    },
    hotlinkUrls
  };
};

export default buildArticleCandidate;
