import db from '../../models/index.js';
const { Article, Tag } = db;

// This function normalizes feed tags before inheriting them onto articles.
const normalizeFeedTags = feedTags => {
  if (!Array.isArray(feedTags)) {
    return [];
  }

  const seen = new Set();

  return feedTags
    .map(tag => String(tag).trim())
    .filter(tag => {
      const key = tag.toLowerCase();

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

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
    article = await Article.create({
      userId: feed.userId,
      feedId: feed.id,
      status: actionResult.status,
      favoriteInd: actionResult.favoriteInd,
      clickedAmount: actionResult.clickedAmount,
      hotInd: actionResult.hotInd,
      url: data.link,
      imageUrl: data.leadImage || null,
      media: data.mediaFound,
      title: data.title,
      author: data.author,
      description: data.description,
      contentOriginal: data.contentOriginal, // use clean HTML content without scripts/styles from HTML processing
      contentStripped: analysis.summary || data.contentStripped, // use summary from analysis if available
      contentSummaryBullets: analysis.contentSummaryBullets,
      contentHash: data.contentHash,
      language: data.language,
      embedding_model: data.embedding_model || null,
      advertisementScore: analysis.advertisementScore,
      sentimentScore: analysis.sentimentScore,
      qualityScore: analysis.qualityScore,
      published: data.published || new Date()
    });
  } catch (err) {
    // A concurrent crawler may have inserted this feed URL after its pre-insert lookup.
    if (err.name === 'SequelizeUniqueConstraintError') return null;
    throw err;
  }

  // Save tags to database if any were generated
  if (analysis.tags.length > 0) {
    await Promise.all(
      analysis.tags.map(tag =>
        Tag.create({
          articleId: article.id,
          userId: feed.userId,
          name: tag,
          tagType: 'generated' // can be used later to differentiate between user-generated and system-generated tags
        }).catch(err =>
          console.error(`Error saving tag "${tag}":`, err.message)
        )
      )
    );
  }

  const feedTags = normalizeFeedTags(feed.feedTags);

  // Save inherited feed tags as article-level tags.
  if (feedTags.length > 0) {
    await Promise.all(
      feedTags.map(tag =>
        Tag.create({
          articleId: article.id,
          userId: feed.userId,
          name: tag,
          tagType: 'feed'
        }).catch(err =>
          console.error(`Error saving feed tag "${tag}":`, err.message)
        )
      )
    );
  }

  // Save action-assigned tags with tagType 'rule'
  if (actionResult.tags && actionResult.tags.length > 0) {
    await Promise.all(
      actionResult.tags.map(tag =>
        Tag.create({
          articleId: article.id,
          userId: feed.userId,
          name: tag,
          tagType: 'rule'
        }).catch(err =>
          console.error(`Error saving action tag "${tag}":`, err.message)
        )
      )
    );
  }

  // Return saved article
  return article;
}

export default saveArticle;
