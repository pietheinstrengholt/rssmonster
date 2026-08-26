// inference/src/classifications/articleClassificationService.js
import OpenAI from 'openai';
import { getArticleScoringConfig, getGenerationConfig } from '../config/config.js';
import modernBertArticleScoringProvider from './providers/modernBertArticleScoringProvider.js';
import qwenGenerationProvider from '../generation/providers/qwenGenerationProvider.js';
import { getSafeErrorDetails, logInferenceDebug } from '../debug.js';
import { getInferenceRequestId } from '../middleware/requestLifecycle.js';
import { isInferenceQueueControlError } from '../queue/inferenceWorkQueue.js';

const normalizeTagName = tag => String(tag || '').trim().toLowerCase();
const TAG_HIERARCHY_SEPARATOR = /\s*(?:\/|>|→|›|\|)\s*/u;
const normalizeGeneratedTag = tag => normalizeTagName(tag)
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 32)
  .trim();

const splitTagHierarchy = tag => String(tag || '')
  .split(TAG_HIERARCHY_SEPARATOR)
  .map(normalizeGeneratedTag)
  .filter(Boolean);

// Expands explicit hierarchy-like model output into independent tags.
const normalizeGeneratedTags = tags => tags.flatMap(splitTagHierarchy);
const generationConfig = getGenerationConfig();
const articleScoringConfig = getArticleScoringConfig();
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const canGenerate = generationConfig.provider === 'qwen' || hasApiKey;
const client = hasApiKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
let openAIQueue = Promise.resolve();
let rateLimitDelay = 0;

const getRequestLogContext = () => {
  const requestId = getInferenceRequestId();
  return requestId ? ` requestId=${requestId}` : '';
};

const getGenerationRequestContext = context => ({
  requestId: context.requestId || getInferenceRequestId(),
  signal: context.signal
});

const defaultAnalysis = () => ({
  contentSummaryBullets: [],
  tags: [],
  advertisementScore: 70,
  sentimentScore: 70,
  qualityScore: 70
});

const truncateContentForLLM = (text, maxChars = 3500) => {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, 3000)}\n...\n${text.slice(-500)}`;
};

const parseJsonObject = raw => {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
};

const bucketScore = (value, fallback = 70) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    .reduce((previous, current) =>
      Math.abs(current - number) < Math.abs(previous - number) ? current : previous
    );
};

const callOpenAI = ({ prompt, maxCompletionTokens, rateLimitDelayMs, operation, model }) => {
  const result = openAIQueue.then(async () => {
    try {
      if (rateLimitDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
      }
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You produce strict JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_completion_tokens: maxCompletionTokens
      });
      return parseJsonObject(response.choices?.[0]?.message?.content || '');
    } catch (error) {
      if (error.message?.includes('429') || error.message?.toLowerCase().includes('rate limit')) {
        rateLimitDelay = rateLimitDelayMs;
        console.warn(
          `[OpenAI LLM] ${operation} rate limit hit, enabling request delay` +
          getRequestLogContext()
        );
      }
      console.error(
        `Error during article ${operation}${getRequestLogContext()}:`,
        getSafeErrorDetails(error)
      );
      return {};
    }
  });
  openAIQueue = result.catch(() => {});
  return result;
};

const callGenerationProvider = ({
  prompt,
  maxCompletionTokens,
  rateLimitDelayMs,
  operation
}, context = {}) => {
  if (generationConfig.provider === 'qwen') {
    return qwenGenerationProvider.generate({
      systemPrompt: 'You produce strict JSON only.',
      prompt,
      maxNewTokens: maxCompletionTokens,
      operation,
      ...getGenerationRequestContext(context)
    }).then(parseJsonObject).catch(error => {
      if (isInferenceQueueControlError(error)) throw error;
      console.error(
        `Error during article ${operation}${getRequestLogContext()}:`,
        getSafeErrorDetails(error)
      );
      return {};
    });
  }

  return callOpenAI({
    prompt,
    maxCompletionTokens,
    rateLimitDelayMs,
    operation,
    model: generationConfig.articleModel
  });
};

// Generates only the concise factual bullets used by article presentation.
export async function generateBulletSummary({
  text,
  title,
  feedName,
  rateLimitDelayMs = 0
}, context = {}) {
  const startedAt = Date.now();
  logInferenceDebug(
    `calling bullet-summary provider=${generationConfig.provider}`
  );
  const prompt = [
    'You are a precise, neutral, and reliable assistant summarizing one RSS article.',
    '',
    'Write 3-6 bullet point summaries:',
    '- Each bullet expresses one clear fact or takeaway.',
    '- Use no filler, commentary, or subjective language.',
    '- Each bullet must stand on its own.',
    '',
    'Return ONLY valid JSON with exactly this key:',
    '{"contentSummaryBullets":["string"]}',
    '',
    `Feed Name: ${feedName || 'unknown'}`,
    `Article Title: ${title || ''}`,
    'Article Content:',
    '```',
    truncateContentForLLM(text),
    '```'
  ].join('\n');
  const parsed = await callGenerationProvider({
    prompt,
    maxCompletionTokens: 250,
    rateLimitDelayMs,
    operation: 'article-bullet-summary'
  }, context);
  const bullets = Array.isArray(parsed.contentSummaryBullets)
    ? parsed.contentSummaryBullets
      .filter(bullet => typeof bullet === 'string' && bullet.trim())
      .map(bullet => bullet.trim())
      .slice(0, 7)
    : [];
  logInferenceDebug(
    `completed bullet-summary provider=${generationConfig.provider} ` +
    `count=${bullets.length} durationMs=${Date.now() - startedAt}`
  );
  return bullets;
}

