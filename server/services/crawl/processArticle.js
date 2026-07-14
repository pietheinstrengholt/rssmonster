import db from '../../models/index.js';
const { Action, Hotlink } = db;
import { Op } from 'sequelize';
import { load } from 'cheerio';

import extractEntryFields, { resolveUrlPublishedDate } from './extractEntryFields.js';
import processMedia from './processMedia.js';
import processHtmlContent from './processHtmlContent.js';
import sanitizeHtmlContent from './sanitizeHtmlContent.js';
import applyActions from './applyActions.js';
import analyzeArticleContent from './analyzeArticleContent.js';
import saveArticle from './saveArticle.js';
import normalizeUrl from './normalizeUrl.js';
import { buildArticleIdentity, matchArticleDuplicate } from './articleDuplicateMatcher.js';
import decodeHtmlEntities from '../../utils/decodeHtmlEntities.js';
import detectArticleImage from './detectArticleImage.js';
import generateTitleFromContent from './generateTitleFromContent.js';
import articleIdentityResolver from './articleIdentityResolver.js';
import updateArticle, { applyArticleUpdate } from './updateArticle.js';
import { hashVisibleText } from '../../utils/articleContentHashes.js';
import hotlink from '../../controllers/hotlink.js';
import { resolveOfficialSourceForArticle } from './officialSource.js';
import language from '../../utils/language.js';

/* ------------------------------------------------------------------
 * Article Processor
 * ------------------------------------------------------------------ */

// Delay in milliseconds when rate limited by OpenAI API
const RATE_LIMIT_DELAY_MS = 3000; // 3 seconds delay when rate limited
const MIN_ANALYSIS_LANGUAGE_TEXT_LENGTH = 20;

const emptyArticleResult = {
  newArticles: 0,
  updatedArticles: 0,
  errors: 0
};

// This function creates independent default analysis state for one article.
const createDefaultArticleAnalysis = () => ({
  summary: null,
  contentSummaryBullets: [],
  tags: [],
  advertisementScore: 70,
  sentimentScore: 70,
  qualityScore: 70
});

// This function loads actions only when the caller did not preload them.
const resolveArticleActions = async (feed, preloadedActions) => preloadedActions ?? Action.findAll({
  where: { userId: feed.userId }
});

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

// This function applies action-owned score overrides to a fresh analysis result.
const applyAnalysisScoreOverrides = (analysis, actionResult) => {
  const result = {
    ...analysis,
    contentSummaryBullets: [...(analysis.contentSummaryBullets || [])],
    tags: [...(analysis.tags || [])]
  };

  if (actionResult?.advertisementScore !== null && actionResult?.advertisementScore !== undefined) {
    result.advertisementScore = actionResult.advertisementScore;
  }
  if (actionResult?.qualityScore !== null && actionResult?.qualityScore !== undefined) {
    result.qualityScore = actionResult.qualityScore;
  }

  return result;
};

// This function returns how many other-feed articles link to one normalized article URL.
const countArticleHotlinks = async (feed, normalizedUrl, hotlinkCountCache) => hotlinkCountCache
  ? hotlinkCountCache.count(normalizedUrl, feed.id)
  : Hotlink.count({
      where: {
        userId: feed.userId,
        feedId: { [Op.ne]: feed.id },
        [Op.or]: [
          { url: normalizedUrl },
          { url: { [Op.like]: `${normalizedUrl}?%` } }
        ]
      }
    });

// This function persists collected hotlinks only after their source article is accepted.
const persistAcceptedHotlinks = async (urls, feed, hotlinkBatcher) => {
  if (!urls.length) return;

  try {
    if (hotlinkBatcher) {
      hotlinkBatcher.add(urls);
      return;
    }

    await hotlink.setMany(urls, feed.id, feed.userId);
  } catch (err) {
    console.error(`Error saving hotlinks for accepted article in feed ${feed.id}:`, err);
  }
};

// This function snapshots the identities that a committed article update may replace in the cache.
const buildDuplicateCacheArticleState = article => ({
  id: article.id,
  urlHash: article.urlHash,
  normalizedUrlHash: article.normalizedUrlHash,
  title: article.title,
  published: article.published,
  contentTextHash: article.contentTextHash,
  contentSourceHash: article.contentSourceHash
});

