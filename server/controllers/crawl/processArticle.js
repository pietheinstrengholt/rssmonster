import db from '../../models/index.js';
const { Action } = db;

import extractEntryFields from './extractEntryFields.js';
import findExistingArticle from './findExistingArticle.js';
import processMedia from './processMedia.js';
import processHtmlContent from './processHtmlContent.js';
import applyActions from './applyActions.js';
import analyzeArticleContent from './analyzeArticleContent.js';
import embedArticle from './embedArticle.js';
import saveArticle from './saveArticle.js';
import assignArticleToCluster from '../../util/assignArticleToCluster.js';

/* ------------------------------------------------------------------
 * Article Processor
 * ------------------------------------------------------------------ */

// Delay in milliseconds when rate limited by OpenAI API
const RATE_LIMIT_DELAY_MS = 3000; // 3 seconds delay when rate limited

const processArticle = async (feed, entry) => {
  try {

    // Extract relevant fields from the entry
    const fields = extractEntryFields(entry);

    // Don't process empty post URLs
    if (!fields.link) return;

    let contentOriginal = null;
    let contentStripped = null;
    let contentLanguage = 'unknown';
    let contentHash = null;
    let leadImage = null;
    let mediaFound = false;

    // Check if there's media content (e.g., YouTube videos)
    const mediaResult = processMedia(entry);
    if (mediaResult.content) {
      // Media-based content
      contentOriginal = mediaResult.content;
      contentStripped = mediaResult.content;
      contentLanguage = 'unknown';
      contentHash = null;
      leadImage = mediaResult.leadImage;
      mediaFound = true;
    }

    // If generic content is found, use the entry content / description. Override media content.
    if (fields.content || fields.description) {
      const htmlResult = processHtmlContent(
        fields.content,
        fields.description,
        fields.link,
        feed,
        fields.title
      );
      contentOriginal = htmlResult.content;
      contentStripped = htmlResult.stripped;
      contentLanguage = htmlResult.language;
      contentHash = htmlResult.contentHash;
    }

    // Try to find any existing article with the same link or title
    const existing = await findExistingArticle(
      feed,
      fields.title,
      fields.link,
      contentHash
    );
    if (existing) return; // Duplicate found, skip processing

    // Add article only if content was found
    if (!contentOriginal) return;

    // Retrieve actions for applying rules to the article
    // Do this BEFORE OpenAI analysis to avoid wasting API calls on deleted articles
    const actions = await Action.findAll({
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
    if (actionResult.shouldDelete) return;

    // Analyze content once (summary + tags + scores)
    // Done AFTER delete check to avoid wasting API calls
    let analysis = await analyzeArticleContent(
      contentStripped,
      fields.title,
      fields.categories,
      RATE_LIMIT_DELAY_MS
    );

    // Apply action overrides for scores after analysis
    if (actionResult.advertisementScore !== null) {
      analysis.advertisementScore = actionResult.advertisementScore;
    }
    if (actionResult.qualityScore !== null) {
      analysis.qualityScore = actionResult.qualityScore;
    }

    // Generate embedding (optional, soft-fail)
    const embedding = await embedArticle({
      title: fields.title,
      contentStripped,
      description: fields.description
    });

    // Create article with analysis results
    const article = await saveArticle(
      feed,
      {
        ...fields,
        contentStripped: contentStripped,
        contentOriginal: contentOriginal,
        contentHash: contentHash,
        mediaFound,
        leadImage,
        language: contentLanguage,
        vector: embedding?.vector || null,
        embedding_model: embedding?.embedding_model || null,
        published: fields.published
      },
      analysis,
      actionResult
    );

    // Assign article to cluster
    if (article?.id && article.vector) {
      console.log(`[ARTICLE] Processing clustering for article ${article.id}`);
      assignArticleToCluster(article.id).catch(console.error);
    }

  } catch (err) {
    console.error('Error processing article:', err);
  }
};

export default processArticle;