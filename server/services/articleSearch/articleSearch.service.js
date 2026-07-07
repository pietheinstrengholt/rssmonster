// Coordinates article search across query parsing, settings thresholds, tag/feed lookups, and sorting.
// The service returns article ids while keeping database filtering and in-memory ranking behind helper modules.
import db from '../../models/index.js';
const { Setting } = db;
import { Op } from 'sequelize';
import { sortArticles } from './articleSort.service.js';
import { resolveDateFilterToRange } from './articleDateParser.service.js';
import { parseArticleQuery } from './articleQueryParser.service.js';
import { buildArticleSearchQuery, executeSearch, executeSearchCount } from './articleSearchExecutor.service.js';
import { fetchFeedIds, fetchTaggedArticleIds } from './articleSearchDataAccess.service.js';
import { buildTextSearchWhereClause } from './articleTextSearch.service.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';

const articleValue = (article, key) => (
  typeof article.get === 'function' ? article.get(key) : article[key]
);

const normalizeSort = sortValue => {
  const normalized = String(sortValue || 'desc').toLowerCase();
  return ['asc', 'desc', 'recommended', 'quality', 'attention'].includes(normalized)
    ? normalized
    : 'desc';
};

/**
 * Get all article IDs based on query parameters with advanced filtering.
 * Supports field filters in search string: favorite:true/false, unread:true/false, clicked:true/false,
 * event:true/false, eventCount:>=2, tag:name, title:text, author:text, language:en,
 * sort:desc/asc/recommended/quality/attention, and date filters: @YYYY-MM-DD, @today, @yesterday, @"N days ago", @"last DayName"
 */
