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
You generate Smart Folder suggestions for an RSS reader.

You MUST produce queries using ONLY the supported filtering expressions listed below.
DO NOT invent new fields, operators, or syntax.

SUPPORTED FILTERS:
- star:true | star:false
- unread:true | unread:false
- read:true | read:false
- clicked:true | clicked:false
- tag:<text>
- title:<text>
- quality:<number>, quality:>number, quality:<number, quality:>=number, quality:<=number
- freshness:<number>, freshness:>number, freshness:<number, freshness:>=number, freshness:<=number
- @YYYY-MM-DD | @today | @yesterday
- sort:DESC | sort:ASC | sort:IMPORTANCE | sort:QUALITY

RULES:
- Combine filters using spaces only
- No parentheses
- No AND / OR
- Avoid duplicating existingSmartFolders
- Max 5 suggestions

INPUT (JSON):
${JSON.stringify(insights)}

OUTPUT (STRICT JSON ONLY):
{
  "smartFolders": [
    { "name": "string", "query": "string", "reason": "string" }
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