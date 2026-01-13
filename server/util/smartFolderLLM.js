// util/smartFolderLLM.util.js
import OpenAI from 'openai';

const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const client = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Attempt to safely extract JSON from an LLM response.
 */
function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Remove markdown fences if present
  const cleaned = raw
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/, '')
    .trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to extract first JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function getSmartFolderRecommendations({ insights }) {
  if (!client) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `
  You generate PERSONALIZED Smart Folder suggestions for an RSS reader.

  Your PRIMARY goal is to reflect the user's demonstrated interests.
  Generic folders are allowed, but must NOT dominate the result.

  --------------------
  SIGNAL PRIORITY (VERY IMPORTANT)
  --------------------

  When generating Smart Folders, you MUST prioritize signals in this order:

  1. starredItems (STRONGEST SIGNAL - explicit user intent)
  2. interests.topTags and tag frequency
  3. feed-level behavior (high unreadRatio, starred per feed)
  4. general engagement patterns (unread, clicked, freshness, quality)

  At least:
  - 2-3 suggestions MUST be clearly derived from starredItems
  - 1-2 suggestions SHOULD be derived from tags
  - At most 1-2 suggestions may be generic

  --------------------
  SUPPORTED FILTERING EXPRESSIONS (STRICT)
  --------------------

  You MUST produce queries using ONLY the following:

  Boolean filters:
  - star:true | star:false
  - unread:true | unread:false
  - read:true | read:false
  - clicked:true | clicked:false

  Tag filter:
  - tag:<text>

  Title-only filter:
  - title:<text>

  Free-text content search:
  - <text>
    (Searches article title + content. Use for broader or thematic matching.)

  Numeric filters:
  - quality:<number>, quality:>number, quality:<number, quality:>=number, quality:<=number
  - freshness:<number>, freshness:>number, freshness:<number, freshness:>=number, freshness:<=number

  Date filters:
  - @YYYY-MM-DD
  - @today
  - @yesterday

  Sorting:
  - sort:DESC
  - sort:ASC
  - sort:IMPORTANCE
  - sort:QUALITY

  --------------------
  RULES
  --------------------
  - Combine filters using spaces only
  - Do NOT use parentheses
  - Do NOT use AND / OR keywords
  - Do NOT invent unsupported fields (e.g. feed:, category:, author:)
  - Avoid duplicating existingSmartFolders
  - Suggest at most 5 Smart Folders
  - Prefer concise, high-signal queries

  --------------------
  GUIDANCE (IMPORTANT)
  --------------------

  When using starredItems:
  - Look for recurring themes, products, technologies, or entities in titles
  - Prefer free-text search (<text>) when the topic is conceptual or broad
    (e.g. "apple siri", "lego pokemon", "nintendo switch")
  - Prefer title:<text> only when the term is very specific or unique

  When using tags:
  - Prefer high-frequency and meaningful tags
  - Avoid duplicating existing Smart Folders unless you refine them
    (e.g. add unread:true or quality filter)

  Generic folders:
  - Use sparingly
  - Do NOT let them dominate the list

  --------------------
  INPUT (JSON)
  --------------------
  ${JSON.stringify(insights)}

  --------------------
  OUTPUT (STRICT JSON ONLY)
  --------------------
  {
    "smartFolders": [
      {
        "name": "string",
        "query": "string",
        "reason": "string (brief explanation tied to the user's behavior)"
      }
    ]
  }
  `;

  const response = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON. No markdown. No prose.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 300
  });

  const raw = response.choices?.[0]?.message?.content;
  console.log('Smart Folder LLM raw response:', raw);

  const parsed = safeJsonParse(raw);

  if (!parsed || !Array.isArray(parsed.smartFolders)) {
    console.warn('LLM returned invalid JSON, falling back to empty result');
    return { smartFolders: [] }; // ✅ graceful fallback
  }

  return parsed;
}