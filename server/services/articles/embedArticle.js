// services/articles/embedArticle.js
import {
  DEFAULT_EMBEDDING_MODEL,
  embedTexts
} from '../embeddings/embeddingService.js';
import { shouldSkipArticleEmbeddings } from '../../config/intelligentFeatures.js';

/**
 * Core article embedding utility.
 *
 * Responsibilities:
 * 1) Build embedding input text from article fields.
 * 2) Request vectors from the embedding provider.
 * 3) Optionally persist `articleVector` + `embedding_model` on the Article row.
 *
 * This is the single source of truth for article-vector creation and storage.
 */

// Defines the embedding model enforced by this service.
export const EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL;

// Defines the min event length enforced by this service.
const MIN_EVENT_LENGTH = 60;
// Defines the min topic length enforced by this service.
const MIN_TOPIC_LENGTH = 120;
// Defines the max topic length enforced by this service.
const MAX_TOPIC_LENGTH = 2200;
// Defines the max embedding input tokens enforced by this service.
const MAX_EMBEDDING_INPUT_TOKENS = 512;

// This function strips common news prefixes and source suffixes from titles.
function normalizeTitle(title = '') {
  return title
    .replace(/^(breaking|update|live|exclusive):?\s*/i, '')
    .replace(/\s+\|\s+.*$/, '')
    .replace(/\s+-\s+.*$/, '')
    .trim();
}

// This function detects content that still looks like raw HTML.
function isLikelyHtml(text = '') {
  return /<\/?(div|img|video|figure|span|a)[\s>]/i.test(text);
}

