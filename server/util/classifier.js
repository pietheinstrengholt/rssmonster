import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

/**
 * Generate comprehensive content analysis including SEO tags and quality scores.
 * 
 * @param {string} content - The article content to analyze
 * @returns {Promise<Object>} Object containing:
 *   - tags: Array of 5-7 SEO tags
 *   - advertisementScore: 0-100 (higher = more ads/promotional content)
 *   - sentimentScore: 0-100 (0 = very negative, 50 = neutral, 100 = very positive)
 *   - qualityScore: 0-100 (higher = better content quality)
 */
export const classifyContent = async (content) => {
  try {
    if (!content || typeof content !== "string" || !content.trim()) {
      throw new Error("Invalid content provided for classification");
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY not configured. Skipping content classification.");
      return {
        tags: [],
        advertisementScore: 0,
        sentimentScore: 50,
        qualityScore: 50
      };
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const modelName = process.env.OPENAI_MODEL_NAME || "gpt-4";

    const userPrompt = [
      "Analyze the following article content and provide:",
      "",
      "1. SEO Tags: Generate 5-7 relevant, high-volume SEO tags",
      "   - Keep each tag concise (1-3 words)",
      "   - No # symbols, punctuation, or emojis",
      "   - Avoid duplicates; prefer generic but accurate topic terms",
      "   - Use the same language as the original content",
      "",
      "2. Advertisement Score (0-100):",
      "   - 0 = No promotional content, pure editorial",
      "   - 50 = Moderate promotional elements",
      "   - 100 = Heavy advertisements, affiliate links, spam-like",
      "   - Consider: affiliate links (Amazon, etc.), product placements, sponsored content indicators, excessive CTAs",
      "",
      "3. Sentiment Score (0-100):",
      "   - 0 = Very negative (angry, critical, pessimistic)",
      "   - 50 = Neutral (balanced, objective, factual)",
      "   - 100 = Very positive (optimistic, enthusiastic, praising)",
      "",
      "4. Quality Score (0-100):",
      "   - Consider: depth of analysis, accuracy, writing quality, structure, originality",
      "   - 0-30 = Poor (clickbait, shallow, errors)",
      "   - 40-60 = Average (basic information, acceptable)",
      "   - 70-100 = High quality (well-researched, insightful, professional)",
      "",
      "Output ONLY a JSON object with this exact structure:",
      "{",
      '  "tags": ["tag1", "tag2", ...],',
      '  "advertisementScore": 0-100,',
      '  "sentimentScore": 0-100,',
      '  "qualityScore": 0-100',
      "}",
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
            "You are an expert content analyst. Analyze articles and provide SEO tags along with advertisement, sentiment, and quality scores. Always respond with valid JSON only, no additional text."
        },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_completion_tokens: 300
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";

    // Parse JSON response
    let result;
    try {
      result = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse OpenAI response as JSON:", raw);
      throw new Error("Invalid JSON response from OpenAI");
    }

    // Validate and normalize the response
    const tags = Array.isArray(result.tags) ? result.tags : [];
    const normalizedTags = Array.from(
      new Set(
        tags
          .map(String)
          .map((t) => t.replace(/[#"'`]/g, "").trim())
          .filter((t) => t.length > 0)
          .map((t) => (t.length > 48 ? t.slice(0, 48) : t))
      )
    ).slice(0, 7); // Limit to 7 tags

    // Ensure scores are valid numbers within 0-100 range
    const clamp = (val, min, max) => Math.max(min, Math.min(max, Number(val) || 0));

    return {
      tags: normalizedTags,
      advertisementScore: clamp(result.advertisementScore, 0, 100),
      sentimentScore: clamp(result.sentimentScore, 0, 100),
      qualityScore: clamp(result.qualityScore, 0, 100)
    };
  } catch (error) {
    console.error("Error in classifyContent:", error.message);
    return {
      tags: [],
      advertisementScore: 0,
      sentimentScore: 50,
      qualityScore: 50
    };
  }
};

export default {
  classifyContent
};