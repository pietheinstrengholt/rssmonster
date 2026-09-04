import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { getEmailConfiguration } from '../../config/email.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { enqueueEmail } from '../email/emailService.js';
import { searchArticles } from '../articleSearch/articleSearch.service.js';
import { extractBriefingExcerpt } from './dailyBriefing.service.js';

const { Article, BriefingPreference, Feed } = db;
export const MAX_DIGEST_SECTION_ITEMS = 10;
const MAX_RANKED_RESULTS = MAX_DIGEST_SECTION_ITEMS * 2;
const MAX_RANKING_CANDIDATES = 500;

export class DailyBriefingEmailError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'DailyBriefingEmailError';
    this.code = code;
    this.status = status;
  }
}

const httpUrl = value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const articleValue = (article, key) => article?.get?.(key) ?? article?.[key];

const serializeArticle = article => {
  const url = httpUrl(articleValue(article, 'url'));
  const headline = String(articleValue(article, 'title') || '').trim();
  if (!url || !headline) return null;
  const feed = articleValue(article, 'Feed') || articleValue(article, 'feed');
  const contentText = articleValue(article, 'contentText');
  const publishedAt = articleValue(article, 'publishedAt');
  const publicationDate = new Date(publishedAt);
  if (Number.isNaN(publicationDate.getTime())) return null;

  return {
    articleId: articleValue(article, 'id'),
    url,
    headline,
    excerpt: extractBriefingExcerpt(contentText, headline),
    source: String(feed?.feedName || 'Unknown source').trim(),
    publishedAt: publicationDate.toISOString()
  };
};

const takeSection = (ids, articleMap, seenIds) => {
  const section = [];
  for (const id of ids) {
    const key = String(id);
    if (seenIds.has(key)) continue;
    const article = articleMap.get(key);
    if (!article) continue;
    section.push(article);
    seenIds.add(key);
    if (section.length === MAX_DIGEST_SECTION_ITEMS) break;
  }
  return section;
};

const loadPresentationArticles = async (userId, ids) => {
  if (!ids.length) return new Map();
  const articles = await Article.findAll({
    where: {
      id: { [Op.in]: ids },
      userId,
      ...canonicalArticleWhere()
    },
    attributes: ['id', 'url', 'title', 'contentText', 'publishedAt'],
    include: [{
      model: Feed,
      required: true,
      attributes: ['id', 'feedName']
    }]
  });
  return new Map(articles
    .map(serializeArticle)
    .filter(Boolean)
    .map(article => [String(article.articleId), article]));
};

// Selects the two bounded email sections through the same filters and rankings as the web briefing.
export const selectDailyBriefingEmailArticles = async (userId, {
  search = searchArticles,
  loadArticles = loadPresentationArticles
} = {}) => {
  if (!userId) throw new DailyBriefingEmailError('USER_REQUIRED', 'userId is required');
  const preference = await BriefingPreference.findOne({ where: { userId }, raw: true });
  const includeDevelopingEvents = Boolean(preference?.includeDevelopingEvents);
  const searchOptions = {
    userId,
    status: 'briefing',
    includeDevelopingEvents,
    persistSettings: false,
    executionBounds: {
      maxResults: MAX_RANKED_RESULTS,
      maxCandidates: MAX_RANKING_CANDIDATES
    }
  };
  const [recommendedResult, topStoriesResult] = await Promise.all([
    search({ ...searchOptions, briefingSort: 'recommended' }),
    search({ ...searchOptions, briefingSort: 'topStories' })
  ]);
  const recommendedIds = recommendedResult.itemIds || [];
  const topStoriesIds = topStoriesResult.itemIds || [];
  const ids = [...new Set([...recommendedIds, ...topStoriesIds].map(String))];
  const articleMap = await loadArticles(userId, ids);
  const seenIds = new Set();

  return {
    recommended: takeSection(recommendedIds, articleMap, seenIds),
    topStories: takeSection(topStoriesIds, articleMap, seenIds)
  };
};

const localDateKey = (date, timezone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

// Builds and durably queues one populated digest without changing article read state.
export const enqueueDailyBriefingEmail = async (user, {
  testMode = false,
  forceWhenEmpty = false,
  now = new Date(),
  configuration = getEmailConfiguration(),
  selectArticles = selectDailyBriefingEmailArticles,
  enqueue = enqueueEmail,
  createTestDedupeKey = () => `daily-digest-test:${randomUUID()}`
} = {}) => {
  if (!configuration.enabled) {
    throw new DailyBriefingEmailError(
      'EMAIL_DISABLED',
      'Email delivery is not enabled on this server.',
      409
    );
  }
  if (!user?.id || !user.email || !user.emailVerifiedAt) {
    throw new DailyBriefingEmailError(
      'EMAIL_NOT_VERIFIED',
      'Verify your email address before sending a daily briefing.',
      409
    );
  }

  const preference = await BriefingPreference.findOne({ where: { userId: user.id }, raw: true });
  if (!testMode && !preference?.emailDigestEnabled) {
    return { queued: false, skipped: 'disabled', articleCount: 0 };
  }
  const sections = await selectArticles(user.id);
  const articleCount = sections.recommended.length + sections.topStories.length;
  const skipWhenEmpty = preference?.emailDigestSkipWhenEmpty !== false;
  if (!articleCount && skipWhenEmpty && !forceWhenEmpty) {
    return { queued: false, skipped: 'empty', articleCount: 0 };
  }

  const timezone = preference?.emailDigestTimezone || 'UTC';
  const localDate = localDateKey(now, timezone);
  const briefingUrl = configuration.publicAppUrl;
  const enqueueResult = await enqueue({
    userId: user.id,
    recipient: user.email,
    templateType: 'daily_digest',
    templateData: {
      ...sections,
      briefingUrl,
      preferencesUrl: configuration.publicAppUrl,
      subjectDate: localDate,
      timezone,
      testMode
    },
    dedupeKey: testMode ? createTestDedupeKey() : `daily-digest:${user.id}:${localDate}`
  });
  return enqueueResult?.created === false
    ? { queued: false, skipped: 'duplicate', articleCount }
    : { queued: true, articleCount };
};
