import db from '../models/index.js';
const { Setting } = db;
import { Op, fn, col, where } from 'sequelize';
import { sortArticles } from './articleSort.service.js';
import { resolveDateFilterToRange } from './articleDateParser.service.js';
import { parseArticleQuery } from './articleQueryParser.service.js';
import { buildArticleSearchQuery, executeSearch } from './articleSearchExecutor.service.js';
import { fetchFeedIds, fetchTaggedArticleIds } from './articleSearchDataAccess.service.js';

// Case-insensitive LIKE helper compatible with MySQL
const ciLike = (column, value) => (
  where(fn('LOWER', col(column)), { [Op.like]: `%${String(value).toLowerCase()}%` })
);

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Get all article IDs based on query parameters with advanced filtering.
 * Supports field filters in search string: star:true/false, unread:true/false, clicked:true/false,
 * tag:name, title:text, sort:DESC/ASC/RECOMMENDED/QUALITY/ATTENTION, and date filters: @YYYY-MM-DD, @today, @yesterday, @"N days ago", @"last DayName"
 */
export const searchArticles = async ({
    userId,
    search = "",
    categoryId = "%",
    feedId = "%",
    status = "unread",
    minAdvertisementScore = null,
    minSentimentScore = null,
    minQualityScore = null,
    sort = "DESC",
    viewMode = "full",
    tag = null,
    clusterView = false,
    persistSettings = false, // IMPORTANT: skip when called internally
    smartFolderSearch = false, // When true, apply smart folder optimizations
    limitCount = null // Maximum number of results (used by smart folders)
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
    if (minAdvertisementScore === null || minSentimentScore === null || minQualityScore === null) {
        userSettings = await Setting.findOne({
            where: { userId },
            attributes: ['minAdvertisementScore', 'minSentimentScore', 'minQualityScore']
        });
    }

    const finalMinAdvertisementScore = minAdvertisementScore ?? userSettings?.minAdvertisementScore ?? 0;
    const finalMinSentimentScore = minSentimentScore ?? userSettings?.minSentimentScore ?? 0;
    const finalMinQualityScore = minQualityScore ?? userSettings?.minQualityScore ?? 0;

    console.log(`\x1b[32mScore thresholds: adv=${finalMinAdvertisementScore}, sentiment=${finalMinSentimentScore}, quality=${finalMinQualityScore}\x1b[0m`);

    const rawSearch = search.trim();
    const parsedQuery = parseArticleQuery({ search: rawSearch, defaultSort: sort || 'DESC' });
    const { filters = {}, sort: sortFilter = sort || 'DESC', limit: limitFilter = null, text = '' } = parsedQuery;

    const {
      star: starFilter = null,
      unread: unreadFilter = null,
      read: readFilter = null,
      clicked: clickedFilter = null,
      tag: tagFilter = null,
      seen: seenFilter = null,
      firstSeenAge: firstSeenAgeFilter = null,
      title: titleFilter = null,
      quality: qualityFilter = null,
      freshness: freshnessFilter = null,
      cluster: clusterFilter = null,
      hot: hotFilter = null
    } = filters;
    const clusterCountFilter = Number.isFinite(filters.clusterCount) ? filters.clusterCount : null;

    let dateRange = null;
    let dateToken = null;
    const resolvedDateFilter = resolveDateFilterToRange(filters.date);
    if (resolvedDateFilter) {
      dateRange = resolvedDateFilter.dateRange;
      dateToken = resolvedDateFilter.dateToken;
      console.log(`\x1b[31mDate filter applied via parser: ${dateToken}\x1b[0m`);
    }

    const hasQuotedText = text
      ? new RegExp(`(^|[\\s,])"${escapeRegExp(text)}"([\\s,]|$)`).test(rawSearch)
      : false;
    const quotedPhrase = hasQuotedText ? text : null;
    const remainingTokens = !hasQuotedText && text ? text.split(/\s+/).filter(Boolean) : [];
    const wordMatches = quotedPhrase ? [] : remainingTokens;

    /**
     * Determine final filter values.
     * Field filters from search string take precedence over query parameters.
     */
    // Sort: search token (sort:ASC/DESC/RECOMMENDED/QUALITY/ATTENTION) overrides query param
    // Smart folder optimization: skip sort entirely (only counting articles)
    let workingSort = sortFilter !== null ? sortFilter : (sort || "DESC");
    let sortRecommended = false;
    let sortQuality = false;
    let sortAttention = false;

    // Normalize sort value when virtual sort modes are specified
    if (workingSort.toUpperCase() === "RECOMMENDED") {
      workingSort = "DESC";
      sortRecommended = true;
    } else if (workingSort.toUpperCase() === "QUALITY") {
      workingSort = "DESC";
      sortQuality = true;
    } else if (workingSort.toUpperCase() === "ATTENTION") {
      workingSort = "DESC";
      sortAttention = true;
    }
    console.log(`\x1b[31mFinal sort value: "${workingSort}" (smartFolder: ${smartFolderSearch})\x1b[0m`);

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
        return {
          query: {
            userId,
            search,
            tag: tagFilter,
            sort,
            date: dateToken
          },
          itemIds: []
        };
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
      // Quality filters: get articles above minimum scores
      advertisementScore: { [Op.gte]: finalMinAdvertisementScore },
      sentimentScore: { [Op.gte]: finalMinSentimentScore },
      qualityScore: { [Op.gte]: finalMinQualityScore }
    };

    // Text search logic:
    // - If title: filter present: search title for that value, AND content for remaining tokens
    // - If no title: filter: search both title OR content for all tokens
    // - Handle quoted vs unquoted searches appropriately
    if (titleFilter) {
      // title:value specified - apply CI match on title
      const titleCond = ciLike('title', titleFilter);
      baseWhere[Op.and] = [...(baseWhere[Op.and] || []), titleCond];
      // If there are remaining tokens or quoted phrase, also search content for them
      if (quotedPhrase) {
        const contentCond = ciLike('contentOriginal', quotedPhrase);
        baseWhere[Op.and] = [...(baseWhere[Op.and] || []), contentCond];
        console.log(`\x1b[31mTitle search: "%${titleFilter}%", Content exact phrase: "${quotedPhrase}"\x1b[0m`);
      } else if (remainingTokens.length > 0) {
        // OR on individual words in content (case-insensitive)
        baseWhere[Op.or] = remainingTokens.map(token => ciLike('contentOriginal', token));
        console.log(`\x1b[31mTitle search: "%${titleFilter}%", Content word-by-word OR: ${remainingTokens.join(", ")}\x1b[0m`);
      } else {
        console.log(`\x1b[31mTitle-only search: "%${titleFilter}%"\x1b[0m`);
      }
    } else if (quotedPhrase) {
      // Quoted phrase: search title OR content for exact phrase (case-insensitive)
      baseWhere[Op.or] = [
        ciLike('title', quotedPhrase),
        ciLike('contentOriginal', quotedPhrase)
      ];
      console.log(`\x1b[31mQuoted phrase search (exact): "${quotedPhrase}"\x1b[0m`);
    } else if (wordMatches.length > 0) {
      // Unquoted search: each word must appear somewhere in title OR content (case-insensitive)
      // Build: (title LIKE %word1% OR content LIKE %word1%) AND (title LIKE %word2% OR content LIKE %word2%) ... with LOWER()
      const wordConditions = remainingTokens.map(token => ({
        [Op.or]: [
          ciLike('title', token),
          ciLike('contentOriginal', token)
        ]
      }));
      baseWhere[Op.and] = wordConditions;
      console.log(`\x1b[31mWord-by-word AND search: ${remainingTokens.join(", ")}\x1b[0m`);
    }
    // Note: If no search terms at all (no titleFilter, quotedPhrase, or wordMatches), 
    // we don't add any text search filters - baseWhere will match all articles

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
      workingSort,
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
      clusterFilter,
      clusterView,
      clusterCountFilter,
      firstSeenAgeFilter
    });

    console.log(`\x1b[36mQuery attributes: ${articleQuery.attributes.join(", ")} (smartFolder: ${smartFolderSearch})\x1b[0m`);
    if (firstSeenAgeFilter) {
      const { value, unit } = firstSeenAgeFilter;
      const intervalUnit = unit === 'h' ? 'HOUR' : 'DAY';
      console.log(`\x1b[31mFirst seen age filter applied: firstSeen IS NULL OR firstSeen >= NOW() - INTERVAL ${value} ${intervalUnit}\x1b[0m`);
    }

    // Fetch articles based on constructed query
    let articles = await executeSearch(articleQuery);
    
    console.log(`\x1b[33mFetched ${articles.length} articles from database (before in-memory filters)\x1b[0m`);

    // If sorting by the recommended score, compute recommended scores and sort.
    if (sortRecommended) {
      workingSort = "RECOMMENDED";
    }
    if (sortQuality) {
      workingSort = "QUALITY";
    }
    if (sortAttention) {
      workingSort = "ATTENTION";
    }

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

    if (persistSettings) {
      // Update user settings (skip when tag-based query is used)
      // Note: tag is not persisted in settings currently
      console.log(`\x1b[32mPersisting search settings for user ${userId}\x1b[0m`);
      const settingsPayload = {
        userId: userId,
        categoryId: categoryId,
        feedId: feedId,
        status: status,
        sort: workingSort,
        minAdvertisementScore: finalMinAdvertisementScore,
        minSentimentScore: finalMinSentimentScore,
        minQualityScore: finalMinQualityScore,
        viewMode: viewMode,
        clusterView: clusterView
      };

      // Persist atomically to avoid race conditions across concurrent requests.
      await Setting.upsert(settingsPayload);
    }

    return {
        query: {
            userId,
            search,
            tag: tagFilter,
            sort,
            date: dateToken
        },
        itemIds
    };
};