import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

/**
 * Generate 5-7 relevant, high-volume SEO tags for the given content using OpenAI.
 * - Returns concise tags (1-3 words), no hashes, no duplicates
 * - Tries to preserve the original language
 *
 * @param {string} content - The article content to analyze
 * @returns {Promise<string[]>} Array of tags
 */
export const generateSeoTags = async (content) => {
  try {
    if (!content || typeof content !== "string" || !content.trim()) {
      throw new Error("Invalid content provided for classification");
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY not configured. Skipping SEO tag generation.");
      return [];
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const modelName = process.env.OPENAI_MODEL_NAME || "gpt-4";

    const userPrompt = [
      "Generate a list of 5-7 relevant, high-volume SEO tags based on the following article content.",
      "Guidelines:",
      "- Keep each tag concise (1-3 words)",
      "- No # symbols, punctuation, or emojis",
      "- Avoid duplicates; prefer generic but accurate topic terms",
      "- Use the same language as the original content",
      "- Output ONLY a JSON array of strings, no prose",
      "",
      "Content:",
      content
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content:
            "You are an expert SEO tagging assistant. Given article content, produce 5-7 concise, high-volume SEO tags in the original language. Respond strictly as a JSON array of strings with no extra text."
        },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_completion_tokens: 150
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";

    // Try to parse JSON array directly
    let tags;
    try {
      tags = JSON.parse(raw);
    } catch (e) {
      // Fallback: parse comma or newline separated text
      tags = raw
        .replace(/^[\[\(\{\s]+|[\]\)\}\s]+$/g, "")
        .split(/[\n,]+/)
        .map((t) => t.replace(/^"|"$/g, "").trim())
        .filter(Boolean);
    }

    // Normalize & sanitize
    const normalized = Array.from(
      new Set(
        (Array.isArray(tags) ? tags : [])
          .map(String)
          .map((t) => t.replace(/[#"'`]/g, "").trim())
          .filter((t) => t.length > 0)
          .map((t) => (t.length > 48 ? t.slice(0, 48) : t))
      )
    );

    // Enforce 5-7 tags boundary
    if (normalized.length > 7) return normalized.slice(0, 7);
    if (normalized.length >= 5) return normalized;

    // If fewer than 5, attempt to pad by splitting phrases; otherwise return what we have
    return normalized;
  } catch (error) {
    console.error("Error in generateSeoTags:", error.message);
    return [];
  }
};

export default {
  generateSeoTags
};