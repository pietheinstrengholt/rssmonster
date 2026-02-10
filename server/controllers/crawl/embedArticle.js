// controller/crawl/embedArticle.js
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Soft thresholds
 */
const MIN_BODY_LENGTH = 80;
const MAX_BODY_LENGTH = 2000;

/**
 * OpenAI client
 */
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const openai = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/* ------------------------------------------------------------------
 * Text normalization helpers
 * ------------------------------------------------------------------ */

function normalizeTitle(title = "") {
  return title
    .replace(/^(breaking|update|live|exclusive):?\s*/i, "")
    .replace(/\s+\|\s+.*$/, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();
}

function cleanBody(text = "") {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(read more|continue reading|sign up|subscribe|advertisement)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the most content-dense part of the article.
 * Bias toward the first meaningful paragraph, not raw position.
 */
function extractRepresentativeBody(text = "") {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => cleanBody(p))
    .filter(p => p.length >= 40);

  if (!paragraphs.length) return "";

  // Prefer the first paragraph with enough substance
  const primary = paragraphs.find(p => p.length >= MIN_BODY_LENGTH) || paragraphs[0];

  const remainder = paragraphs
    .filter(p => p !== primary)
    .join(" ")
    .slice(0, MAX_BODY_LENGTH - primary.length);

  return `${primary} ${remainder}`.slice(0, MAX_BODY_LENGTH).trim();
}

/* ------------------------------------------------------------------
 * Embedding text construction
 * ------------------------------------------------------------------ */

function isLikelyHtml(text = "") {
  return /<\/?(div|img|video|figure|span|a|p)[\s>]/i.test(text);
}

function chooseBodyText({ contentStripped, description }) {
  if (contentStripped && !isLikelyHtml(contentStripped)) {
    return contentStripped;
  }

  if (description && description.length > 60) {
    return description;
  }

  return "";
}

function buildEmbeddingText({ title, contentStripped, description }) {
  const normalizedTitle = normalizeTitle(title);
  const rawBody = chooseBodyText({ contentStripped, description });
  const body = extractRepresentativeBody(rawBody);

  const sections = [];

  if (normalizedTitle) {
    sections.push(`Title:\n${normalizedTitle}`);
  }

  if (body) {
    sections.push(`Content:\n${body}`);
  }

  return sections.join("\n\n").trim();
}

/* ------------------------------------------------------------------
 * Embedding
 * ------------------------------------------------------------------ */

/**
 * Generate embedding for article content.
 * Returns:
 *   - { vector, embedding_model } on success
 *   - null when embedding is intentionally skipped or fails
 */
export async function embedArticle({ title, contentStripped, description }) {
  if (!hasApiKey) {
    console.debug("[EMBED] skipped (no OPENAI_API_KEY)");
    return null;
  }

  const text = buildEmbeddingText({
    title,
    contentStripped,
    description
  });

  // Require *some* real signal beyond just boilerplate titles
  if (!text || text.length < 60) {
    console.debug(
      `[EMBED] skipped (len=${text?.length ?? 0}) title="${title?.slice(0, 60) ?? ""}"`
    );
    return null;
  }

  try {
    // Perform embedding with OpenAI API
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text
    });

    return {
      vector: response.data[0].embedding,
      embedding_model: EMBEDDING_MODEL
    };
  } catch (err) {
    // Soft-fail: embeddings should never break ingestion
    console.warn("[EMBED] failed:", err.message);
    return null;
  }
}

export default embedArticle;
