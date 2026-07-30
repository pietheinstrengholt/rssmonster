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

// Defines the min analysis language text length enforced by this service.
const MIN_ANALYSIS_LANGUAGE_TEXT_LENGTH = 20;

// This function checks whether a feed entry points to an absolute HTTP(S) article URL.
const isAbsoluteHttpUrl = value => {
  // Rejects the value when value is not string or trim is unavailable.
  if (typeof value !== 'string' || !value.trim()) return false;

  try {
    // Derives the url required while checking absolute http url.
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
  // Returns early when description text is unavailable.
  if (!descriptionText) return '';

  // Performs the load operation while performing render description html.
  const $ = load('<p></p>', null, false);
  $('p').text(descriptionText);
  return $.html();
};

// This function appends description fallback text and restores the sanitizer boundary.
const appendDescriptionHtml = (contentHtml, descriptionText) => {
  // Performs the load operation while performing append description html.
  const $ = load(contentHtml, null, false);
  $.root().append($('<p>').text(descriptionText));
  return sanitizeHtmlContent($.html());
};

// This function fills missing body-language metadata from the canonical analysis text.
const resolveAnalysisLanguage = ({ currentLanguage, text, feed, title }) => {
  // Derives the fallback required while resolving analysis language.
  const fallback = currentLanguage || 'unknown';
  // Returns early when fallback is not unknown or text count is below min analysis language text length or text does not match the expected format.
  if (
    fallback !== 'unknown' ||
    text.length < MIN_ANALYSIS_LANGUAGE_TEXT_LENGTH ||
    !/\p{L}/u.test(text)
  ) {
    return fallback;
  }

  try {
    // Derives the detected language through get while resolving analysis language.
    const detectedLanguage = language.get(text);
    // Selects the result based on whether detected language is available and detected language is not und.
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
  // Extracts the entry fields while building article candidate.
  const fields = extractEntryFields(entry);
  // Derives the external identity through article identity resolver while building article candidate.
  const externalIdentity = articleIdentityResolver(entry, feedFormat);
  // Derives the title was missing required while building article candidate.
  const titleWasMissing = !fields.title || fields.title === 'Untitled';

  // Handles the case where fields published at is unavailable and fields modified at is available.
  if (!fields.publishedAt && fields.modifiedAt) {
    fields.publishedAt = fields.modifiedAt;
    fields.publishedSource = fields.modifiedAt;
    fields.publishInferred = true;
  // Handles the case where fields published at is unavailable and feed published fallback is available.
  } else if (!fields.publishedAt && feedPublishedFallback) {
    fields.publishedAt = feedPublishedFallback;
    fields.publishedSource = feedPublishedFallback;
    fields.publishInferred = true;
  // Handles the case where fields published at is unavailable.
  } else if (!fields.publishedAt) {
    // Resolves the url published date while building article candidate.
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
    // Normalizes the published date used while building article candidate.
    const publishedDate = new Date(fields.publishedAt);
    // Normalizes the since date used while building article candidate.
    const sinceDate = new Date(feed.crawlSince);
    // Handles the case where get time is not na n and get time is not na n.
    if (!isNaN(publishedDate.getTime()) && !isNaN(sinceDate.getTime())) {
      // Returns no result when published date is below since date.
      if (publishedDate < sinceDate) return null;
    }
  }

  // Returns no result when fields link is not absolute http url.
  if (!isAbsoluteHttpUrl(fields.link)) return null;

  let contentOriginal = null;
  let contentHtml = null;
  let contentText = null;
  let contentLanguage = 'unknown';
  let contentSourceHash = null;
  let contentTextHash = null;
  // Collects the hotlink url while building article candidate.
  let hotlinkUrls = [];

  // Extract known provider iframes before generic HTML cleanup removes unsafe embed tags.
  const media = processMedia(entry, fields.content, fields.link);

  // Generic content overrides media content while preserving structured media metadata.
  if (fields.content) {
    // Derives the html result through process html content while building article candidate.
    const htmlResult = processHtmlContent(
      fields.content,
      null,
      fields.link,
      feed,
      fields.title
    );
    // Handles the case where html result is available.
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
  // Derives the analysis html required while building article candidate.
  const analysisHtml = contentHtml || renderDescriptionHtml(descriptionText);
  // Handles the case where content text is unavailable and analysis text is available.
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

  // Detects the article image while building article candidate.
  const leadImage = await detectArticleImage({
    entry,
    articleUrl: fields.link,
    contentHtml,
    content: fields.content,
    description: fields.description
  });
  // Normalizes the url before building article candidate.
  const normalizedUrl = normalizeUrl(fields.link);
  // Builds the article data assembled while building article candidate.
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
