import { Op } from 'sequelize';
import { load } from 'cheerio';
import * as htmlparser2 from 'htmlparser2';
import striptags from 'striptags';

import Article from '../../models/article.js';
import Tag from '../../models/tag.js';
import Action from '../../models/action.js';

import language from '../../util/language.js';
import { analyzeContent } from '../../util/analyzer.js';
import cache from '../../util/cache.js';

/* ------------------------------------------------------------------
 * Article Processor
 * ------------------------------------------------------------------ */

// Delay in milliseconds when rate limited by OpenAI API
const RATE_LIMIT_DELAY_MS = 3000; // 3 seconds delay when rate limited

// Mutex for sequential OpenAI API calls when rate limited
let openAIQueue = Promise.resolve();

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
      fields.title
    );

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


/* ======================================================
   Extract entry fields
   ------------------------------------------------------
   Extracts relevant fields from the RSS/Atom entry
====================================================== */
function extractEntryFields(entry) {
  return {
    title: entry.title?.trim() || 'Untitled',
    link: entry.links?.[0]?.href || entry.link,
    description:
      entry.description ||
      entry.summary ||
      entry.contentSnippet ||
      null,
    content:
      entry.content?.encoded ||
      entry.content ||
      entry.description ||
      null,
    author:
      entry.dc?.creator ||
      entry.author ||
      entry.dc?.creators?.[0] ||
      null
  };
}


/* ======================================================
   Find existing article
   ------------------------------------------------------
   Prevents duplicates based on URL or title+feed+user
====================================================== */
async function findExistingArticle(feed, title, link) {
  return Article.findOne({
    where: {
      [Op.or]: [
        { url: link },
        {
          [Op.and]: [
            { title },
            { feedId: feed.id },
            { userId: feed.userId }
          ]
        }
      ]
    }
  });
}


/* ======================================================
   Media processing
   ------------------------------------------------------
   Handles media feeds (e.g. YouTube, podcast enclosures)
   and extracts lead image + preview HTML
====================================================== */
function processMedia(entry) {
  if (!entry.media) return {};

  const rawMedia = entry.media;

  // Normalize media to array (feedsmith quirk)
  const mediaArray = Array.isArray(rawMedia)
    ? rawMedia
    : rawMedia?.group?.contents || [];

  if (!mediaArray.length) return {};

  // Collect media items
  const mediaItems = mediaArray.map(m => ({
    type: m.type || 'video',
    url: m.url || m.player?.url || null,
    image:
      m.image ||
      m.thumbnail ||
      rawMedia?.group?.thumbnails?.[0]?.url ||
      null,
    title: m.title?.value || m.title || null
  }));

  // Pick lead image (first image found)
  const leadImage =
    mediaItems.find(m => m.image)?.image || null;

  // Build content from FIRST media item
  const media = mediaItems[0];

  const content = `
    <div class="media-content">
      ${media.image ? `<img src="${media.image}" alt="${media.title || 'Media'}" style="max-width:100%;height:auto;">` : ''}
      ${media.title ? `<h5>${media.title}</h5>` : ''}
      ${media.url ? `<p><a href="${media.url}" target="_blank">View Media</a></p>` : ''}
    </div>
  `;

  return { content, leadImage };
}


