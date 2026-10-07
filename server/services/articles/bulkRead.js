import { Op } from 'sequelize';
import db from '../../models/index.js';
import { searchArticles } from '../articleSearch/articleSearch.service.js';
import { ArticleSearchCursorError } from '../articleSearch/articleSearchCursor.service.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { retryDatabaseWrite } from '../../utils/databaseRetry.js';

const { Article, Feed } = db;

const cursorCompatibleScope = ({ sort, search }) => (
  ['asc', 'desc'].includes(String(sort || 'desc').toLowerCase())
  && !/(?:^|\s)sort:(?:topStories|recommended|quality)(?:\s|$)/i.test(String(search || ''))
  && !/(?:^|\s)(?:quality|freshness):/i.test(String(search || ''))
);

const toScoreThreshold = value => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const matchingSearchOptions = (userId, query, grouping) => ({
  userId,
  search: query.search ? String(query.search) : '',
  categoryId: query.categoryId ?? '%',
  feedId: query.feedId ?? '%',
  status: 'unread',
  minAdvertisementScore: toScoreThreshold(query.minAdvertisementScore),
  minSentimentScore: toScoreThreshold(query.minSentimentScore),
  minOverallQualityScore: toScoreThreshold(query.minOverallQualityScore),
  minQualityScore: toScoreThreshold(query.minQualityScore),
  sort: query.sort || 'desc',
  tag: query.tag === undefined ? null : query.tag,
  viewMode: query.viewMode === undefined ? 'full' : query.viewMode,
  grouping,
  publishedAfter: query.publishedAfter,
  publishedBefore: query.publishedBefore,
  persistSettings: false
});

const readScope = async (userId, itemIds, grouping) => {
  let eventIds = [];
  if (grouping === 'event') {
    const selectedArticles = await Article.findAll({
      where: { id: { [Op.in]: itemIds }, userId, ...canonicalArticleWhere() },
      attributes: ['id', 'eventId']
    });
    eventIds = [...new Set(selectedArticles.map(article => article.eventId).filter(Boolean))];
  }

  return {
    eventIds,
    where: {
      userId,
      ...canonicalArticleWhere(),
      status: 'unread',
      ...(eventIds.length
        ? { [Op.or]: [{ id: { [Op.in]: itemIds } }, { eventId: { [Op.in]: eventIds } }] }
        : { id: { [Op.in]: itemIds } })
    }
  };
};

const markSelectionRead = async (userId, itemIds, grouping, readAt) => {
  if (!itemIds.length) return { updatedCount: 0, matchedCount: 0, expandedEventCount: 0 };
  const { where, eventIds } = await readScope(userId, itemIds, grouping);
  const [updatedCount] = await retryDatabaseWrite(() => Article.update(
    { status: 'read', readAt },
    { where }
  ));
  return { updatedCount, matchedCount: itemIds.length, expandedEventCount: eventIds.length };
};

// Select articles by { type: 'articles' | 'snapshot', articleIds } or
// { type: 'matching', query, allowCursor }. Explicit IDs return Article instances;
// snapshots and matching queries return matched, updated and expanded-Event counts.
// Writes deliberately retain partial completion and one timestamp per operation.
export const markArticlesRead = async ({ userId, selection, grouping = 'none' }) => {
  if (!userId) throw new Error('Missing userId');
  const readAt = new Date();
  const normalizedGrouping = grouping === 'event' ? 'event' : 'none';

  if (selection.type === 'articles') {
    const { where } = await readScope(userId, selection.articleIds, normalizedGrouping);
    const articles = await Article.findAll({ where, include: [{ model: Feed, required: true }] });
    // Preserve instance validation and Feed-backed records consumed by Reader.
    return { articles: await Promise.all(articles.map(article => retryDatabaseWrite(
      () => article.update({ status: 'read', readAt })
    ))) };
  }

  if (selection.type === 'snapshot') {
    // Treats a supplied list snapshot as the complete selection scope.
    const itemIds = [...new Map(selection.articleIds.map(id => [String(id), id])).values()];
    return markSelectionRead(userId, itemIds, normalizedGrouping, readAt);
  }

  const options = matchingSearchOptions(userId, selection.query, normalizedGrouping);
  if (selection.allowCursor && cursorCompatibleScope(options)) {
    let cursor = null;
    const totals = { updatedCount: 0, matchedCount: 0, expandedEventCount: 0 };
    try {
      do {
        const result = await searchArticles({ ...options, pagination: { pageSize: 100, cursor } });
        const update = await markSelectionRead(userId, result.page.itemIds, normalizedGrouping, readAt);
        totals.updatedCount += update.updatedCount;
        totals.matchedCount += update.matchedCount;
        totals.expandedEventCount += update.expandedEventCount;
        cursor = result.page.hasMore ? result.page.nextCursor : null;
      } while (cursor);
      return totals;
    } catch (error) {
      if (!(error instanceof ArticleSearchCursorError) || error.code !== 'CURSOR_SORT_UNSUPPORTED') throw error;
    }
  }

  const result = await searchArticles(options);
  const itemIds = [...new Map((result.itemIds || []).map(id => [String(id), id])).values()];
  return markSelectionRead(userId, itemIds, normalizedGrouping, readAt);
};
