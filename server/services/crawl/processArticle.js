import db from '../../models/index.js';
const { Action, Hotlink } = db;
import { Op } from 'sequelize';
import { load } from 'cheerio';

import extractEntryFields, { resolveUrlPublishedDate } from './extractEntryFields.js';
import processMedia from './processMedia.js';
import processHtmlContent from './processHtmlContent.js';
import applyActions from './applyActions.js';
import analyzeArticleContent from './analyzeArticleContent.js';
import saveArticle from './saveArticle.js';
import normalizeUrl from './normalizeUrl.js';
import { buildArticleIdentity, matchArticleDuplicate } from './articleDuplicateMatcher.js';
import decodeHtmlEntities from '../../utils/decodeHtmlEntities.js';
import detectArticleImage from './detectArticleImage.js';
import generateTitleFromContent from './generateTitleFromContent.js';
import articleIdentityResolver from './articleIdentityResolver.js';
import updateArticle from './updateArticle.js';
import { hashVisibleText } from '../../utils/articleContentHashes.js';

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
  feedPublishedFallback = null,
  rssFeedTitle = null,
  feedFormat = null
) => {
  try {

    // Extract relevant fields from the entry
    const fields = extractEntryFields(entry);
    const externalIdentity = articleIdentityResolver(entry, feedFormat);
    const titleWasMissing = !fields.title || fields.title === 'Untitled';
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
    fields.description = decodeHtmlEntities(fields.description);

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

    // If generic content is found, use the raw entry content. Override media content.
    if (fields.content) {
      const htmlResult = processHtmlContent(
        fields.content,
        null,
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

    // If the body contains no text, append the description while preserving media HTML.
    if (contentStripped && !contentText && fields.description) {
      const descriptionText = load(String(fields.description))
        .text()
        .replace(/\s+/g, ' ')
        .trim();

      if (descriptionText) {
        contentText = descriptionText;
        const $ = load(contentStripped);
        $('body').append($('<p>').attr('id', 'description').text(descriptionText));
        contentStripped = $('body').html();
        contentStrippedHash = hashVisibleText(contentText);
      }
    }

    // Generate a useful title for feeds whose entries do not provide one.
    if (titleWasMissing) {
      fields.title = generateTitleFromContent(
        contentText || fields.description || rssFeedTitle
      ) || 'Untitled';
    }

    leadImage = await detectArticleImage({
      entry,
      articleUrl: fields.link,
      contentStripped,
      content: fields.content,
      description: fields.description,
      feed,
      title: fields.title
    });

    const normalizedUrl = normalizeUrl(fields.link);
    const articleData = {
      ...fields,
      ...externalIdentity,
      normalizedUrl,
      contentStripped,
      contentText,
      contentOriginal,
      contentHash,
      contentStrippedHash,
      mediaFound,
      leadImage,
      language: contentLanguage,
      published: fields.published,
      publishedSource: fields.publishedSource,
      publishInferred: fields.publishInferred
    };

    // Add or update articles only when body content, media content, or a feed description was found.
    if (!contentOriginal && !fields.description) return emptyArticleResult;

    // Update known external identities before duplicate checks or expensive enrichment work.
    const updateResult = await updateArticle(feed, articleData);
    if (updateResult.matched) {
      return {
        newArticles: 0,
        updatedArticles: updateResult.changed ? 1 : 0,
        errors: 0
      };
    }

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
    if (duplicateMatch) return emptyArticleResult;

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

    // Create article with analysis results
    const savedArticle = await saveArticle(
      feed,
      {
        ...articleData,
        hotlinkInd: hotlinkCount > 0,
        hotlinkCount: hotlinkCount
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
