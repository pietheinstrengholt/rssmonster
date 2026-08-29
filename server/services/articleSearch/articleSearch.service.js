// Coordinates article search across query parsing, settings thresholds, tag/feed lookups, and sorting.
// The service returns article ids while keeping database filtering and in-memory ranking behind helper modules.
import db from '../../models/index.js';
// Provides the shared dependencies used by this service.
const { Article, BriefingPreference, Setting } = db;
import { Op } from 'sequelize';
import { sortArticles } from './articleSort.service.js';
import { resolveDateFilterToRange } from './articleDateParser.service.js';
import { normalizeArticleSort, parseArticleQuery } from './articleQueryParser.service.js';
import {
  buildArticleSearchQuery,
  executeSearch,
  executeSearchBoundedCount,
  executeSearchCount,
  executeSearchSourceCount
} from './articleSearchExecutor.service.js';
import { fetchFeedIds, fetchTaggedArticleIds } from './articleSearchDataAccess.service.js';
import { buildTextSearchWhereClause } from './articleTextSearch.service.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { applyArticleScoreEligibility } from '../articles/articleScoreEligibility.js';
import {
  ArticleSearchCursorError,
  articleSearchCursorExpiresAt,
  createArticleSearchCursor,
  fingerprintArticleSearch,
  parseArticleSearchCursor
} from './articleSearchCursor.service.js';

// Defines the default briefing search enforced by this service.
const DEFAULT_BRIEFING_SEARCH = 'briefing:true @lastweek sort:recommended';

// Emits article-search diagnostics only during local development.
const debugLog = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

// Selects the article value based on whether article is function.
const articleValue = (article, key) => (
  typeof article.get === 'function' ? article.get(key) : article[key]
);

// Adds one cursor predicate without overwriting an existing ID or grouping condition.
const appendCursorCondition = (where, condition) => {
  where[Op.and] ??= [];
  where[Op.and].push(condition);
};

// Returns the persisted sort values needed to continue after one article.
const cursorPositionForArticle = article => {
  const publishedAt = articleValue(article, 'publishedAt');
  const articleId = Number(articleValue(article, 'id'));
  const position = {
    publishedAt: new Date(publishedAt).toISOString(),
    articleId
  };

  return position;
};

// Applies the strict keyset boundary represented by a validated cursor position.
const applyCursorPosition = (articleQuery, sort, position) => {
  const publishedAt = new Date(position?.publishedAt);
  const articleId = Number(position?.articleId);
  if (!Number.isSafeInteger(articleId) || Number.isNaN(publishedAt.getTime())) {
    throw new ArticleSearchCursorError('CURSOR_MALFORMED', 'The article cursor is malformed.');
  }

  const comparison = sort === 'asc' ? Op.gt : Op.lt;
  appendCursorCondition(articleQuery.where, {
    [Op.or]: [
      { publishedAt: { [comparison]: publishedAt } },
      { publishedAt, id: { [comparison]: articleId } }
    ]
  });
};

