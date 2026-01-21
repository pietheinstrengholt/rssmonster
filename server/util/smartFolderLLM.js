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

Personalization should be driven by CONVERGING SIGNALS:
keywords, topics, or entities that appear across multiple sources
(starredItems, feed names, and tags).

If no strong convergence exists, you may include a small number of
generally useful folders — but they must not dominate the result.
Returning an empty list is NOT allowed.

--------------------
SIGNAL PRIORITY & CONVERGENCE (VERY IMPORTANT)
--------------------

When generating Smart Folders, look for topics that appear in
MULTIPLE of the following places:

1. starredItems (strongest signal – explicit user intent)
2. feed names with high starred counts
3. interests.topTags and frequent tags
4. general engagement patterns

A topic that appears in two or more of these sources should be treated
as a STRONG personal interest.

--------------------
GUIDELINES
--------------------

- Prefer Smart Folders based on topics with clear signal overlap
  (e.g. a keyword appearing in feed name + starred item + tag)
- If such a topic does not yet have a Smart Folder, you SHOULD propose one
- Use free-text search or tag-based filters to capture the topic
- 2-3 suggestions should be strongly personalized
- 1-2 suggestions may be more generic if needed

If starredItems are diverse:
- You MAY generalize overlapping themes
  (e.g. "Apple", "Nintendo", "Gaming", "Gadgets", "Software")
- Avoid overly broad concepts unless they clearly recur

Do NOT propose folders that merely restate existingSmartFolders
unless you meaningfully refine them (e.g. add unread:true or quality filters).

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
- sort:DESC | sort:ASC | sort:IMPORTANCE | sort:QUALITY | sort:ATTENTION

--------------------
RULES
--------------------
- Combine filters using spaces only
- Do NOT use parentheses
- Do NOT use AND / OR
- Avoid duplicating existingSmartFolders
- Suggest between 2 and 5 Smart Folders
- Prefer concise, high-signal queries

--------------------
GUIDANCE
--------------------

When using starredItems:
- Look for recurring entities or themes
- It is acceptable to generalize across multiple starred titles
- Prefer free-text search for conceptual topics

If exact matches would duplicate existing folders:
- Refine them (e.g. add unread:true, quality filter, or freshness)

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
      "reason": "string"
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