import db from '../../models/index.js';
import { saveArticleTags } from './tags.js';
import { resolveOfficialSourceForArticle } from './officialSource.js';
import normalizeUrl from './normalizeUrl.js';

const { Article } = db;

/* ======================================================
   Save article & tags to database
   ------------------------------------------------------
   Persists article and generated tags
====================================================== */
async function saveArticle(feed, data, analysis, actionResult) {
  // Validate userId presence
  if (!feed || !feed.userId) {
    throw new Error('Invalid feed: userId is missing. Cannot save article without valid userId.');
  }

  let article;

  try {
    const officialSource = await resolveOfficialSourceForArticle(feed.userId, data.link);
    const normalizedUrl = data.normalizedUrl || normalizeUrl(data.link);
    const leadImage = typeof data.leadImage === 'string'
      ? { url: data.leadImage }
      : data.leadImage;
    article = await Article.create({
      externalId: data.externalId || null,
      externalIdType: data.externalIdType || null,
      userId: feed.userId,
      feedId: feed.id,
      status: actionResult.status,
      favoriteInd: actionResult.favoriteInd,
      clickedAmount: actionResult.clickedAmount,
      hotInd: actionResult.hotInd,
      url: data.link,
      normalizedUrl,
      imageUrl: leadImage?.url || null,
      imageWidth: leadImage?.width ?? null,
      imageHeight: leadImage?.height ?? null,
      imageMimeType: leadImage?.mimeType || null,
      imageSource: leadImage?.source || null,
      media: data.media || null,
      title: data.title,
      author: data.author,
      description: data.description,
      contentOriginal: data.contentOriginal,
      contentStripped: data.contentStripped,
      contentText: data.contentText || null,
      contentStrippedHash: data.contentStrippedHash,
      contentSummaryBullets: analysis.contentSummaryBullets,
      contentHash: data.contentHash,
      isOfficialSource: officialSource.isOfficialSource,
      officialOrganization: officialSource.officialOrganization,
      language: data.language,
      embedding_model: data.embedding_model || null,
      advertisementScore: analysis.advertisementScore,
      sentimentScore: analysis.sentimentScore,
      qualityScore: analysis.qualityScore,
      published: data.published || new Date(),
      publishedSource: data.publishedSource || null,
      publishInferred: Boolean(data.publishInferred)
    });
  } catch (err) {
    // A concurrent crawler may have inserted this feed URL after its pre-insert lookup.
    if (err.name === 'SequelizeUniqueConstraintError') return null;
    throw err;
  }

  await saveArticleTags({
    articleId: article.id,
    userId: feed.userId,
    generatedTags: analysis.tags,
    feedTags: feed.feedTags,
    ruleTags: actionResult.tags
  });

  // Return saved article
  return article;
}

export default saveArticle;
