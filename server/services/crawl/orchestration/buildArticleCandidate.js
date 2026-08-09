import extractEntryFields, { resolveUrlPublishedDate } from '../extraction/extractEntryFields.js';
import processMedia from '../media/processMedia.js';
import processHtmlContent from '../content/processHtmlContent.js';
import sanitizeHtmlContent from '../content/sanitizeHtmlContent.js';
import normalizeUrl from '../content/normalizeUrl.js';
import decodeHtmlEntities from '../../../utils/decodeHtmlEntities.js';
import detectArticleImage from '../media/detectArticleImage.js';
import generateTitleFromContent from '../extraction/generateTitleFromContent.js';
import articleIdentityResolver, {
  isStableArticleIdentity
} from '../extraction/articleIdentityResolver.js';
import { hashVisibleText } from '../../../utils/articleContentHashes.js';
import language from '../../../utils/language.js';
import processDescriptionContent from '../content/processDescriptionContent.js';

// Defines the min analysis language text length enforced by this service.
const MIN_ANALYSIS_LANGUAGE_TEXT_LENGTH = 20;

// This function verifies that canonical entry links remain safe at the crawl boundary.
const isSafeArticleUrl = value => {
  // Returns false when a declared link is not a non-empty string.
  if (typeof value !== 'string' || !value.trim()) return false;

  try {
    // Accepts only absolute HTTP(S) links after adapter-level relative resolution.
    return ['http:', 'https:'].includes(new URL(value).protocol);
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

// This function combines independently sanitized body and description fragments.
const appendDescriptionHtml = (contentHtml, descriptionHtml) =>
  sanitizeHtmlContent(`${contentHtml || ''}${descriptionHtml || ''}`);

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
  rssFeedTitle = null
}) => {
  // Extracts the entry fields while building article candidate.
  const fields = extractEntryFields(entry);
  // Rejects unsafe declared links that bypassed or predated adapter normalization.
  if (fields.link && !isSafeArticleUrl(fields.link)) return null;
  // Rejects linkless entries only when the feed also lacks a stable format identity.
  if (!fields.link && !isStableArticleIdentity(entry)) return null;
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

  let contentOriginal = null;
  let contentHtml = null;
  let contentText = null;
  let contentLanguage = 'unknown';
  let contentSourceHash = null;
  let contentTextHash = null;
  // Collects the hotlink url while building article candidate.
  let hotlinkUrls = [];

  // Extract known provider iframes before generic HTML cleanup removes unsafe embed tags.
  let media = processMedia(entry, fields.content, fields.link);

  // Generic content overrides media content while preserving structured media metadata.
  if (fields.content) {
    // Derives the html result through process html content while building article candidate.
    const contentArguments = [
      fields.content,
      null,
      fields.link,
      feed,
      fields.title
    ];
    contentArguments.push(fields.contentKind, media);
    const htmlResult = processHtmlContent(...contentArguments);
    // Handles the case where html result is available.
    if (htmlResult) {
      contentOriginal = htmlResult.content;
      contentHtml = htmlResult.html;
      contentText = htmlResult.text;
      contentLanguage = htmlResult.language;
      contentSourceHash = htmlResult.contentSourceHash;
      contentTextHash = htmlResult.contentTextHash;
      hotlinkUrls = htmlResult.hotlinkUrls || [];
      media = htmlResult.media || media;
      fields.title = htmlResult.title || fields.title;
    }
  }

  // Derives safe description representations once at the ingestion boundary.
  const descriptionResult = processDescriptionContent(
    fields.description,
    fields.descriptionKind,
    fields.link
  );
  const descriptionHtml = descriptionResult.html;
  const descriptionText = descriptionResult.text;

  // If the body contains no text, append the description while preserving media HTML.
  if (contentHtml && !contentText && descriptionHtml) {
    contentText = descriptionText;
    contentHtml = appendDescriptionHtml(contentHtml, descriptionHtml);
    contentTextHash = hashVisibleText(contentText);
  }

  // Description-only entries use the sanitized description as their canonical reading body.
  if (!contentHtml && descriptionHtml) contentHtml = descriptionHtml;

  // Build one canonical representation for actions, analysis, language, and semantic text.
  const analysisText = contentText || descriptionText || '';
  // Derives the analysis html required while building article candidate.
  const analysisHtml = contentHtml || descriptionHtml || '';
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
    content: fields.contentKind === 'text' ? null : fields.content,
    description: fields.description
  });
  // Normalizes the url before building article candidate.
  const normalizedUrl = fields.link ? normalizeUrl(fields.link) : null;
  // Resolves identity after content hashes exist so the final fallback is deterministic.
  const externalIdentity = articleIdentityResolver({
    ...entry,
    normalizedUrl,
    title: fields.title,
    publishedAt: fields.publishedAt,
    contentSourceHash,
    contentTextHash
  });
  // Builds the article data assembled while building article candidate.
  const articleData = {
    ...fields,
    ...externalIdentity,
    normalizedUrl,
    analysisHtml,
    analysisText,
    descriptionHtml,
    descriptionText,
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
