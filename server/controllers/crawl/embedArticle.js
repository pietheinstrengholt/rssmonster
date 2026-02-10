// controller/crawl/embedArticle.js
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Length constraints
 */
const MIN_EVENT_LENGTH = 60;
const MIN_TOPIC_LENGTH = 120;
const MAX_TOPIC_LENGTH = 2200;

/**
 * OpenAI client
 */
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const openai = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/* ------------------------------------------------------------------
 * Normalization helpers
 * ------------------------------------------------------------------ */

function normalizeTitle(title = "") {
  return title
    .replace(/^(breaking|update|live|exclusive):?\s*/i, "")
    .replace(/\s+\|\s+.*$/, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();
}

function isLikelyHtml(text = "") {
  return /<\/?(div|img|video|figure|span|a)[\s>]/i.test(text);
}

function cleanText(text = "") {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(read more|continue reading|sign up|subscribe|advertisement)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------
 * Text extraction
 * ------------------------------------------------------------------ */

function extractParagraphs(text = "") {
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
      parts.push(paragraphs[0]); // first factual paragraph
    }
  }

  return parts.join(" ").trim();
}

function extractTopicText({ contentStripped }) {
  if (!contentStripped || isLikelyHtml(contentStripped)) return "";

  const paragraphs = extractParagraphs(contentStripped);
  if (!paragraphs.length) return "";

  return paragraphs
    .join(" ")
    .slice(0, MAX_TOPIC_LENGTH)
    .trim();
}

/* ------------------------------------------------------------------
 * Embedding
 * ------------------------------------------------------------------ */

async function embed(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text
  });

  return response.data[0].embedding;
}

/**
 * Generate event + topic embeddings.
 */
export async function embedArticle({ title, contentStripped }) {
  if (!hasApiKey) {
    console.debug("[EMBED] skipped (no OPENAI_API_KEY)");
    return null;
  }

  const eventText = extractEventText({ title, contentStripped });
  const topicText = extractTopicText({ contentStripped });

  if (eventText.length < MIN_EVENT_LENGTH) {
    console.debug(
      `[EMBED] skipped (event too short: ${eventText.length}) title="${title?.slice(0, 60) ?? ""}"`
    );
    return null;
  }

  try {
    const [eventVector, topicVector] = await Promise.all([
      embed(eventText),
      topicText.length >= MIN_TOPIC_LENGTH ? embed(topicText) : Promise.resolve(null)
    ]);

    return {
      eventVector,
      topicVector,
      embedding_model: EMBEDDING_MODEL
    };
  } catch (err) {
    console.warn("[EMBED] failed:", err.message);
    return null;
  }
}

export default embedArticle;