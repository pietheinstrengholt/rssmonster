import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

// Minimum text length to embed
const MIN_TEXT_LENGTH = 200;

// OpenAI client
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const openai = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Select text for embedding
 */
function selectEmbeddingText({ title, contentStripped, description }) {
  const parts = [];

  if (title) {
    parts.push(title.trim());
  }

  const body = contentStripped || description;
  if (body) {
    parts.push(
      body
        .replace(/\s+/g, " ")
        .replace(/https?:\/\/\S+/g, "")
        .slice(0, 1500)
    );
  }

  return parts.join("\n\n").trim();
}

/**
 * Generate embedding for article content
 * Returns null if embedding should be skipped
 */
export async function embedArticle({ title, contentStripped, description }) {
  if (!process.env.OPENAI_API_KEY) return null;

  const text = selectEmbeddingText({
    title,
    contentStripped,
    description
  });

  if (!text || text.length < MIN_TEXT_LENGTH) {
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
    console.warn("Embedding failed:", err.message);
    return null;
  }
}

export default embedArticle;