/**
 * Get all article IDs based on query parameters with advanced filtering.
 * Supports field filters in search string: favorite:true/false, unread:true/false, clicked:true/false,
 * event:true/false, island:true/false, briefing:true/false, developing:true/false, eventCount:>=2, tag:name, title:text, author:text, language:en,
 * sort:desc/asc/trust/topStories/recommended/quality/attention, and date filters: @YYYY-MM-DD, @today, @yesterday, @"N days ago", @"last DayName"
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
    includeDevelopingEvents = false,
    persistSettings = false, // IMPORTANT: skip when called internally
    smartFolderSearch = false, // When true, apply smart folder optimizations
    resolvedFeedIds = null, // Reuse a caller-resolved source scope for repeated internal searches
    limitCount = null, // Maximum number of results (used by smart folders)
    countOnly = false, // Return only the matching count without materializing ids when possible
    minArticleIdExclusive = null, // Restrict an internal count to articles admitted after a snapshot
    pagination = null // Opt-in keyset pagination descriptor for database-native sorts
}) => {
    // Rejects processing when user id is unavailable.
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
    // Handles the case where persist settings is available or min advertisement score is value or min sentiment score is value or min quality score is value.
    if (
      persistSettings ||
      (status === 'unread' && !smartFolderSearch) ||
      minAdvertisementScore === null ||
      minSentimentScore === null ||
      minQualityScore === null
    ) {
        userSettings = await Setting.findOne({
            where: { userId },
            attributes: [
              'minAdvertisementScore',
              'minSentimentScore',
              'minQualityScore',
              'prioritizeHighTrust',
              'themeMode',
              'startupViewMode'
            ]
        });
    }

    // Derives the final min advertisement score required while performing search articles.
    const finalMinAdvertisementScore = minAdvertisementScore ?? userSettings?.minAdvertisementScore ?? 0;
    // Derives the final min sentiment score required while performing search articles.
    const finalMinSentimentScore = minSentimentScore ?? userSettings?.minSentimentScore ?? 0;
    // Derives the final min quality score required while performing search articles.
    const finalMinQualityScore = minQualityScore ?? userSettings?.minQualityScore ?? 0;

    debugLog(`\x1b[32mScore thresholds: adv=${finalMinAdvertisementScore}, sentiment=${finalMinSentimentScore}, quality=${finalMinQualityScore}\x1b[0m`);

    // Selects the raw search based on whether status is briefing.
    let rawSearch = search.trim() || (status === 'briefing' ? DEFAULT_BRIEFING_SEARCH : '');
    let briefingMinDistinctSources = 1;
    let briefingShowOnlyInterestMatchedArticles = false;
    let briefingShowOnlyDevelopingEventArticles = false;
    let prioritizeHighTrust = status === 'unread'
      && Boolean(Number(userSettings?.prioritizeHighTrust));

    // Handles the case where status is briefing.
    if (status === 'briefing') {
        // Loads the briefing preferences needed while performing search articles.
        const briefingPreferences = await BriefingPreference.findOne({
            where: { userId },
            attributes: [
                'selectionPeriod',
                'includeOnlyUnreadArticles',
                'minDistinctSources',
                'prioritizeHighTrust',
                'showOnlyInterestMatchedArticles',
                'showOnlyDevelopingEventArticles'
            ],
            raw: true
        });

        // Handles the case where briefing preferences is available.
        if (briefingPreferences) {
            briefingMinDistinctSources = Number(briefingPreferences.minDistinctSources) || 1;
            briefingShowOnlyInterestMatchedArticles = Boolean(
                Number(briefingPreferences.showOnlyInterestMatchedArticles)
            );
            briefingShowOnlyDevelopingEventArticles = Boolean(
                Number(briefingPreferences.showOnlyDevelopingEventArticles)
            );
            prioritizeHighTrust = Boolean(Number(briefingPreferences.prioritizeHighTrust));
            // Selects the result based on whether number succeeds.
            rawSearch = [
                'briefing:true',
                Number(briefingPreferences.includeOnlyUnreadArticles) ? 'unread:true' : null,
                briefingPreferences.selectionPeriod === '24h' ? '@today' : '@lastweek',
                'sort:recommended'
            ].filter(Boolean).join(' ');
        }
    }

    // Parses the article query while performing search articles.
    const parsedQuery = parseArticleQuery({ search: rawSearch, defaultSort: sort || 'desc' });
    const {
      filters = {},
      sort: sortFilter = sort || 'desc',
      limit: limitFilter = null,
      text = '',
      textMode = 'none',
      hasSearchIntent = false
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
      hot: hotFilter = null,
      island: islandFilter = null,
      developing: developingFilter = null,
      briefing: parsedBriefingFilter = null
    } = filters;
    // Selects the briefing filter based on whether status is briefing.
    const briefingFilter = parsedBriefingFilter ?? (status === 'briefing' ? true : null);
    // Selects the event count filter based on whether filters event count is finite.
    const eventCountFilter = Number.isFinite(filters.eventCount) ? filters.eventCount : null;
    // Developing stories are event selections whose developing article must replace the representative.
    const requiresDevelopingEventSelection = developingFilter === true
      || briefingShowOnlyDevelopingEventArticles;
    const effectiveGrouping = status === 'briefing' || requiresDevelopingEventSelection
      ? 'event'
      : grouping;
    const effectiveIncludeDevelopingEvents = requiresDevelopingEventSelection
      ? true
      : includeDevelopingEvents;

    let dateRange = null;
    let dateToken = null;
    // Resolves the date filter to range while performing search articles.
    const resolvedDateFilter = resolveDateFilterToRange(filters.date);
    // Handles the case where resolved date filter is available.
    if (resolvedDateFilter) {
      dateRange = resolvedDateFilter.dateRange;
      dateToken = resolvedDateFilter.dateToken;
      debugLog(`\x1b[31mDate filter applied via parser: ${dateToken}\x1b[0m`);
    }

    // Selects the quoted phrase based on whether text mode is exact.
    const quotedPhrase = textMode === 'exact' ? text : null;
    // Selects the remaining tokens based on whether text mode is terms and text is available.
    const remainingTokens = textMode === 'terms' && text ? text.split(/\s+/).filter(Boolean) : [];

    /**
     * Determine final filter values.
     * Field filters from search string take precedence over query parameters.
     */
    // Sort: search token (sort:asc/desc/trust/topStories/recommended/quality/attention) overrides query param
    // Smart folder optimization: skip sort entirely (only counting articles)
    const logicalSort = normalizeArticleSort(sortFilter !== null ? sortFilter : sort);
    // Derives the sort recommended required while performing search articles.
    const sortRecommended = logicalSort === 'recommended';
    // Derives the Top Stories runtime ranking requirement.
    const sortTopStories = logicalSort === 'topStories';
    // Derives the sort quality required while performing search articles.
    const sortQuality = logicalSort === 'quality';
    // Derives the sort attention required while performing search articles.
    const sortAttention = logicalSort === 'attention';
    // Selects the database sort based on whether value contains logical sort.
    const databaseSort = ['topStories', 'recommended', 'quality', 'attention'].includes(logicalSort)
      ? 'desc'
      : logicalSort;
    debugLog(`\x1b[31mFinal sort value: "${databaseSort}" (logical: ${logicalSort}, smartFolder: ${smartFolderSearch})\x1b[0m`);

    // Tag: search token (tag:name) overrides query param
    const workingTag = tagFilter !== null ? tagFilter : (tag || "").trim();
    debugLog(`\x1b[31mFinal tag value: "${workingTag}"\x1b[0m`);

    /**
     * If tag filter is present, fetch all article IDs with that tag.
     * Tags are stored in a separate table with articleId references.
     */
    let taggedArticleIds = null;
    // Handles the case where working tag is available.
    if (workingTag) {
      taggedArticleIds = await fetchTaggedArticleIds({ userId, tagName: workingTag });
      debugLog(`\x1b[31mFound ${taggedArticleIds.length} articles with tag "${workingTag}" for user ${userId}\x1b[0m`);

      // If tag was provided but no articles found, return empty result
      if (taggedArticleIds.length === 0) {
        // Builds the empty result assembled while performing search articles.
        const emptyResult = {
          query: {
            userId,
            search,
            tag: tagFilter,
            sort,
            date: dateToken
          }
        };

        // Selects the result based on whether count only is available.
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
    const feedIds = resolvedFeedIds
      ?? await fetchFeedIds({ userId, categoryId, feedId });

    /**
     * Build base WHERE clause for article query.
     * Combines user/feed filtering with text search (OR on title/content)
     * and quality score thresholds.
     */
    const baseWhere = applyArticleScoreEligibility({
      userId: userId,
      feedId: feedIds,
      ...canonicalArticleWhere()
    }, {
      minAdvertisementScore: finalMinAdvertisementScore,
      minSentimentScore: finalMinSentimentScore,
      minQualityScore: finalMinQualityScore
    });

    // Text search logic:
    Object.assign(
      baseWhere,
      buildTextSearchWhereClause({
        titleFilter,
        quotedPhrase,
        remainingTokens,
        dialect: Article.sequelize.getDialect(),
        escapeValue: value => Article.sequelize.escape(value)
      })
    );

    // Apply date range filter if present (supports all date patterns)
    if (dateRange) {
      baseWhere.publishedAt = { [Op.between]: [dateRange.start, dateRange.end] };
    }

    // Apply tag filter if present (restricts to specific article IDs)
    if (taggedArticleIds !== null && taggedArticleIds.length > 0) {
      baseWhere.id = taggedArticleIds;
    }

    // Builds the article search query while performing search articles.
    const articleQuery = buildArticleSearchQuery({
      baseWhere,
      smartFolderSearch,
      sortRecommended,
      sortTopStories,
      sortQuality,
      sortAttention,
      prioritizeHighTrust,
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
      hasSearchIntent,
      event,
      islandFilter,
      developingFilter,
      briefingFilter,
      briefingMinDistinctSources,
      briefingShowOnlyInterestMatchedArticles,
      briefingShowOnlyDevelopingEventArticles,
      includeDevelopingEvents: effectiveIncludeDevelopingEvents,
      grouping: effectiveGrouping,
      eventCountFilter,
      firstSeenAgeFilter,
      authorFilter,
      languageFilter
    });
    if (minArticleIdExclusive !== null) {
      appendCursorCondition(articleQuery.where, {
        id: { [Op.gt]: minArticleIdExclusive }
      });
    }

    debugLog(`\x1b[36mQuery attributes: ${articleQuery.attributes.join(", ")} (smartFolder: ${smartFolderSearch})\x1b[0m`);
    // Handles the case where first seen age filter is available.
    if (firstSeenAgeFilter) {
      const { value, unit } = firstSeenAgeFilter;
      debugLog(`\x1b[31mFirst-seen age filter applied: firstSeen is null or within the last ${value}${unit}.\x1b[0m`);
    }

    // Builds the query metadata assembled while performing search articles.
    const queryMetadata = {
        userId,
        search,
        tag: tagFilter,
        sort,
        date: dateToken
    };
    // Coerces the runtime filters required into the representation required while performing search articles.
    const runtimeFiltersRequired = Boolean(qualityFilter || freshnessFilter);
    const needsHighTrustRuntimeSort = prioritizeHighTrust;
    // Selects the result limit based on whether smart folder search is available.
    const resultLimit = limitFilter || (smartFolderSearch ? limitCount : null);

    // Handles the case where count only is available and runtime filters required is unavailable.
    if (countOnly && !runtimeFiltersRequired) {
      const articleCount = resultLimit
        ? await executeSearchBoundedCount({ ...articleQuery, limit: resultLimit })
        : await executeSearchCount(articleQuery);

      debugLog(`\x1b[31mCounted ${articleCount} articles matching query for user ${userId}\x1b[0m`);

      return {
        query: queryMetadata,
        articleCount
      };
    }

    if (pagination) {
      if (
        !['asc', 'desc'].includes(logicalSort)
        || runtimeFiltersRequired
        || needsHighTrustRuntimeSort
      ) {
        throw new ArticleSearchCursorError(
          'CURSOR_SORT_UNSUPPORTED',
          'Cursor pagination is unavailable for this article ordering.',
          422
        );
      }

      const pageSize = pagination.pageSize;
      const cursorQuery = {
        search: rawSearch,
        categoryId: String(categoryId ?? '%'),
        feedId: String(feedId ?? '%'),
        status: String(status ?? 'unread'),
        tag: workingTag || null,
        sort: logicalSort,
        grouping: effectiveGrouping,
        includeDevelopingEvents: effectiveIncludeDevelopingEvents,
        minAdvertisementScore: Number(finalMinAdvertisementScore),
        minSentimentScore: Number(finalMinSentimentScore),
        minQualityScore: Number(finalMinQualityScore),
        prioritizeHighTrust,
        dateFrom: dateRange?.start?.toISOString?.() || null,
        dateTo: dateRange?.end?.toISOString?.() || null,
        pageSize,
        resultLimit: resultLimit || null
      };
      const queryHash = fingerprintArticleSearch(cursorQuery);
      const parsedCursor = pagination.cursor
        ? parseArticleSearchCursor(pagination.cursor, {
          userId,
          queryHash,
          sort: logicalSort
        })
        : null;
      const snapshotMaxArticleId = parsedCursor?.snapshotMaxArticleId
        ?? Number(await Article.max('id', { where: { userId } }) || 0);
      appendCursorCondition(articleQuery.where, {
        id: { [Op.lte]: snapshotMaxArticleId }
      });
      const effectiveResultLimit = resultLimit
        || (!smartFolderSearch && hasSearchIntent && rawSearch !== '%' ? 500 : null);
      const countedTotal = parsedCursor?.totalCount ?? await executeSearchCount(articleQuery);
      const totalCount = effectiveResultLimit === null
        ? countedTotal
        : Math.min(countedTotal, effectiveResultLimit);
      const sourceCount = parsedCursor?.sourceCount ?? await executeSearchSourceCount(articleQuery);
      if (parsedCursor) {
        applyCursorPosition(articleQuery, logicalSort, parsedCursor.position);
      }

      const consumedCount = parsedCursor?.consumedCount || 0;
      const remainingCount = effectiveResultLimit === null
        ? null
        : Math.max(0, effectiveResultLimit - consumedCount);
      const pageCapacity = remainingCount === null
        ? pageSize
        : Math.min(pageSize, remainingCount);
      const requestedRowCount = pageCapacity > 0 ? pageCapacity + 1 : 0;
      const pageRows = requestedRowCount > 0
        ? await executeSearch({ ...articleQuery, limit: requestedRowCount })
        : [];
      const hasMore = pageRows.length > pageCapacity
        && (remainingCount === null || remainingCount > pageCapacity);
      const articles = pageRows.slice(0, pageCapacity);
      const itemIds = articles.map(article => articleValue(article, 'id'));
      const nextConsumedCount = consumedCount + articles.length;
      const cursorIssuedAt = Date.now();
      const nextCursor = hasMore && articles.length
        ? createArticleSearchCursor({
          userId,
          queryHash,
          sort: logicalSort,
          snapshotMaxArticleId,
          position: cursorPositionForArticle(articles.at(-1)),
          consumedCount: nextConsumedCount,
          totalCount,
          sourceCount,
          now: cursorIssuedAt
        })
        : null;

      if (persistSettings) {
        await Setting.upsert({
          userId,
          categoryId,
          feedId,
          status,
          sort: logicalSort,
          minAdvertisementScore: finalMinAdvertisementScore,
          minSentimentScore: finalMinSentimentScore,
          minQualityScore: finalMinQualityScore,
          viewMode,
          grouping: effectiveGrouping,
          includeDevelopingEvents: effectiveIncludeDevelopingEvents,
          prioritizeHighTrust: Boolean(userSettings?.prioritizeHighTrust),
          themeMode: userSettings?.themeMode ?? 'system',
          startupViewMode: userSettings?.startupViewMode ?? 'last-used'
        });
      }

      return {
        paginationVersion: 1,
        query: queryMetadata,
        totalCount,
        sourceCount,
        snapshot: {
          snapshotMaxArticleId,
          expiresAt: parsedCursor
            ? new Date(parsedCursor.expiresAt).toISOString()
            : articleSearchCursorExpiresAt(cursorIssuedAt)
        },
        page: {
          itemIds,
          hasMore,
          nextCursor
        }
      };
    }

    // Fetch articles based on constructed query
    let articles = await executeSearch(articleQuery);
    
    debugLog(`\x1b[33mFetched ${articles.length} articles from database (before in-memory filters)\x1b[0m`);

    // Delegate all in-memory sorting and filtering to sortArticles
    if (
      !smartFolderSearch
      || sortRecommended
      || sortTopStories
      || sortQuality
      || sortAttention
      || qualityFilter
      || freshnessFilter
      || needsHighTrustRuntimeSort
    ) {
      articles = sortArticles(articles, {
        sortRecommended,
        sortTopStories,
        sortQuality,
        sortAttention,
        sortDirection: logicalSort,
        qualityFilter,
        freshnessFilter,
        prioritizeHighTrust
      });
    } else {
      debugLog(`\x1b[33mSkipping sort for smart folder search\x1b[0m`);
    }

    let itemIds;
    // Maps source values into the result produced while performing search articles.
    itemIds = articles.map(article => article.id);
    
    // Apply limit filter from search expression (limit:50)
    // Takes precedence over default limits
    if (limitFilter && itemIds.length > limitFilter) {
      itemIds = itemIds.slice(0, limitFilter);
      debugLog(`\x1b[31mApplied limit filter: ${limitFilter} articles\x1b[0m`);
    // Handles the case where smart folder search is available and limit count is available and item id count exceeds limit count.
    } else if (smartFolderSearch && limitCount && itemIds.length > limitCount) {
      // Smart folder optimization: apply limitCount
      itemIds = itemIds.slice(0, limitCount);
      debugLog(`\x1b[31mLimited smart folder results to ${limitCount} articles\x1b[0m`);
    // Handles the case where smart folder search is unavailable and limit filter is unavailable.
    } else if (!smartFolderSearch && !limitFilter) {
      // Limit to 500 articles when search expressions are used (non-smart folder, no explicit limit)
      const hasSearchExpression = hasSearchIntent && rawSearch !== "%";
      // Handles the case where has search expression is available and item id count exceeds 500.
      if (hasSearchExpression && itemIds.length > 500) {
        itemIds = itemIds.slice(0, 500);
        debugLog(`\x1b[31mLimited results to 500 articles due to search expression usage\x1b[0m`);
      }
    }
    
    debugLog(`\x1b[31mFound ${itemIds.length} articles matching query for user ${userId}\x1b[0m`);

    // Returns early when count only is available.
    if (countOnly) {
      return {
        query: queryMetadata,
        articleCount: itemIds.length
      };
    }

    // Tracks distinct item id set while performing search articles.
    const itemIdSet = new Set(itemIds.map(id => String(id)));
    // Filters source values to the entries eligible while performing search articles.
    const sourceCount = new Set(
      articles
        .filter(article => itemIdSet.has(String(articleValue(article, 'id'))))
        .map(article => articleValue(article, 'feedId'))
        .filter(feedId => feedId !== null && feedId !== undefined)
    ).size;

    // Handles the case where persist settings is available.
    if (persistSettings) {
      // Update user settings (skip when tag-based query is used)
      // Note: tag is not persisted in settings currently
      debugLog(`\x1b[32mPersisting search settings for user ${userId}\x1b[0m`);
      // Builds the settings payload assembled while performing search articles.
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
        grouping: effectiveGrouping,
        includeDevelopingEvents: effectiveIncludeDevelopingEvents,
        prioritizeHighTrust: Boolean(userSettings?.prioritizeHighTrust),
        themeMode: userSettings?.themeMode ?? 'system',
        startupViewMode: userSettings?.startupViewMode ?? 'last-used'
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