// This function refreshes cache identities while supporting minimal cache test doubles.
const refreshDuplicateCache = (duplicateCache, previousArticleState, updatedArticle) => {
  if (typeof duplicateCache?.update === 'function') {
    duplicateCache.update(previousArticleState, updatedArticle);
    return;
  }

  duplicateCache?.add?.(updatedArticle);
};

// This function selectively refreshes article-level derived state and applies one matched update.
const processMatchedArticleUpdate = async ({
  feed,
  articleData,
  updatePlan,
  preloadedActions,
  hotlinkCountCache,
  hotlinkBatcher,
  hotlinkUrls,
  duplicateCache,
  precomputedActionResult = null,
  precomputedAnalysis = null
}) => {
  // Publisher revisions update the reading copy but intentionally preserve
  // creation-time semantic state. Minor feed edits should not trigger vector,
  // event, topic, cluster, or island recalibration. Semantic rebuilds are
  // handled only by explicit maintenance workflows.
  const { changes } = updatePlan;
  const previousArticleState = buildDuplicateCacheArticleState(updatePlan.article);
  const requiresActions = changes.contentChanged ||
    changes.titleChanged ||
    changes.descriptionChanged ||
    changes.urlChanged;
  const requiresAnalysis = changes.contentChanged ||
    changes.titleChanged ||
    changes.descriptionChanged;
  const actions = requiresActions
    ? await resolveArticleActions(feed, preloadedActions)
    : null;
  const actionResult = requiresActions
    ? precomputedActionResult || applyActions(actions, buildActionArticle(articleData))
    : null;

  // Delete-matched revisions update the reading copy and hide the article without
  // changing article-level enrichment or semantic state.
  if (actionResult?.shouldDelete) {
    const article = await applyArticleUpdate({
      updatePlan,
      derivedValues: { status: 'delete' },
      tagUpdates: null,
      userId: feed.userId
    });
    refreshDuplicateCache(duplicateCache, previousArticleState, article);

    return {
      article,
      newArticles: 0,
      updatedArticles: 1,
      errors: 0
    };
  }

  let analysis = null;
  if (requiresAnalysis) {
    analysis = precomputedAnalysis || (
      feed?.applyAiAnalysis === false
        ? createDefaultArticleAnalysis()
        : await analyzeArticleContent(
            articleData.analysisHtml,
            articleData.title,
            articleData.categories,
            feed?.feedName || '',
            RATE_LIMIT_DELAY_MS
          )
    );
    analysis = applyAnalysisScoreOverrides(analysis, actionResult);
  }

  const derivedValues = {};
  if (analysis) {
    Object.assign(derivedValues, {
      contentSummaryBullets: analysis.contentSummaryBullets,
      advertisementScore: analysis.advertisementScore,
      sentimentScore: analysis.sentimentScore,
      qualityScore: analysis.qualityScore
    });
  } else if (actionResult) {
    // Score provenance is not stored, so only explicit new overrides are safe to apply here.
    if (actionResult.advertisementScore !== null) {
      derivedValues.advertisementScore = actionResult.advertisementScore;
    }
    if (actionResult.qualityScore !== null) {
      derivedValues.qualityScore = actionResult.qualityScore;
    }
  }

  if (changes.urlChanged) {
    const officialSource = await resolveOfficialSourceForArticle(feed.userId, articleData.link);
    const hotlinkCount = await countArticleHotlinks(
      feed,
      updatePlan.updateValues.normalizedUrl,
      hotlinkCountCache
    );
    Object.assign(derivedValues, {
      isOfficialSource: officialSource.isOfficialSource,
      officialOrganization: officialSource.officialOrganization,
      hotInd: hotlinkCount > 0,
      hotlinks: hotlinkCount
    });
  }

  const tagUpdates = requiresActions || requiresAnalysis
    ? {
        generatedTags: analysis ? analysis.tags : undefined,
        feedTags: feed.feedTags,
        ruleTags: actionResult ? actionResult.tags : undefined
      }
    : null;

  // Engagement fields are intentionally absent because action/user provenance is not stored.
  const article = await applyArticleUpdate({
    updatePlan,
    derivedValues,
    tagUpdates,
    userId: feed.userId
  });
  refreshDuplicateCache(duplicateCache, previousArticleState, article);

  await persistAcceptedHotlinks(hotlinkUrls, feed, hotlinkBatcher);

  return {
    article,
    newArticles: 0,
    updatedArticles: 1,
    errors: 0
  };
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

    // Feed titles are text fields, so decode their entities before display and comparison.
    fields.title = decodeHtmlEntities(fields.title);

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
    let contentHtml = null;
    let contentText = null;
    let contentLanguage = 'unknown';
    let contentSourceHash = null;
    let contentTextHash = null;
    let hotlinkUrls = [];
    // Extract known provider iframes before generic HTML cleanup removes unsafe embed tags.
    const media = processMedia(entry, fields.content, fields.link);

    // If generic content is found, use the raw entry content. Override media content.
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
        fields.title = htmlResult.title || fields.title; // Prefer title extracted from content if available
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
      published: fields.published,
      publishedSource: fields.publishedSource,
      publishInferred: fields.publishInferred
    };

    // Add or update articles only when body content, a description, media, or a lead image was found.
    if (!contentOriginal && !fields.description && !media && !leadImage) {
      return emptyArticleResult;
    }

    // Update known external identities before duplicate checks or expensive enrichment work.
    const updateResult = await updateArticle(feed, articleData);
    if (updateResult.matched) {
      if (!updateResult.changed) return emptyArticleResult;

      return processMatchedArticleUpdate({
        feed,
        articleData,
        updatePlan: updateResult,
        preloadedActions,
        hotlinkCountCache,
        hotlinkBatcher,
        hotlinkUrls,
        duplicateCache
      });
    }

    const articleIdentity = buildArticleIdentity({
      feed,
      title: fields.title,
      link: fields.link,
      normalizedUrl,
      contentSourceHash,
      contentTextHash,
      published: fields.published
    });

    // Try to find any existing article with the same stable article identity.
    const duplicateMatch = await matchArticleDuplicate(articleIdentity, duplicateCache);
    if (duplicateMatch) return emptyArticleResult;

    // Retrieve actions before enrichment so delete matches can take the persistence-only path.
    const actions = await resolveArticleActions(feed, preloadedActions);

    // Apply each action to the article
    // Actions allow users to automatically modify article properties based on regex patterns
    const actionResult = applyActions(actions, buildActionArticle(articleData));

    let analysis = null;
    let persistenceData = articleData;
    if (!actionResult.shouldDelete) {
      // Analyze content once (summary + tags + scores) unless disabled for this feed.
      analysis = feed?.applyAiAnalysis === false
        ? createDefaultArticleAnalysis()
        : await analyzeArticleContent(
          analysisHtml,
          fields.title,
          fields.categories,
          feed?.feedName || '',
          RATE_LIMIT_DELAY_MS
        );

      analysis = applyAnalysisScoreOverrides(analysis, actionResult);

      // Hotness is derived only for articles accepted into the normal reading pipeline.
      const hotlinkCount = await countArticleHotlinks(feed, normalizedUrl, hotlinkCountCache);
      persistenceData = {
        ...articleData,
        hotInd: hotlinkCount > 0,
        hotlinks: hotlinkCount
      };
    }

    // Delete matches still persist their cleaned source and hashes, but saveArticle skips enrichment.
    const saveResult = await saveArticle(
      feed,
      persistenceData,
      analysis,
      actionResult
    );

    const savedArticle = saveResult.article;

    if (!saveResult.created) {
      // Classify the exact winning row so a URL race cannot target a different article.
      const concurrentUpdate = await updateArticle(feed, articleData, { article: savedArticle });
      if (!concurrentUpdate.changed) {
        duplicateCache?.add(savedArticle);
        return emptyArticleResult;
      }

      const matchedUpdateResult = await processMatchedArticleUpdate({
        feed,
        articleData,
        updatePlan: concurrentUpdate,
        preloadedActions,
        hotlinkCountCache,
        hotlinkBatcher,
        hotlinkUrls,
        duplicateCache,
        precomputedActionResult: actionResult,
        precomputedAnalysis: analysis
      });
      return matchedUpdateResult;
    }

    duplicateCache?.add(savedArticle);
    if (!actionResult.shouldDelete) {
      await persistAcceptedHotlinks(hotlinkUrls, feed, hotlinkBatcher);
    }

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
