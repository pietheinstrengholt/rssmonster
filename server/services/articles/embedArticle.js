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
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  return cleaned.split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(Boolean);
}

// This function detects exact and near-identical embedding text units.
function isEffectivelyDuplicate(candidate, acceptedTexts) {
  const normalizedCandidate = normalizeComparableText(candidate);
  if (!normalizedCandidate) return true;

  const candidateTokens = new Set(normalizedCandidate.split(' '));

  return acceptedTexts.some(existing => {
    const normalizedExisting = normalizeComparableText(existing);
    if (normalizedCandidate === normalizedExisting) return true;

    const existingTokens = new Set(normalizedExisting.split(' '));
    const union = new Set([...candidateTokens, ...existingTokens]);
    if (!union.size) return true;

    let intersection = 0;
    for (const token of candidateTokens) {
      if (existingTokens.has(token)) intersection++;
    }

    return intersection / union.size >= 0.9;
  });
}

// This function keeps unique sentences and records them for later section comparisons.
function uniqueSentences(texts, acceptedTexts) {
  const unique = [];

  for (const text of texts) {
    if (isEffectivelyDuplicate(text, acceptedTexts)) continue;
    unique.push(text);
    acceptedTexts.push(text);
  }

  return unique;
}

// This function builds structured event text from unique title, summary, and body evidence.
function extractEventText({ title, description, contentText }) {
  const sections = [];
  const acceptedTexts = [];

  const t = normalizeTitle(title);
  if (t) {
    sections.push(`Title: ${t}`);
    acceptedTexts.push(t);
  }

  if (description && !isLikelyHtml(description)) {
    const summarySentences = uniqueSentences(splitSentences(description), acceptedTexts);
    if (summarySentences.length) {
      sections.push(`Summary: ${summarySentences.join(' ')}`);
    }
  }

  if (contentText && !isLikelyHtml(contentText)) {
    const bodyParagraphs = [];

    for (const paragraph of extractParagraphs(contentText)) {
      const sentences = uniqueSentences(splitSentences(paragraph), acceptedTexts);
      if (!sentences.length) continue;

      bodyParagraphs.push(sentences.join(' '));
      if (bodyParagraphs.length === 2) break;
    }

    if (bodyParagraphs.length) {
      sections.push(`Body: ${bodyParagraphs.join(' ')}`);
    }
  }

  return sections.join('\n').trim();
}

// This function builds longer topic-oriented text from article body content.
function extractTopicText({ contentText }) {
  if (!contentText || isLikelyHtml(contentText)) return '';

  const paragraphs = extractParagraphs(contentText);
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
  const description = articleOrInput?.description || '';
  const contentText = articleOrInput?.contentText || '';

  return clipToEmbeddingTokenLimit(extractEventText({ title, description, contentText }));
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
  const description = article ? article.description : articleOrInput?.description;
  const contentText = article ? article.contentText : articleOrInput?.contentText;
  const topicContentText = contentText || description || '';

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
    return null;
  }

  const eventText = buildArticleEventEmbeddingText({ title, description, contentText });
  const topicText = extractTopicText({ contentText: topicContentText });

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