// Searches article ids for a user using query-string filters, score thresholds, feed/category scope, and optional ranking.
export const searchArticles = async ({
    userId,
    search = "",
    categoryId = "%",
    feedId = "%",
    status = "unread",
    minAdvertisementScore = null,
    minSentimentScore = null,
    minQualityScore = null,
    sort = "desc",
    viewMode = "full",
    tag = null,
    grouping = 'none',
    persistSettings = false, // IMPORTANT: skip when called internally
    smartFolderSearch = false, // When true, apply smart folder optimizations
    limitCount = null, // Maximum number of results (used by smart folders)
    countOnly = false // Return only the matching count without materializing ids when possible
}) => {
    if (!userId) {
        throw new Error("Missing userId");
    }

    /**
     * Smart folder optimization: skip settings fetch when score thresholds are explicit.
     * Fetch user settings to determine score thresholds if not explicitly provided.
     * If minAdvertisementScore, minSentimentScore, or minQualityScore are not provided,
     * use values from settings; otherwise fallback to 0.
     */
    let userSettings = null;
    if (persistSettings || minAdvertisementScore === null || minSentimentScore === null || minQualityScore === null) {
        userSettings = await Setting.findOne({
            where: { userId },
            attributes: ['minAdvertisementScore', 'minSentimentScore', 'minQualityScore', 'themeMode']
        });
    }

    const finalMinAdvertisementScore = minAdvertisementScore ?? userSettings?.minAdvertisementScore ?? 0;
    const finalMinSentimentScore = minSentimentScore ?? userSettings?.minSentimentScore ?? 0;
    const finalMinQualityScore = minQualityScore ?? userSettings?.minQualityScore ?? 0;

    console.log(`\x1b[32mScore thresholds: adv=${finalMinAdvertisementScore}, sentiment=${finalMinSentimentScore}, quality=${finalMinQualityScore}\x1b[0m`);

    const rawSearch = search.trim();
    const parsedQuery = parseArticleQuery({ search: rawSearch, defaultSort: sort || 'desc' });
    const {
      filters = {},
      sort: sortFilter = sort || 'desc',
      limit: limitFilter = null,
      text = '',
      textMode = 'none'
    } = parsedQuery;

    const {
      star: starFilter = null,
      unread: unreadFilter = null,
      read: readFilter = null,
      clicked: clickedFilter = null,
      tag: tagFilter = null,
      seen: seenFilter = null,
      firstSeenAge: firstSeenAgeFilter = null,
      title: titleFilter = null,
      author: authorFilter = null,
      language: languageFilter = null,
      quality: qualityFilter = null,
      freshness: freshnessFilter = null,
      event = null,
      hot: hotFilter = null
    } = filters;
    const eventCountFilter = Number.isFinite(filters.eventCount) ? filters.eventCount : null;

    let dateRange = null;
    let dateToken = null;
    const resolvedDateFilter = resolveDateFilterToRange(filters.date);
    if (resolvedDateFilter) {
      dateRange = resolvedDateFilter.dateRange;
      dateToken = resolvedDateFilter.dateToken;
      console.log(`\x1b[31mDate filter applied via parser: ${dateToken}\x1b[0m`);
    }

    const quotedPhrase = textMode === 'exact' ? text : null;
    const remainingTokens = textMode === 'terms' && text ? text.split(/\s+/).filter(Boolean) : [];

    /**
     * Determine final filter values.
     * Field filters from search string take precedence over query parameters.
     */
    // Sort: search token (sort:asc/desc/recommended/quality/attention) overrides query param
    // Smart folder optimization: skip sort entirely (only counting articles)
    const logicalSort = normalizeSort(sortFilter !== null ? sortFilter : sort);
    const sortRecommended = logicalSort === 'recommended';
    const sortQuality = logicalSort === 'quality';
    const sortAttention = logicalSort === 'attention';
    const databaseSort = ['recommended', 'quality', 'attention'].includes(logicalSort)
      ? 'desc'
      : logicalSort;
    console.log(`\x1b[31mFinal sort value: "${databaseSort}" (logical: ${logicalSort}, smartFolder: ${smartFolderSearch})\x1b[0m`);

    // Tag: search token (tag:name) overrides query param
    const workingTag = tagFilter !== null ? tagFilter : (tag || "").trim();
    console.log(`\x1b[31mFinal tag value: "${workingTag}"\x1b[0m`);

    /**
     * If tag filter is present, fetch all article IDs with that tag.
     * Tags are stored in a separate table with articleId references.
     */
    let taggedArticleIds = null;
    if (workingTag) {
      taggedArticleIds = await fetchTaggedArticleIds({ userId, tagName: workingTag });
      console.log(`\x1b[31mFound ${taggedArticleIds.length} articles with tag "${workingTag}" for user ${userId}\x1b[0m`);

      // If tag was provided but no articles found, return empty result
      if (taggedArticleIds.length === 0) {
        const emptyResult = {
          query: {
            userId,
            search,
            tag: tagFilter,
            sort,
            date: dateToken
          }
        };

        return countOnly
          ? { ...emptyResult, articleCount: 0 }
          : { ...emptyResult, itemIds: [] };
      }
    }

    /**
     * Determine which feeds to query based on categoryId.
     * If categoryId is "%" (all), get all feeds for the user.
     * Otherwise, get only feeds in the specified category.
     */
    const feedIds = await fetchFeedIds({ userId, categoryId, feedId });

    /**
     * Build base WHERE clause for article query.
     * Combines user/feed filtering with text search (OR on title/content)
     * and quality score thresholds.
     */
    const baseWhere = {
      userId: userId,
      feedId: feedIds,
      ...canonicalArticleWhere(),
      // Quality filters: get articles above minimum scores
      advertisementScore: { [Op.gte]: finalMinAdvertisementScore },
      sentimentScore: { [Op.gte]: finalMinSentimentScore },
      qualityScore: { [Op.gte]: finalMinQualityScore }
    };

    // Text search logic:
    Object.assign(
      baseWhere,
      buildTextSearchWhereClause({ titleFilter, quotedPhrase, remainingTokens })
    );

    // Apply date range filter if present (supports all date patterns)
    if (dateRange) {
      baseWhere.published = { [Op.between]: [dateRange.start, dateRange.end] };
    }

    // Apply tag filter if present (restricts to specific article IDs)
    if (taggedArticleIds !== null && taggedArticleIds.length > 0) {
      baseWhere.id = taggedArticleIds;
    }

    const articleQuery = buildArticleSearchQuery({
      baseWhere,
      smartFolderSearch,
      sortRecommended,
      sortQuality,
      sortAttention,
      workingSort: databaseSort,
      qualityFilter,
      freshnessFilter,
      starFilter,
      unreadFilter,
      readFilter,
      clickedFilter,
      seenFilter,
      hotFilter,
      status,
      rawSearch,
      event,
      grouping,
      clusterCountFilter: eventCountFilter,
      firstSeenAgeFilter,
      authorFilter,
      languageFilter
    });

    console.log(`\x1b[36mQuery attributes: ${articleQuery.attributes.join(", ")} (smartFolder: ${smartFolderSearch})\x1b[0m`);
    if (firstSeenAgeFilter) {
      const { value, unit } = firstSeenAgeFilter;
      const intervalUnit = unit === 'h' ? 'HOUR' : 'DAY';
      console.log(`\x1b[31mFirst seen age filter applied: firstSeen IS NULL OR firstSeen >= NOW() - INTERVAL ${value} ${intervalUnit}\x1b[0m`);
    }

    const queryMetadata = {
        userId,
        search,
        tag: tagFilter,
        sort,
        date: dateToken
    };
    const runtimeFiltersRequired = Boolean(qualityFilter || freshnessFilter);
    const resultLimit = limitFilter || (smartFolderSearch ? limitCount : null);

    if (countOnly && !runtimeFiltersRequired) {
      let articleCount = await executeSearchCount(articleQuery);
      if (resultLimit && articleCount > resultLimit) {
        articleCount = resultLimit;
        console.log(`\x1b[31mCapped count result to ${resultLimit} articles\x1b[0m`);
      }

      console.log(`\x1b[31mCounted ${articleCount} articles matching query for user ${userId}\x1b[0m`);

      return {
        query: queryMetadata,
        articleCount
      };
    }

    // Fetch articles based on constructed query
    let articles = await executeSearch(articleQuery);
    
    console.log(`\x1b[33mFetched ${articles.length} articles from database (before in-memory filters)\x1b[0m`);

    // Delegate all in-memory sorting and filtering to sortArticles
    if (!smartFolderSearch || sortRecommended || sortQuality || sortAttention || qualityFilter || freshnessFilter) {
      articles = sortArticles(articles, { sortRecommended, sortQuality, sortAttention, qualityFilter, freshnessFilter });
    } else {
      console.log(`\x1b[33mSkipping sort for smart folder search\x1b[0m`);
    }

    let itemIds;
    itemIds = articles.map(article => article.id);
    
    // Apply limit filter from search expression (limit:50)
    // Takes precedence over default limits
    if (limitFilter && itemIds.length > limitFilter) {
      itemIds = itemIds.slice(0, limitFilter);
      console.log(`\x1b[31mApplied limit filter: ${limitFilter} articles\x1b[0m`);
    } else if (smartFolderSearch && limitCount && itemIds.length > limitCount) {
      // Smart folder optimization: apply limitCount
      itemIds = itemIds.slice(0, limitCount);
      console.log(`\x1b[31mLimited smart folder results to ${limitCount} articles\x1b[0m`);
    } else if (!smartFolderSearch && !limitFilter) {
      // Limit to 500 articles when search expressions are used (non-smart folder, no explicit limit)
      const hasSearchExpression = rawSearch && rawSearch.trim() !== "" && rawSearch.trim() !== "%";
      if (hasSearchExpression && itemIds.length > 500) {
        itemIds = itemIds.slice(0, 500);
        console.log(`\x1b[31mLimited results to 500 articles due to search expression usage\x1b[0m`);
      }
    }
    
    console.log(`\x1b[31mFound ${itemIds.length} articles matching query for user ${userId}\x1b[0m`);

    if (countOnly) {
      return {
        query: queryMetadata,
        articleCount: itemIds.length
      };
    }

    const itemIdSet = new Set(itemIds.map(id => String(id)));
    const sourceCount = new Set(
      articles
        .filter(article => itemIdSet.has(String(articleValue(article, 'id'))))
        .map(article => articleValue(article, 'feedId'))
        .filter(feedId => feedId !== null && feedId !== undefined)
    ).size;

    if (persistSettings) {
      // Update user settings (skip when tag-based query is used)
      // Note: tag is not persisted in settings currently
      console.log(`\x1b[32mPersisting search settings for user ${userId}\x1b[0m`);
      const settingsPayload = {
        userId: userId,
        categoryId: categoryId,
        feedId: feedId,
        status: status,
        sort: logicalSort,
        minAdvertisementScore: finalMinAdvertisementScore,
        minSentimentScore: finalMinSentimentScore,
        minQualityScore: finalMinQualityScore,
        viewMode: viewMode,
        grouping,
        themeMode: userSettings?.themeMode ?? 'system'
      };

      // Persist atomically to avoid race conditions across concurrent requests.
      await Setting.upsert(settingsPayload);
    }

    return {
        query: queryMetadata,
        itemIds,
        sourceCount
    };
};