// Generates only content-specific tags; feed-category tags are merged by orchestration.
export async function generateTags({
  text,
  title,
  categories,
  feedName,
  rateLimitDelayMs = 0
}, context = {}) {
  const startedAt = Date.now();
  logInferenceDebug(
    `calling tag-generation provider=${generationConfig.provider}`
  );
  const prompt = [
    'You are a precise assistant generating tags for one RSS article.',
    '',
    'Provide 3-5 SEO-friendly tags:',
    '- Each array item must represent exactly one concise concept.',
    '- Use one or at most two words per tag, lowercase, without punctuation or duplicates.',
    '- Prefer named entities, products, laws, events, policies, and mechanisms.',
    '- Avoid broad tags: news, politics, economy, business, technology, finance, world.',
    '- Keep established multi-word concepts readable, such as rate hike or export controls.',
    '- Never copy a category hierarchy into one tag and never concatenate separate category',
    '  levels. For "news / computers / browsers", return separate relevant tags such as',
    '  "computers" and "browsers"; never return "news computers browsers" or',
    '  "newscomputersbrowsers".',
    '- At least two tags should refer to concrete entities or mechanisms.',
    '- Categories are only a starting signal; discard categories that remain broad.',
    '',
    'Return ONLY valid JSON with exactly this key: {"tags":["string"]}',
    '',
    `Feed Name: ${feedName || 'unknown'}`,
    `Article Title: ${title || ''}`,
    `Article Categories: ${categories.join(', ')}`,
    'Article Content:',
    '```',
    truncateContentForLLM(text),
    '```'
  ].join('\n');
  const parsed = await callGenerationProvider({
    prompt,
    maxCompletionTokens: 120,
    rateLimitDelayMs,
    operation: 'article-tag-generation'
  }, context);
  const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [];
  logInferenceDebug(
    `completed tag-generation provider=${generationConfig.provider} ` +
    `count=${tags.length} durationMs=${Date.now() - startedAt}`
  );
  return tags;
}

