import Article from '../../models/article.js';
import Tag from '../../models/tag.js';

/* ======================================================
   Save article & tags to database
   ------------------------------------------------------
   Persists article and generated tags
====================================================== */
async function saveArticle(feed, entry, data, analysis, actionResult) {
  const article = await Article.create({
    userId: feed.userId,
    feedId: feed.id,
    status: actionResult.status,
    starInd: actionResult.starInd,
    clickedInd: actionResult.clickedInd,
    url: data.link,
    imageUrl: data.leadImage || null,
    title: data.title,
    author: data.author,
    description: data.description,
    content: data.contentOriginal, // use clean HTML content without scripts/styles from HTML processing
    contentStripped: analysis.summary || data.contentStripped, // use summary from analysis if available
    language: data.language,
    advertisementScore: analysis.advertisementScore,
    sentimentScore: analysis.sentimentScore,
    qualityScore: analysis.qualityScore,
    published: entry.published || new Date()
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
}

export default saveArticle;
