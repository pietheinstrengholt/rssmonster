import db from '../../models/index.js';
const { Action, Hotlink } = db;
import { Op } from 'sequelize';

import extractEntryFields, { resolveUrlPublishedDate } from './extractEntryFields.js';
import processMedia from './processMedia.js';
import processHtmlContent from './processHtmlContent.js';
import applyActions from './applyActions.js';
import analyzeArticleContent from './analyzeArticleContent.js';
import saveArticle from './saveArticle.js';
import normalizeUrl from './normalizeUrl.js';
import { buildArticleIdentity, matchArticleDuplicate } from './articleDuplicateMatcher.js';
import decodeHtmlEntities from '../../utils/decodeHtmlEntities.js';
import extractLeadImage from '../../utils/extractLeadImage.js';

// Maximum length for normalized description
const MAX_DESCRIPTION_LENGTH = 8000;

/**
 * Remove embedded base64 images which can explode payload size
 */
const stripBase64Images = (html) =>
  typeof html === 'string'
    ? html.replace(
        /<img[^>]+src=["']data:image\/[^"']+["'][^>]*>/gi,
        ''
      )
    : null;

/**
 * Normalize description into safe, bounded plain text
 */
const normalizeDescription = (html) => {
  if (typeof html !== 'string') return null;

  return stripBase64Images(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?[^>]+>/g, ' ')   // strip remaining HTML
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTION_LENGTH);
};

/* ------------------------------------------------------------------
 * Article Processor
 * ------------------------------------------------------------------ */

// Delay in milliseconds when rate limited by OpenAI API
const RATE_LIMIT_DELAY_MS = 3000; // 3 seconds delay when rate limited

const emptyArticleResult = {
  newArticles: 0,
  updatedArticles: 0,
  errors: 0
};

const defaultArticleAnalysis = {
  summary: null,
  contentSummaryBullets: [],
  tags: [],
  advertisementScore: 70,
  sentimentScore: 70,
  qualityScore: 70
};

