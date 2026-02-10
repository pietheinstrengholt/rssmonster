import db from '../../models/index.js';
const { Article, Tag } = db;

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

  const article = await Article.create({
    userId: feed.userId,
    feedId: feed.id,
    status: actionResult.status,
    starInd: actionResult.starInd,
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
    eventVector: data.eventVector || null,
    topicVector: data.topicVector || null,
    embedding_model: data.embedding_model || null,
    advertisementScore: analysis.advertisementScore,
    sentimentScore: analysis.sentimentScore,
    qualityScore: analysis.qualityScore,
    published: data.published || new Date()
  });

  // Save tags to database if any were generated
  if (analysis.tags.length > 0) {
    await Promise.all(
      analysis.tags.map(tag =>
        Tag.create({
          articleId: article.id,
          userId: feed.userId,
          name: tag
        }).catch(err =>
          console.error(`Error saving tag "${tag}":`, err.message)
        )
      )
    );
  }

  // Return saved article
  return article;
}

export default saveArticle;