// This function removes URLs, boilerplate calls to action, and excess whitespace.
function cleanText(text = '') {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b(read more|continue reading|sign up|subscribe|advertisement)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// This function extracts usable plain-text paragraphs from article body text.
function extractParagraphs(text = '') {
  // Maps source values into the result produced while extracting paragraphs.
  return text
    .split(/\n{2,}/)
    .map(p => cleanText(p))
    .filter(p => p.length >= 40);
}

// This function normalizes text for duplicate sentence comparisons.
function normalizeComparableText(text = '') {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// This function splits cleaned article text into sentence-sized embedding units.
function splitSentences(text = '') {
  // Normalizes the cleaned before performing split sentences.
  const cleaned = cleanText(text);
  // Returns an empty result when cleaned is unavailable.
  if (!cleaned) return [];

  // Maps source values into the result produced while performing split sentences.
  return cleaned.split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(Boolean);
}

// This function detects exact and near-identical embedding text units.
function isEffectivelyDuplicate(candidate, acceptedTexts) {
  // Normalizes the candidate before checking effectively duplicate.
  const normalizedCandidate = normalizeComparableText(candidate);
  // Returns early when normalized candidate is unavailable.
  if (!normalizedCandidate) return true;

  // Tracks distinct candidate tokens while checking effectively duplicate.
  const candidateTokens = new Set(normalizedCandidate.split(' '));

  // Checks candidate values while checking effectively duplicate.
  return acceptedTexts.some(existing => {
    // Normalizes the existing before checking effectively duplicate.
    const normalizedExisting = normalizeComparableText(existing);
    // Returns early when normalized candidate is normalized existing.
    if (normalizedCandidate === normalizedExisting) return true;

    // Tracks distinct existing tokens while checking effectively duplicate.
    const existingTokens = new Set(normalizedExisting.split(' '));
    // Tracks distinct union while checking effectively duplicate.
    const union = new Set([...candidateTokens, ...existingTokens]);
    // Returns early when union size is unavailable.
    if (!union.size) return true;

    let intersection = 0;
    // Processes each candidate tokens entry in turn.
    for (const token of candidateTokens) {
      // Handles the case where existing tokens contains token.
      if (existingTokens.has(token)) intersection++;
    }

    return intersection / union.size >= 0.9;
  });
}

// This function keeps unique sentences and records them for later section comparisons.
function uniqueSentences(texts, acceptedTexts) {
  // Collects the unique while performing unique sentences.
  const unique = [];

  // Processes each texts entry in turn.
  for (const text of texts) {
    // Skips the current entry when text is effectively duplicate.
    if (isEffectivelyDuplicate(text, acceptedTexts)) continue;
    unique.push(text);
    acceptedTexts.push(text);
  }

  return unique;
}

// This function builds structured event text from unique title, summary, and body evidence.
function extractEventText({ title, description, contentText }) {
  // Collects the sections while extracting event text.
  const sections = [];
  // Collects the accepted texts while extracting event text.
  const acceptedTexts = [];

  // Normalizes the t before extracting event text.
  const t = normalizeTitle(title);
  // Handles the case where t is available.
  if (t) {
    sections.push(`Title: ${t}`);
    acceptedTexts.push(t);
  }

  // Handles the case where description is available and description is not likely html.
  if (description && !isLikelyHtml(description)) {
    // Derives the summary sentences through unique sentences while extracting event text.
    const summarySentences = uniqueSentences(splitSentences(description), acceptedTexts);
    // Handles the case where summary sentences is non-empty.
    if (summarySentences.length) {
      sections.push(`Summary: ${summarySentences.join(' ')}`);
    }
  }

  // Handles the case where content text is available and content text is not likely html.
  if (contentText && !isLikelyHtml(contentText)) {
    // Collects the body paragraphs while extracting event text.
    const bodyParagraphs = [];

    // Processes each extract paragraphs entry in turn.
    for (const paragraph of extractParagraphs(contentText)) {
      // Derives the sentences through unique sentences while extracting event text.
      const sentences = uniqueSentences(splitSentences(paragraph), acceptedTexts);
      // Skips the current entry when sentences is empty.
      if (!sentences.length) continue;

      bodyParagraphs.push(sentences.join(' '));
      // Stops collecting values when body paragraphs count is 2.
      if (bodyParagraphs.length === 2) break;
    }

    // Handles the case where body paragraphs is non-empty.
    if (bodyParagraphs.length) {
      sections.push(`Body: ${bodyParagraphs.join(' ')}`);
    }
  }

  return sections.join('\n').trim();
}

// This function builds longer topic-oriented text from article body content.
function extractTopicText({ contentText }) {
  // Returns early when content text is unavailable or content text is likely html.
  if (!contentText || isLikelyHtml(contentText)) return '';

  // Extracts the paragraphs while extracting topic text.
  const paragraphs = extractParagraphs(contentText);
  // Returns early when paragraphs is empty.
  if (!paragraphs.length) return '';

  return paragraphs
    .join(' ')
    .slice(0, MAX_TOPIC_LENGTH)
    .trim();
}

// This function estimates token count with a conservative whitespace heuristic.
function estimateTokenCount(text = '') {
  // Normalizes the normalized before performing estimate token count.
  const normalized = String(text || '').trim();
  // Returns early when normalized is unavailable.
  if (!normalized) return 0;
  return normalized.split(/\s+/).length;
}

// This function clips text to the embedding token budget using the local token estimate.
function clipToEmbeddingTokenLimit(text = '') {
  // Normalizes the normalized before performing clip to embedding token limit.
  const normalized = String(text || '').trim();
  // Returns early when normalized is unavailable.
  if (!normalized) return '';

  // Derives the tokens through split while performing clip to embedding token limit.
  const tokens = normalized.split(/\s+/);
  // Returns early when tokens count is at most max embedding input tokens.
  if (tokens.length <= MAX_EMBEDDING_INPUT_TOKENS) return normalized;

  return tokens.slice(0, MAX_EMBEDDING_INPUT_TOKENS).join(' ');
}

// This function enforces a max token budget before calling the embedding API.
function isWithinEmbeddingTokenLimit(text = '') {
  return estimateTokenCount(text) <= MAX_EMBEDDING_INPUT_TOKENS;
}

// This function exposes the event embedding text builder for tests and callers.
export function buildArticleEventEmbeddingText(articleOrInput = {}) {
  const title = articleOrInput?.title;
  // Derives the description required while building article event embedding text.
  const description = articleOrInput?.description || '';
  // Derives the content text required while building article event embedding text.
  const contentText = articleOrInput?.contentText || '';

  return clipToEmbeddingTokenLimit(extractEventText({ title, description, contentText }));
}

// This function checks whether event embedding input is long enough to be useful.
export function isArticleEventEmbeddingTextUsable(text = '') {
  return String(text || '').length >= MIN_EVENT_LENGTH;
}

// This function checks whether an article already has a stored vector.
function hasArticleVector(article) {
  return Array.isArray(article?.articleVector) && article.articleVector.length > 0;
}

// This function detects Sequelize article instances that can persist updates.
function isArticleInstance(record) {
  return Boolean(record && typeof record.update === 'function');
}

// This function embeds one article or input object and optionally persists the event vector.
// It returns both event and topic vectors when enough text is available.
export async function embedArticle(articleOrInput, options = {}) {
  if (shouldSkipArticleEmbeddings()) return null;

  // `persist=true` means this function owns writing vectors to the Article row.
  const { allowShortEventText = false, persist = true } = options;
  // Selects the article based on whether article or input is article instance.
  const article = isArticleInstance(articleOrInput) ? articleOrInput : null;

  // Selects the title based on whether article is available.
  const title = article ? article.title : articleOrInput?.title;
  // Selects the description based on whether article is available.
  const description = article ? article.description : articleOrInput?.description;
  // Selects the content text based on whether article is available.
  const contentText = article ? article.contentText : articleOrInput?.contentText;
  // Derives the topic content text required while performing embed article.
  const topicContentText = contentText || description || '';

  // Returns early when article is available and has article vector succeeds.
  if (article && hasArticleVector(article)) {
    // Fast-path: skip provider call when vector already exists.
    return {
      eventVector: article.articleVector,
      topicVector: null,
      embedding_model: article.embedding_model || EMBEDDING_MODEL,
      reused: true
    };
  }

  // Builds the article event embedding text while performing embed article.
  const eventText = buildArticleEventEmbeddingText({ title, description, contentText });
  // Extracts the topic text while performing embed article.
  const topicText = extractTopicText({ contentText: topicContentText });

  // Returns no result when event text is unavailable or allow short event text is unavailable and event text count is below min event length.
  if (!eventText || (!allowShortEventText && eventText.length < MIN_EVENT_LENGTH)) {
    return null;
  }

  try {
    // Selects the values based on whether topic text count reaches min topic length and topic text is within embedding token limit.
    const includeTopicVector = topicText.length >= MIN_TOPIC_LENGTH
      && isWithinEmbeddingTokenLimit(topicText);
    const response = await embedTexts(includeTopicVector ? [eventText, topicText] : [eventText]);
    const eventVector = response.embeddings[0] || null;
    const topicVector = includeTopicVector ? response.embeddings[1] || null : null;
    const embeddingModel = response.model || EMBEDDING_MODEL;

    // Handles the case where article is available and persist is available and event vector is available.
    if (article && persist && eventVector) {
      // Keep persistence logic centralized in this module.
      await article.update({
        articleVector: eventVector,
        embedding_model: embeddingModel
      });

      article.articleVector = eventVector;
      article.embedding_model = embeddingModel;
    }

    return {
      eventVector,
      topicVector,
      embedding_model: embeddingModel,
      reused: false
    };
  } catch (err) {
    console.warn('[EMBED] failed:', err.message);
    return null;
  }
}

export default embedArticle;
