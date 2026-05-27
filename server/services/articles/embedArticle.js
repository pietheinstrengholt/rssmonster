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

const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const openai = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function normalizeTitle(title = '') {
  return title
    .replace(/^(breaking|update|live|exclusive):?\s*/i, '')
    .replace(/\s+\|\s+.*$/, '')
    .replace(/\s+-\s+.*$/, '')
    .trim();
}

function isLikelyHtml(text = '') {
  return /<\/?(div|img|video|figure|span|a)[\s>]/i.test(text);
}

function cleanText(text = '') {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b(read more|continue reading|sign up|subscribe|advertisement)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractParagraphs(text = '') {
  return text
    .split(/\n{2,}/)
    .map(p => cleanText(p))
    .filter(p => p.length >= 40);
}

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

function extractTopicText({ contentStripped }) {
  if (!contentStripped || isLikelyHtml(contentStripped)) return '';

  const paragraphs = extractParagraphs(contentStripped);
  if (!paragraphs.length) return '';

  return paragraphs
    .join(' ')
    .slice(0, MAX_TOPIC_LENGTH)
    .trim();
}

export function buildArticleEventEmbeddingText(articleOrInput = {}) {
  const title = articleOrInput?.title;
  const contentStripped = articleOrInput?.contentStripped || articleOrInput?.description || '';

  return extractEventText({ title, contentStripped });
}

export function isArticleEventEmbeddingTextUsable(text = '') {
  return String(text || '').length >= MIN_EVENT_LENGTH;
}

async function embed(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text
  });

  return response.data[0].embedding;
}

function hasArticleVector(article) {
  return Array.isArray(article?.articleVector) && article.articleVector.length > 0;
}

function isArticleInstance(record) {
  return Boolean(record && typeof record.update === 'function');
}

export async function embedArticle(articleOrInput, options = {}) {
  // `persist=true` means this function owns writing vectors to the Article row.
  const { persist = true } = options;
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

  const eventText = buildArticleEventEmbeddingText({ title, contentStripped });
  const topicText = extractTopicText({ contentStripped });

  if (eventText.length < MIN_EVENT_LENGTH) {
    console.debug(
      `[EMBED] skipped (event too short: ${eventText.length}) title="${title?.slice(0, 60) ?? ''}"`
    );
    return null;
  }

  try {
    const [eventVector, topicVector] = await Promise.all([
      embed(eventText),
      topicText.length >= MIN_TOPIC_LENGTH ? embed(topicText) : Promise.resolve(null)
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