/* ======================================================
   HTML parsing & sanitization
   ------------------------------------------------------
   - Removes script tags
   - Collects outbound links for hotlinking
   - Strips HTML for content analysis
   - Detects language
====================================================== */
function processHtmlContent(entryContent, entryLink, feed, entryTitle) {
  try {
    // htmlparser2 has error-correcting mechanisms,
    // which may be useful when parsing non-HTML content.
    const dom = htmlparser2.parseDocument(entryContent);
    const $ = load(dom, { _useHtmlParser2: true });

    // Remove all script tags from post content
    $('script').remove();

    // Execute hotlink feature by collecting all the links in each RSS post
    // https://github.com/passiomatic/coldsweat/issues/68#issuecomment-272963268
    $('a').each(function () {
      let domain;
      try {
        if (!entryLink) return;
        domain = new URL(entryLink).hostname;
      } catch (err) {
        domain = entryLink;
      }

      // Fetch all URLs referenced to other websites
      const href = $(this).attr('href');
      if (
        href &&
        !href.includes(domain) &&
        (href.startsWith('http://') || href.startsWith('https://'))
      ) {
        // Update cache
        cache.set(href, feed.userId);
      }
    });

    const html = $.html();
    let detectedLanguage = 'unknown';

    try {
      detectedLanguage = language.get(html);
    } catch (err) {
      console.error(
        `[${feed.feedName}] Error detecting language for article "${entryTitle}":`,
        err.message
      );
    }

    return {
      content: html,
      stripped: striptags(html, ['a', 'img', 'strong']),
      language: detectedLanguage
    };
  } catch (err) {
    console.error(
      `[${feed.feedName}] Error parsing content for article "${entryTitle}":`,
      err.message
    );
    return {
      content: entryContent,
      stripped: entryContent,
      language: 'unknown'
    };
  }
}


/* ======================================================
   Apply action rules
   ------------------------------------------------------
   Applies user-defined regex actions:
   - delete
   - read
   - advertisement
   - bad quality
   - star
   - clicked
====================================================== */
function applyActions(actions, strippedContent, title) {
  const result = {
    starInd: 0,
    clickedInd: 0,
    status: 'unread',
    shouldDelete: false,
    advertisementScore: null,
    qualityScore: null
  };

  for (const action of actions) {
    if (!action.regularExpression) continue;

    let regex;
    try {
      regex = new RegExp(action.regularExpression);
    } catch (err) {
      console.error(`Error testing regex for action "${action.name}"`);
      continue;
    }

    if (!regex.test(strippedContent)) continue;

    switch (action.actionType) {
      // Delete action: takes precedence over all others
      case 'delete':
        console.log(`Delete action "${action.name}" matched article "${title}". Skipping article creation.`);
        result.shouldDelete = true;
        return result;

      // Read action: marks article as read
      case 'read':
        result.status = 'read';
        break;

      // Advertisement action: marks article as advertisement
      case 'advertisement':
        result.advertisementScore = 100;
        break;

      // Bad quality action
      case 'badquality':
        result.qualityScore = 100;
        break;

      // Star action: marks article as important
      case 'star':
        result.starInd = 1;
        break;

      // Clicked action: read-later indicator
      case 'clicked':
        result.clickedInd = 1;
        break;
    }
  }

  return result;
}


/* ======================================================
   OpenAI analysis (rate limited)
   ------------------------------------------------------
   Generates:
   - summary
   - tags
   - advertisement score
   - sentiment score
   - quality score
====================================================== */
async function analyzeArticleContent(strippedContent, title) {
  let analysis = {
    summary: strippedContent,
    tags: [],
    advertisementScore: 0,
    sentimentScore: 50,
    qualityScore: 50
  };

  // Only analyze content if OpenAI API key is configured
  if (!process.env.OPENAI_API_KEY) return analysis;

  // Use a queue to ensure sequential API calls and respect rate limits
  await new Promise(resolve => {
    openAIQueue = openAIQueue.then(async () => {
      try {
        // Apply rate limit delay if we hit a rate limit previously
        if (rateLimitDelay > 0) {
          await new Promise(r => setTimeout(r, rateLimitDelay));
        }

        analysis = await analyzeContent(strippedContent);
        console.log(`[OpenAI LLM] Analysis completed for "${title}"`);
      } catch (err) {
        if (
          err.message?.includes('429') ||
          err.message?.toLowerCase().includes('rate limit')
        ) {
          rateLimitDelay = RATE_LIMIT_DELAY_MS;
          console.warn(
            `[OpenAI LLM] Rate limit hit, enabling delay for subsequent requests`
          );
        }
        console.error('Error analyzing content:', err.message);
      }
      resolve();
    });
  });

  return analysis;
}


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
    content: data.rawContent,
    contentStripped: analysis.summary,
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

export default processArticle;