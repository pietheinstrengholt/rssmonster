// services/articles/embedArticle.js
import OpenAI from 'openai';

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

export const EMBEDDING_MODEL = 'text-embedding-3-small';

const MIN_EVENT_LENGTH = 60;
const MIN_TOPIC_LENGTH = 120;
const MAX_TOPIC_LENGTH = 2200;
const MAX_EMBEDDING_INPUT_TOKENS = 512;

const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const openai = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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
  return text
    .split(/\n{2,}/)
    .map(p => cleanText(p))
    .filter(p => p.length >= 40);
}

// This function builds concise event-oriented text from title and early content.
function extractEventText({ title, contentStripped }) {
  const parts = [];

  const t = normalizeTitle(title);
  if (t) parts.push(t);

  if (contentStripped && !isLikelyHtml(contentStripped)) {
    const paragraphs = extractParagraphs(contentStripped);
    if (paragraphs.length) {
      parts.push(paragraphs.slice(0, 2).join(' '));
    }
  }

  return parts.join(' ').trim();
}

// This function builds longer topic-oriented text from article body content.
function extractTopicText({ contentStripped }) {
  if (!contentStripped || isLikelyHtml(contentStripped)) return '';

  const paragraphs = extractParagraphs(contentStripped);
  if (!paragraphs.length) return '';

  return paragraphs
    .join(' ')
    .slice(0, MAX_TOPIC_LENGTH)
    .trim();
}

// This function estimates token count with a conservative whitespace heuristic.
function estimateTokenCount(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).length;
}

// This function clips text to the embedding token budget using the local token estimate.
function clipToEmbeddingTokenLimit(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return '';

  const tokens = normalized.split(/\s+/);
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
  const contentStripped = articleOrInput?.contentStripped || articleOrInput?.description || '';

  return extractEventText({ title, contentStripped });
}

// This function checks whether event embedding input is long enough to be useful.
export function isArticleEventEmbeddingTextUsable(text = '') {
  return String(text || '').length >= MIN_EVENT_LENGTH;
}

// This function sends text to the embedding provider and returns the vector.
async function embed(text) {
  if (!isWithinEmbeddingTokenLimit(text)) {
    return null;
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text
  });

  return response.data[0].embedding;
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
  // `persist=true` means this function owns writing vectors to the Article row.
  const { allowShortEventText = false, persist = true } = options;
  const article = isArticleInstance(articleOrInput) ? articleOrInput : null;

  const title = article ? article.title : articleOrInput?.title;
  const contentStripped = article
    ? (article.contentStripped || article.description || '')
    : (articleOrInput?.contentStripped || '');

  if (article && hasArticleVector(article)) {
    // Fast-path: skip provider call when vector already exists.
    return {
      eventVector: article.articleVector,
      topicVector: null,
      embedding_model: article.embedding_model || EMBEDDING_MODEL,
      reused: true
    };
  }

  if (!hasApiKey) {
    console.debug('[EMBED] skipped (no OPENAI_API_KEY)');
    return null;
  }

  const eventText = clipToEmbeddingTokenLimit(
    buildArticleEventEmbeddingText({ title, contentStripped })
  );
  const topicText = extractTopicText({ contentStripped });

  if (!eventText || (!allowShortEventText && eventText.length < MIN_EVENT_LENGTH)) {
    return null;
  }

  try {
    const [eventVector, topicVector] = await Promise.all([
      embed(eventText),
      topicText.length >= MIN_TOPIC_LENGTH
      && isWithinEmbeddingTokenLimit(topicText)
        ? embed(topicText)
        : Promise.resolve(null)
    ]);

    if (article && persist && eventVector) {
      // Keep persistence logic centralized in this module.
      await article.update({
        articleVector: eventVector,
        embedding_model: EMBEDDING_MODEL
      });

      article.articleVector = eventVector;
      article.embedding_model = EMBEDDING_MODEL;
    }

    return {
      eventVector,
      topicVector,
      embedding_model: EMBEDDING_MODEL,
      reused: false
    };
  } catch (err) {
    console.warn('[EMBED] failed:', err.message);
    return null;
  }
}

export default embedArticle;