// Generates only advertisement, sentiment/tone, and writing/information-quality scores.
export async function scoreArticle({
  text,
  title,
  feedName,
  rateLimitDelayMs = 0
}, context = {}) {
  const startedAt = Date.now();
  logInferenceDebug(
    `calling article-scoring provider=${articleScoringConfig.provider}`
  );
  if (articleScoringConfig.provider === 'modernbert') {
    const scores = await modernBertArticleScoringProvider.score({
      text: truncateContentForLLM(text),
      title,
      feedName,
      requestId: context.requestId || getInferenceRequestId(),
      signal: context.signal,
      operation: 'article-scoring'
    });
    logInferenceDebug(
      'completed article-scoring provider=modernbert ' +
      `durationMs=${Date.now() - startedAt}`
    );
    return scores;
  }

  const prompt = [
    'You are a precise, neutral, and consistent evaluator scoring one RSS article.',
    '',
    'Evaluate exactly three independent dimensions:',
    '1. qualityScore: writing craftsmanship, information quality, and readability.',
    '2. sentimentScore: emotional neutrality and restraint.',
    '3. advertisementScore: absence of commercial or promotional intent.',
    '',
    'Scores must be one of: 0,10,20,30,40,50,60,70,80,90,100.',
    'Score each dimension independently. A weakness in one dimension must not',
    'automatically reduce another dimension.',
    '',
    'Judge only the article text and title provided below.',
    'Do not infer quality from the publisher, feed name, topic, political viewpoint,',
    'subject matter, or your prior knowledge of the source.',
    '',
    'WRITING SCORE',
    'qualityScore measures writing craftsmanship, information quality, clarity,',
    'structure, and readability.',
    '',
    '- 100: exceptional professional writing; exceptionally clear, concise, natural,',
    '  well structured, and polished. Use sparingly.',
    '- 90: excellent writing with very strong clarity, flow, and structure.',
    '- 80: clearly above-average writing; polished and easy to follow.',
    '- 70: competent, normal professional writing with no major problems.',
    '- 60: somewhat weak; noticeable awkwardness, repetition, poor flow, or structure.',
    '- 40-50: substantially difficult, repetitive, fragmented, or poorly structured.',
    '- 0-30: extremely poor, incoherent, broken, spam-like, or largely unreadable.',
    '',
    'Consider:',
    '- clarity and precision',
    '- sentence construction',
    '- grammar and language quality',
    '- logical organization',
    '- flow between ideas',
    '- conciseness',
    '- unnecessary repetition',
    '- readability',
    '',
    'Do NOT reduce qualityScore because:',
    '- the article is emotional or opinionated',
    '- the topic is trivial or serious',
    '- you disagree with the article',
    '- the article contains advertising',
    '- the article is short, unless its writing itself is fragmented or incomplete',
    '',
    'SENTIMENT SCORE',
    'sentimentScore measures emotional neutrality and restraint.',
    'It does NOT measure whether the subject matter is positive or negative.',
    '',
    '- 100: completely calm, factual, neutral, and emotionally restrained.',
    '- 90: highly neutral with only minimal emotional or persuasive framing.',
    '- 80: mostly neutral with mild emotive, opinionated, or persuasive language.',
    '- 70: noticeable emotional or opinionated framing, but still reasonably restrained.',
    '- 60: clearly emotionally loaded, sensationalized, or provocative.',
    '- 40-50: strongly emotional, polarizing, manipulative, outraged, or fear-driven.',
    '- 0-30: extreme sensationalism, inflammatory rhetoric, manipulation, or agitation.',
    '',
    'Reduce sentimentScore for:',
    '- sensationalism',
    '- outrage or fear framing',
    '- catastrophizing',
    '- inflammatory or polarizing language',
    '- manipulative emotional language',
    '- false urgency',
    '- exaggerated claims used for emotional effect',
    '- excessive punctuation or capitalization used for emphasis',
    '- emotionally manipulative clickbait',
    '',
    'Do NOT reduce sentimentScore merely because the article discusses:',
    '- death, disasters, war, crime, illness, or other negative events',
    '- positive or celebratory events',
    '- controversial subjects',
    '- criticism presented in calm, factual language',
    '',
    'A factual article about a tragic event can score 100.',
    '',
    'ADVERTISEMENT SCORE',
    'advertisementScore measures absence of commercial, promotional, or self-promotional',
    'intent. A higher score means less promotion.',
    '',
    '- 100: entirely editorial; no meaningful promotional intent.',
    '- 90: editorial with only incidental references to products, services, or organizations.',
    '- 80: mostly editorial with small promotional elements.',
    '- 70: editorial content with noticeable promotion or calls to action.',
    '- 60: substantial promotional content mixed with editorial content.',
    '- 40-50: predominantly promotional, affiliate-driven, sponsored, or sales-oriented.',
    '- 0-30: essentially an advertisement, sales pitch, promotion, or commercial solicitation.',
    '',
    'Reduce advertisementScore for:',
    '- explicit product or service promotion',
    '- affiliate-driven recommendations',
    '- sponsored or advertorial messaging',
    '- repeated brand promotion',
    '- purchase calls to action',
    '- pricing, discounts, coupons, or sales language used to encourage a transaction',
    '- subscription or signup promotion when it is a significant part of the article',
    '- promotional self-marketing',
    '',
    'Do NOT reduce advertisementScore merely because:',
    '- a company, product, or service is discussed editorially',
    '- prices are reported as factual information',
    '- an article reviews a commercial product',
    '- a brand name appears in normal reporting',
    '- the feed or publisher itself is commercial',
    '',
    'Before returning the result, independently compare each selected score with the',
    'bucket immediately above and below it and choose the best-fitting bucket.',
    '',
    'Return ONLY valid JSON with exactly these keys and no additional text:',
    '{"qualityScore":70,"sentimentScore":70,"advertisementScore":70}',
    '',
    `Feed Name: ${feedName || 'unknown'}`,
    `Article Title: ${title || ''}`,
    'Article Content:',
    '```',
    truncateContentForLLM(text),
    '```'
  ].join('\n');
  const parsed = await callOpenAI({
    prompt,
    maxCompletionTokens: 100,
    rateLimitDelayMs,
    operation: 'scoring',
    model: articleScoringConfig.modelId
  });
  const scores = {
    advertisementScore: bucketScore(parsed.advertisementScore),
    sentimentScore: bucketScore(parsed.sentimentScore),
    qualityScore: bucketScore(parsed.qualityScore ?? parsed.writingScore)
  };
  logInferenceDebug(
    'completed article-scoring provider=openai ' +
    `durationMs=${Date.now() - startedAt}`
  );
  return scores;
}

