import Action from '../../models/action.js';

import extractEntryFields from './extractEntryFields.js';
import findExistingArticle from './findExistingArticle.js';
import processMedia from './processMedia.js';
import processHtmlContent from './processHtmlContent.js';
import applyActions from './applyActions.js';
import analyzeArticleContent from './analyzeArticleContent.js';
import saveArticle from './saveArticle.js';

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

    // Try to find any existing article with the same link or title
    const existing = await findExistingArticle(
      feed,
      fields.title,
      fields.link
    );
    if (existing) return;

    let postContent = null;
    let postStripped = null;
    let postLanguage = 'unknown';
    let leadImage = null;

    // Categories extraction
    let categoryNames = Array.isArray(entry.categories)
      ? entry.categories.map(c => c.name).filter(Boolean)
      : [];

    // Check if there's media content (e.g., YouTube videos)
    const mediaResult = processMedia(entry);
    if (mediaResult.content) {
      // Media-based content
      postContent = mediaResult.content;
      postStripped = mediaResult.content;
      leadImage = mediaResult.leadImage;
    }
    // If no media content is found, use the entry content / description
    else if (fields.content) {
      const htmlResult = processHtmlContent(
        fields.content,
        fields.link,
        feed,
        fields.title
      );
      postContent = htmlResult.content;
      postStripped = htmlResult.stripped;
      postLanguage = htmlResult.language;
    }

    // Add article only if content was found
    if (!postContent) return;

    // Retrieve actions for applying rules to the article
    // Do this BEFORE OpenAI analysis to avoid wasting API calls on deleted articles
    const actions = await Action.findAll({
      where: { userId: feed.userId }
    });

    // Apply each action to the article
    // Actions allow users to automatically modify article properties based on regex patterns
    const actionResult = applyActions(
      actions,
      postStripped,
      fields.title
    );

    // Skip article creation if delete action matched
    if (actionResult.shouldDelete) return;

    // Analyze content once (summary + tags + scores)
    // Done AFTER delete check to avoid wasting API calls
    let analysis = await analyzeArticleContent(
      postStripped,
      fields.title,
      RATE_LIMIT_DELAY_MS
    );

    // Overwrite empty tags with categories
    if (
      (!Array.isArray(analysis.tags) || analysis.tags.length === 0) &&
      categoryNames.length > 0
    ) {
      analysis.tags = categoryNames;
    }

    // Apply action overrides after analysis
    if (actionResult.advertisementScore !== null) {
      analysis.advertisementScore = actionResult.advertisementScore;
    }
    if (actionResult.qualityScore !== null) {
      analysis.qualityScore = actionResult.qualityScore;
    }

    // Create article with analysis results
    await saveArticle(
      feed,
      entry,
      {
        ...fields,
        rawContent: fields.content,
        leadImage,
        language: postLanguage
      },
      analysis,
      actionResult
    );
  } catch (err) {
    console.error('Error processing article:', err);
  }
};

export default processArticle;