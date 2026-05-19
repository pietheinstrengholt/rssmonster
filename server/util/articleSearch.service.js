import db from '../models/index.js';
const { Article, Event, Feed, Tag, Setting } = db;
import { Op, fn, col, where } from 'sequelize';
import { sortArticles } from './articleSort.service.js';
import { resolveDateFilterToRange } from './articleDateParser.service.js';
import { parseArticleQuery } from './articleQueryParser.service.js';

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

    const starFilter = typeof filters.star === 'boolean' ? filters.star : null;
    const unreadFilter = typeof filters.unread === 'boolean' ? filters.unread : null;
    const readFilter = typeof filters.read === 'boolean' ? filters.read : null;
    const clickedFilter = typeof filters.clicked === 'boolean' ? filters.clicked : null;
    const tagFilter = typeof filters.tag === 'string' ? filters.tag : null;
    const seenFilter = typeof filters.seen === 'boolean' ? filters.seen : null;
    const firstSeenAgeFilter = filters.firstSeenAge || null;
    const titleFilter = typeof filters.title === 'string' ? filters.title : null;
    const qualityFilter = filters.quality || null;
    const freshnessFilter = filters.freshness || null;
    const clusterFilter = filters.cluster || null;
    const clusterCountFilter = Number.isFinite(filters.clusterCount) ? filters.clusterCount : null;
    const hotFilter = typeof filters.hot === 'boolean' ? filters.hot : null;

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
      try {
        // Find all tag rows for this user and tag name
        const tagRows = await Tag.findAll({
          where: { userId: userId, name: workingTag },
          attributes: ["articleId"],
        });

        // Extract article IDs from tag rows
        taggedArticleIds = tagRows.map(t => t.articleId);
        console.log(`\x1b[31mFound ${taggedArticleIds.length} articles with tag "${workingTag}" for user ${userId}\x1b[0m`);

        // If tag was provided but no articles found, return empty result
        if (taggedArticleIds.length === 0) {
          return res.status(200).json({
            query: [{ userId: userId, tag: workingTag, sort: workingSort }],
            itemIds: []
          });
        }
      } catch (err) {
        console.error(`\x1b[31mError fetching articles by tag:\x1b[0m`, err);
        return res.status(500).json({ error: err.message });
      }
    }

    /**
     * Determine which feeds to query based on categoryId.
     * If categoryId is "%" (all), get all feeds for the user.
     * Otherwise, get only feeds in the specified category.
     */
    const feedQuery = categoryId === "%" 
      ? { attributes: ["id"] }
      : { 
          attributes: ["id"],
          where: { 
            userId: userId,
            categoryId: { [Op.like]: categoryId }
          }
        };
    
    const feeds = await Feed.findAll(feedQuery);

    /**
     * Final feed ID list to query.
     * If specific feedId provided, use it; otherwise use all feeds from category query.
     */
    const feedIds = feedId !== "%" 
      ? feedId 
      : feeds.map(feed => feed.id);

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

    // Apply firstSeen age filter if present (firstSeen IS NULL OR firstSeen >= now() - duration)
    if (firstSeenAgeFilter) {
      const { value, unit } = firstSeenAgeFilter;
      const intervalUnit = unit === 'h' ? 'HOUR' : 'DAY';
      baseWhere[Op.or] = [
        { firstSeen: { [Op.is]: null } },
        { firstSeen: { [Op.gte]: Article.sequelize.literal(`NOW() - INTERVAL ${value} ${intervalUnit}`) } }
      ];
      console.log(`\x1b[31mFirst seen age filter applied: firstSeen IS NULL OR firstSeen >= NOW() - INTERVAL ${value} ${intervalUnit}\x1b[0m`);
    }

    /**
     * Build final article query.
     * Start with base WHERE conditions, then apply field filters if present.
     * Optimize attribute selection based on what's actually needed:
     * - Smart folders without filters: only id
     * - Smart folders with quality/freshness filters: id + score fields + published
    * - Regular searches with recommended sort: id + published + score fields
     * - Regular searches with quality sort: id + score fields
     * - Regular searches otherwise: id + published (for ordering)
     */
    const queryAttributes = ["id"];
    
    // Determine what attributes we need based on filters and sort
    const needsQuality = qualityFilter || sortQuality;
    const needsFreshness = freshnessFilter || sortRecommended;
    const needsAttention = sortAttention;
    const needsPublished = !smartFolderSearch || needsFreshness;
    
    if (needsQuality) {
      // Quality virtual field needs these score columns
      queryAttributes.push("advertisementScore", "sentimentScore", "qualityScore");
    }
    
    if (needsFreshness) {
      // Freshness virtual field needs published date
      if (!queryAttributes.includes("published")) {
        queryAttributes.push("published");
      }
      // Also need quality scores for recommended computation
      if (!queryAttributes.includes("qualityScore")) {
        queryAttributes.push("advertisementScore", "sentimentScore", "qualityScore");
      }
    } else if (needsPublished && !queryAttributes.includes("published")) {
      // Need published for ordering even if we don't compute freshness
      queryAttributes.push("published");
    }
    
    if (needsAttention) {
      // AttentionScore virtual field needs these columns
      queryAttributes.push("attentionBucket", "openedCount", "clickedAmount");
    }
    
    console.log(`\x1b[36mQuery attributes: ${queryAttributes.join(", ")} (smartFolder: ${smartFolderSearch})\x1b[0m`);
    
    const articleQuery = {
      attributes: queryAttributes,
      where: baseWhere
    };

    // Include cluster + feed associations when sorting by the recommended score
    // so computeRecommended can access cluster.articleCount, cluster.sourceDiversityScore,
    // and Feed.feedTrust for the quality virtual field
    if (sortRecommended) {
      articleQuery.include = [
        {
          model: Event,
          as: 'cluster',
          attributes: ['id', 'articleCount', 'eventStrength', 'sourceDiversityScore', 'sourceCount', 'topicId'],
          required: false
        },
        {
          model: Feed,
          attributes: ['id', 'feedTrust'],
          required: false
        },
        {
          model: Tag,
          attributes: ['id', 'tagType'],
          required: false
        }
      ];
    }

    // Add SQL order only for direct DB sorts.
    // Virtual sort modes are ordered in-memory in articleSort.service.
    if (!smartFolderSearch && !sortRecommended && !sortQuality && !sortAttention) {
      articleQuery.order = [["published", workingSort]];
    }

    /**
     * Field filters from search take precedence over status parameter.
     * If any field filter is present, it overrides the default status-driven logic.
     */
    if (starFilter !== null) {
      // star:true → only starred articles, star:false → only non-starred
      articleQuery.where.starInd = starFilter ? 1 : 0;
    }

    if (unreadFilter !== null) {
      // unread:true → only unread, unread:false → only read
      articleQuery.where.status = unreadFilter ? "unread" : "read";
    }

    if (readFilter !== null) {
      // read:true → only read, read:false → only unread
      articleQuery.where.status = readFilter ? "read" : "unread";
    }

    if (clickedFilter !== null) {
      // clicked:true → only clicked articles, clicked:false → only non-clicked
      articleQuery.where.clickedAmount = clickedFilter ? { [Op.gt]: 0 } : 0;
    }

    if (seenFilter !== null) {
      // seen:true → only articles never seen before (firstSeen IS NULL)
      articleQuery.where.firstSeen = seenFilter ? { [Op.is]: null } : { [Op.not]: null };
    }

    if (hotFilter !== null) {
      // hot:true → only hot articles, hot:false → only non-hot
      articleQuery.where.hotInd = hotFilter ? 1 : 0;
      if (hotFilter) {
        delete articleQuery.where.feedId; // Hot articles ignore feedId
      }
    }

    /**
     * If no field filters are present, use traditional status-driven logic.
     * Status can be: "unread", "read", "star", "hot", or "clicked".
     * When rawSearch is set, default to "%" (all statuses) unless overridden by unread/read filters.
     */
    if (starFilter === null && unreadFilter === null && readFilter === null && clickedFilter === null && hotFilter === null) {
      // If there's a search query, default to "%" unless status is a special type (star, hot, clicked)
      const effectiveStatus = rawSearch && !["star", "hot", "clicked"].includes(status) ? "%" : status;
      
      if (effectiveStatus === "star") {
        articleQuery.where.starInd = 1;
      } else if (effectiveStatus === "hot") {
        delete articleQuery.where.feedId; // Hot articles ignore feedId
        articleQuery.where.hotInd = 1;
      } else if (effectiveStatus === "clicked") {
        articleQuery.where.clickedAmount = { [Op.gt]: 0 };
      } else if (effectiveStatus !== "%") {
        articleQuery.where.status = effectiveStatus;
      }
      // If effectiveStatus === "%", don't add any status filter (search all statuses)
    }

    /**
     * Cluster view:
    * When enabled, only return cluster representatives.
    * This collapses related articles into one item per cluster.
    * Search token (cluster:all/eventCluster) overrides clusterView parameter.
     */
    const workingClusterView = clusterFilter !== null ? clusterFilter : clusterView;
    if (Number.isFinite(clusterCountFilter)) {
      const countLiteral = Article.sequelize.literal(
        '(SELECT e.articleCount FROM events e WHERE e.id = articles.eventId)'
      );
      articleQuery.where[Op.and] = [
        ...(articleQuery.where[Op.and] || []),
        Article.sequelize.where(countLiteral, { [Op.gte]: clusterCountFilter })
      ];
    }
    if (workingClusterView === 'eventCluster') {
      articleQuery.where[Op.or] = [
        {
          id: {
            [Op.in]: Article.sequelize.literal(
              `(SELECT representativeArticleId FROM events)`
            )
          }
        },
        {
          eventId: {
            [Op.is]: null
          }
        }
      ];
    }

    // Fetch articles based on constructed query
    let articles = await Article.findAll(articleQuery);
    
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