// Orchestrates the three independent classification calls into the server's existing contract.
async function analyzeArticleContent({
  text,
  title,
  categories: categoryNames,
  feedName,
  rateLimitDelayMs = 0
}, context = {}) {
  const startedAt = Date.now();
  logInferenceDebug(
    `received article-classification characters=${text?.length || 0}`
  );
  const categories = Array.isArray(categoryNames) ? categoryNames : [];
  const hasProviderTags = categories.some(category =>
    typeof category === 'string' && category.trim()
  );
  const analysis = defaultAnalysis();

  if (
    String(process.env.SKIP_ARTICLE_CLASSIFICATION_ANALYSIS).toLowerCase() === 'true' ||
    !text ||
    text.trim().length < 200
  ) {
    const reason = String(process.env.SKIP_ARTICLE_CLASSIFICATION_ANALYSIS).toLowerCase() === 'true'
      ? 'disabled'
      : 'below-200-characters';
    logInferenceDebug(`skipped article-classification reason=${reason}`);
    return analysis;
  }

  const input = { text, title, categories, feedName, rateLimitDelayMs };
  if (canGenerate && text.length >= 500) {
    analysis.contentSummaryBullets = await generateBulletSummary(input, context);
    if (!hasProviderTags) {
      const generatedTags = await generateTags(input, context);
      analysis.tags = [...new Set(normalizeGeneratedTags(generatedTags))].slice(0, 5);
    } else {
      logInferenceDebug(
        'skipped tag-generation reason=provider-tags-available'
      );
    }
  } else if (text.length < 500) {
    logInferenceDebug(
      'skipped article-generation reason=below-500-characters'
    );
  } else {
    logInferenceDebug(
      'skipped article-generation reason=provider-unavailable'
    );
  }
  if (hasApiKey || articleScoringConfig.provider === 'modernbert') {
    Object.assign(analysis, await scoreArticle(input, context));
  }
  logInferenceDebug(
    `completed article-classification bullets=${analysis.contentSummaryBullets.length} ` +
    `tags=${analysis.tags.length} ` +
    `durationMs=${Date.now() - startedAt}`
  );
  return analysis;
}

export default analyzeArticleContent;
