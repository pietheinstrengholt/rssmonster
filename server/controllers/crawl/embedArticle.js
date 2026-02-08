//controller/crawl/embedArticle.js
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Minimum text length to embed.
 * Lowered to better support RSS summaries + headlines.
 */
const MIN_TEXT_LENGTH = 120;

/**
 * OpenAI client
 */
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const openai = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/* ------------------------------------------------------------------
 * Text selection
 * ------------------------------------------------------------------ */

/**
 * Select text for embedding.
 * Combines title + stripped content or description.
 */
function normalizeTitle(title = '') {
  return title
    .replace(/^(breaking|update|live):?\s*/i, '')
    .replace(/\s+\|\s+.*$/, '')
    .trim();
}

function selectEmbeddingText({ title, contentStripped, description }) {
  const parts = [];

  if (title) {
    parts.push(normalizeTitle(title));
  }

  const body = contentStripped || description;
  if (body) {
    parts.push(
      body
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 1500)
        .trim()
    );
  }

  return parts.join('\n\n').trim();
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
  // Global kill-switch (e.g. missing key in worker process)
  if (!hasApiKey) {
    console.debug("[EMBED] skipped (no OPENAI_API_KEY)");
    return null;
  }

  const text = selectEmbeddingText({
    title,
    contentStripped,
    description
  });

  if (!text || text.length < MIN_TEXT_LENGTH) {
    console.debug(
      `[EMBED] skipped (len=${text?.length ?? 0}) title="${title?.slice(0, 60) ?? ''}"`
    );
    return null;
  }

  try {
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