const processArticle = async (
  feed,
  entry,
  preloadedActions = null,
  duplicateCache = null,
  hotlinkCountCache = null,
  hotlinkBatcher = null,
  feedPublishedFallback = null
) => {
  try {

    // Extract relevant fields from the entry
    const fields = extractEntryFields(entry);
    if (!fields.published && feedPublishedFallback) {
      fields.published = feedPublishedFallback;
      fields.publishedSource = feedPublishedFallback;
      fields.publishInferred = true;
    } else if (!fields.published) {
      const urlPublishedFallback = resolveUrlPublishedDate(fields.link);
      fields.published = urlPublishedFallback;
      fields.publishedSource = urlPublishedFallback;
      fields.publishInferred = Boolean(urlPublishedFallback);
    } else {
      fields.publishedSource = null;
      fields.publishInferred = false;
    }

    // Normalize HTML entities
    fields.title = decodeHtmlEntities(fields.title);
    fields.content = decodeHtmlEntities(fields.content);
    const rawDescription = decodeHtmlEntities(fields.description);

    // Description must be bounded + sanitized (feeds may contain base64 blobs)
    fields.description = normalizeDescription(rawDescription);

    // Skip processing if the article is older than the feed's crawlSince
    if (feed?.crawlSince && fields.published) {
      const publishedDate = new Date(fields.published);
      const sinceDate = new Date(feed.crawlSince);
      if (!isNaN(publishedDate.getTime()) && !isNaN(sinceDate.getTime())) {
        if (publishedDate < sinceDate) {
          return emptyArticleResult; // Too old, respect crawlSince threshold
        }
      }
    }

    // Don't process empty post URLs
    if (!fields.link) return emptyArticleResult;

    let contentOriginal = null;
    let contentStripped = null;
    let contentText = null;
    let contentLanguage = 'unknown';
    let contentHash = null;
    let contentStrippedHash = null;
    let leadImage = null;
    let mediaFound = false;

    // Check if there's media content (e.g., YouTube videos)
    const mediaResult = processMedia(entry);
    leadImage = extractLeadImage({
      entry,
      content: fields.content,
      description: rawDescription,
      articleUrl: fields.link,
      existingLeadImage: mediaResult.leadImage
    });

    if (mediaResult.content) {
      // Media-based content
      contentOriginal = mediaResult.content;
      contentStripped = mediaResult.content;
      contentText = null;
      contentLanguage = 'unknown';
      contentHash = null;
      contentStrippedHash = null;
      mediaFound = true;
    }

    // If generic content is found, use the entry content / description. Override media content.
    if (fields.content || fields.description) {
      const htmlResult = processHtmlContent(
        fields.content,
        fields.description,
        fields.link,
        feed,
        fields.title,
        hotlinkBatcher
      );
      if (htmlResult) {
        contentOriginal = htmlResult.content;
        contentStripped = htmlResult.stripped;
        contentText = htmlResult.text;
        contentLanguage = htmlResult.language;
        contentHash = htmlResult.contentHash;
        contentStrippedHash = htmlResult.contentStrippedHash;
        fields.title = htmlResult.title || fields.title; // Prefer title extracted from content if available
      }
    }

    const normalizedUrl = normalizeUrl(fields.link);
    const articleIdentity = buildArticleIdentity({
      feed,
      title: fields.title,
      link: fields.link,
      normalizedUrl,
      contentHash,
      contentStrippedHash,
      published: fields.published
    });

    // Try to find any existing article with the same stable article identity.
    const duplicateMatch = await matchArticleDuplicate(articleIdentity, duplicateCache);
    if (duplicateMatch) {
      // Existing entry means the feed already contains this article, count as updated for progress reporting.
      return {
        newArticles: 0,
        updatedArticles: 1,
        errors: 0
      };
    }

    // Add article only if content was found
    if (!contentOriginal) return emptyArticleResult;

    // Retrieve actions for applying rules to the article
    // Do this BEFORE OpenAI analysis to avoid wasting API calls on deleted articles
    const actions = preloadedActions ?? await Action.findAll({
      where: { userId: feed.userId }
    });

    // Apply each action to the article
    // Actions allow users to automatically modify article properties based on regex patterns
    const actionResult = applyActions(
      actions,
      contentStripped,
      fields.title
    );

    // Skip article creation if delete action matched
    if (actionResult.shouldDelete) return emptyArticleResult;

    // Analyze content once (summary + tags + scores) unless disabled for this feed.
    // Done AFTER delete check to avoid wasting API calls.
    const analysis = feed?.applyAiAnalysis === false
      ? { ...defaultArticleAnalysis }
      : await analyzeArticleContent(
        contentStripped,
        fields.title,
        fields.categories,
        feed?.feedName || '',
        RATE_LIMIT_DELAY_MS
      );

    // Apply action overrides for scores after analysis
    if (actionResult.advertisementScore !== null) {
      analysis.advertisementScore = actionResult.advertisementScore;
    }
    if (actionResult.qualityScore !== null) {
      analysis.qualityScore = actionResult.qualityScore;
    }

    // Search if the article link is a hotlink.
    // Hotness is determined by counting how often other articles link to this article URL.
    const hotlinkCount = hotlinkCountCache
      ? hotlinkCountCache.count(normalizedUrl, feed.id)
      : await Hotlink.count({
        where: {
          userId: feed.userId,
          feedId: { [Op.ne]: feed.id }, // Exclude same feed
          [Op.or]: [
            { url: normalizedUrl },
            { url: { [Op.like]: `${normalizedUrl}?%` } }
          ]
        }
      });

    // Warn if description is abnormally large after normalization
    if (fields.description?.length > 100000) {
      console.warn(
        '[ARTICLE] Abnormally large description after normalization',
        fields.link,
        fields.description.length
      );
    }

    // Create article with analysis results
    const savedArticle = await saveArticle(
      feed,
      {
        ...fields,
        normalizedUrl,
        contentStripped: contentStripped,
        contentText,
        contentOriginal: contentOriginal,
        contentHash: contentHash,
        contentStrippedHash,
        mediaFound,
        leadImage,
        hotlinkInd: hotlinkCount > 0,
        hotlinkCount: hotlinkCount,
        language: contentLanguage,
        published: fields.published,
        publishedSource: fields.publishedSource,
        publishInferred: fields.publishInferred
      },
      analysis,
      actionResult
    );

    if (!savedArticle) {
      // A concurrent crawler inserted this URL first; treat as updated for progress counters.
      return {
        newArticles: 0,
        updatedArticles: 1,
        errors: 0
      };
    }

    duplicateCache?.add(savedArticle);

    return {
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    };

  } catch (err) {
    console.error('Error processing article:', err);
    return {
      newArticles: 0,
      updatedArticles: 0,
      errors: 1
    };
  }
};

export default processArticle;
