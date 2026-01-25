import db from '../models/index.js';
const { Article, Feed, Tag, Setting } = db;
import { Op } from 'sequelize';
import { computeImportance } from './importanceScore.js';

/**
 * Get all article IDs based on query parameters with advanced filtering.
 * Supports field filters in search string: star:true/false, unread:true/false, clicked:true/false,
 * tag:name, title:text, sort:DESC/ASC/IMPORTANCE/QUALITY/ATTENTION, and date filters: @YYYY-MM-DD, @today, @yesterday, @"N days ago", @"last DayName"
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

    /**
     * Parse search query and extract field filters.
     * Field filters can override default query parameters and combine with text search.
     * Supported filters: star:true/false, unread:true/false, clicked:true/false,
     * tag:name, title:text, sort:DESC/ASC/IMPORTANCE/QUALITY/ATTENTION, limit:N, @YYYY-MM-DD, @today, @yesterday, @"N days ago", @"last DayName"
     */
    const rawSearch = search.trim();
    let starFilter = null; // When set, overrides status parameter to filter by starInd
    let unreadFilter = null; // When set, overrides status parameter to filter by read/unread
    let readFilter = null; // When set, overrides status parameter to filter by read/unread
    let clickedFilter = null; // When set, filters by clickedAmount
    let tagFilter = null; // Tag name extracted from search (tag:something)
    let seenFilter = null; // Seen filter from search (seen:true/false)
    let firstSeenAgeFilter = null; // First seen age filter from search (firstSeen:24h, firstSeen:7d)
    let sortFilter = null; // Sort direction extracted from search (sort:DESC/ASC/IMPORTANCE/QUALITY/ATTENTION)
    let titleFilter = null; // Title-specific search (title:text) - searches title only
    let qualityFilter = null; // Quality score filter captured from search (quality:>0.6)
    let freshnessFilter = null; // Freshness filter captured from search (freshness:0.6)
    let clusterFilter = null; // Cluster view filter captured from search (cluster:true/false)
    let hotFilter = null; // Hot filter captured from search (hot:true/false)
    let limitFilter = null; // Result limit extracted from search (limit:50)
    let dateRange = null; // Date range object: { start: Date, end: Date }
    let dateToken = null; // Original date token to echo back in response
    let titleQuoted = false; // Track if title search is quoted for exact matching

    /**
     * Pre-scan for patterns with spaces before tokenizing.
     * These patterns can contain spaces, so we need to handle them separately.
     * Supported patterns:
     * - @"N days ago": @"2 days ago" searches for exactly N calendar days ago
     * - @"last DayName": @"last Monday" searches for most recent occurrence of that day
     * - title:"...": Exact phrase match in title only
     * The quotes are optional for date patterns.
     */
    let workingSearch = rawSearch;
    console.log(`\x1b[31mPre-scan search string for special patterns: "${rawSearch}"\x1b[0m`);
    
    // Pattern: title:"exact phrase"
    const titleQuotedMatch = rawSearch.match(/title:"([^"]+)"/i);
    if (titleQuotedMatch) {
      titleFilter = titleQuotedMatch[1];
      titleQuoted = true;
      console.log(`\x1b[31mTitle exact match filter applied: "${titleFilter}"\x1b[0m`);
      // Remove the matched segment so it doesn't get tokenized
      workingSearch = workingSearch.replace(titleQuotedMatch[0], "").trim();
    }
    
    // Pattern: @"N days ago"
    const daysAgoMatch = rawSearch.match(/@"?(\d+)\s+days\s+ago"?/i);
    if (daysAgoMatch) {
      const days = parseInt(daysAgoMatch[1], 10);
      if (!Number.isNaN(days)) {
        dateToken = `${days} days ago`;
        // Calculate UTC day range for exactly N days ago (00:00:00 to 23:59:59)
        const today = new Date();
        const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days, 0, 0, 0, 0));
        const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days, 23, 59, 59, 999));
        dateRange = { start, end };
        console.log(`\x1b[31mDate filter applied via search token: ${dateToken} (exact UTC day)\x1b[0m`);
        // Remove the matched segment so it doesn't pollute text search tokens
        workingSearch = workingSearch.replace(daysAgoMatch[0], "").trim();
      }
    }
    
    // Pattern: @"last DayName" (e.g., @"last Monday")
    const lastDayMatch = rawSearch.match(/@"?last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"?/i);
    if (lastDayMatch && !dateRange) { // Only apply if no other date filter matched
      const dayName = lastDayMatch[1].toLowerCase();
      const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
      const targetDay = dayMap[dayName];
      
      dateToken = `last ${dayName}`;
      // Calculate most recent occurrence of target day
      const today = new Date();
      const currentDay = today.getUTCDay();
      let daysBack = currentDay - targetDay;
      if (daysBack <= 0) daysBack += 7; // Go back to previous week if target day hasn't occurred this week
      
      const targetDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysBack, 0, 0, 0, 0));
      const start = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0, 0));
      const end = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));
      dateRange = { start, end };
      console.log(`\x1b[31mDate filter applied via search token: ${dateToken} (${start.toISOString().split('T')[0]})\x1b[0m`);
      // Remove the matched segment so it doesn't pollute text search tokens
      workingSearch = workingSearch.replace(lastDayMatch[0], "").trim();
    }

    /**
     * Tokenize the search string and extract field filters.
     * Split on whitespace or commas to support various input styles.
     * Examples: "star:true unread:true", "star:true, unread:true", "tag:tech @today"
     * 
     * Handle quoted phrases for exact matches:
     * - "Control Flow" (with quotes) → exact phrase match
     * - Control Flow (without quotes) → match both words individually
     */
    let quotedPhrase = null;
    let workingSearchForTokens = workingSearch;
    
    // Extract quoted phrase if present (e.g., "Control Flow")
    const quotedMatch = workingSearch.match(/"([^"]+)"/);
    if (quotedMatch) {
      quotedPhrase = quotedMatch[1]; // e.g., "Control Flow"
      workingSearchForTokens = workingSearch.replace(quotedMatch[0], "").trim(); // Remove the quoted part
    }
    
    const tokens = workingSearchForTokens === "" ? [] : workingSearchForTokens.split(/[\s,]+/).filter(Boolean);
    const remainingTokens = []; // Non-filter tokens that will be used for text search

    tokens.forEach(tok => {
      // Clean trailing punctuation (allows: "star:true," or "tag:tech;")
      const cleaned = tok.replace(/[.,;]+$/, "");
      console.log(`\x1b[31mProcessing search token: "${cleaned}"\x1b[0m`);

      // Match various field filter patterns
      const starMatch = cleaned.match(/^star:\s*(true|false)$/i); // star:true or star:false
      const unreadMatch = cleaned.match(/^unread:\s*(true|false)$/i); // unread:true or unread:false
      const readMatch = cleaned.match(/^read:\s*(true|false)$/i); // read:true or read:false
      const clickedMatch = cleaned.match(/^clicked:\s*(true|false)$/i); // clicked:true or clicked:false
      const seenMatch = cleaned.match(/^seen:\s*(true|false)$/i); // seen:true or seen:false
      const firstSeenAgeMatch = cleaned.match(/^firstSeen:\s*(\d+)([hd])$/i); // firstSeen:24h or firstSeen:7d
      const tagMatch = cleaned.match(/^tag:\s*(.+)$/i); // tag:technology, tag:news, etc.
      const titleMatch = cleaned.match(/^title:\s*(.+)$/i); // title:javascript, title:AI, etc.
      const sortMatch = cleaned.match(/^sort:\s*(DESC|ASC|IMPORTANCE|QUALITY|ATTENTION)$/i); // sort:DESC, sort:ASC, sort:IMPORTANCE, sort:QUALITY, or sort:ATTENTION
      const qualityMatch = cleaned.match(/^quality:(<=|>=|<|>|=)?\s*(\d+\.?\d*|\.\d+)$/i); // quality:>0.6, quality:<0.6, quality:=0.5
      const freshnessMatch = cleaned.match(/^freshness:(<=|>=|<|>|=)?\s*(\d+\.?\d*|\.\d+)$/i); // freshness:0.6, freshness:>0.6
      const dateMatch = cleaned.match(/^@(\d{4}-\d{2}-\d{2})$/); // @2025-12-14
      const todayMatch = cleaned.match(/^@today$/i); // @today (last 24 hours)
      const yesterdayMatch = cleaned.match(/^@yesterday$/i); // @yesterday (previous UTC day)
      const lastWeekMatch = cleaned.match(/^@lastweek$/i); // @lastweek (previous 7 days)
      const clusterMatch = cleaned.match(/^cluster:\s*(true|false)$/i); // cluster:true or cluster:false
      const hotMatch = cleaned.match(/^hot:\s*(true|false)$/i); // hot:true or hot:false
      const limitMatch = cleaned.match(/^limit:\s*(\d+)$/i); // limit:50, limit:100, etc.
      
      if (hotMatch) {
        hotFilter = hotMatch[1].toLowerCase() === 'true';
        console.log(`\x1b[31mHot filter applied via search token: ${hotFilter}\x1b[0m`);
      } else if (limitMatch) {
        limitFilter = parseInt(limitMatch[1], 10);
        console.log(`\x1b[31mLimit filter applied via search token: ${limitFilter}\x1b[0m`);
      } else if (clusterMatch) {
        clusterFilter = clusterMatch[1].toLowerCase() === 'true';
        console.log(`\x1b[31mCluster filter applied via search token: ${clusterFilter}\x1b[0m`);
      } else if (starMatch) {
        starFilter = starMatch[1].toLowerCase() === 'true';
        console.log(`\x1b[31mStar filter applied via search token: ${starFilter}\x1b[0m`);
      } else if (unreadMatch) {
        unreadFilter = unreadMatch[1].toLowerCase() === 'true';
        console.log(`\x1b[31mUnread filter applied via search token: ${unreadFilter}\x1b[0m`);
      } else if (readMatch) {
        readFilter = readMatch[1].toLowerCase() === 'true';
        console.log(`\x1b[31mRead filter applied via search token: ${readFilter}\x1b[0m`);
      } else if (clickedMatch) {
        clickedFilter = clickedMatch[1].toLowerCase() === 'true';
        console.log(`\x1b[31mClicked filter applied via search token: ${clickedFilter}\x1b[0m`);
      } else if (seenMatch) {
        seenFilter = seenMatch[1].toLowerCase() === 'true';
        console.log(`\x1b[31mSeen filter applied via search token: ${seenFilter}\x1b[0m`);
      } else if (firstSeenAgeMatch) {
        const value = parseInt(firstSeenAgeMatch[1], 10);
        const unit = firstSeenAgeMatch[2].toLowerCase();
        firstSeenAgeFilter = { value, unit };
        console.log(`\x1b[31mFirst seen age filter applied via search token: ${value}${unit}\x1b[0m`);
      } else if (tagMatch) {
        tagFilter = tagMatch[1].trim();
        console.log(`\x1b[31mTag filter applied via search token: ${tagFilter}\x1b[0m`);
      } else if (titleMatch && !titleQuoted) {
        // Only process unquoted title: patterns (quoted ones handled in pre-scan)
        titleFilter = titleMatch[1].trim();
        console.log(`\x1b[31mTitle filter applied via search token: ${titleFilter}\x1b[0m`);
      } else if (sortMatch) {
        sortFilter = sortMatch[1].toUpperCase();
        console.log(`\x1b[31mSort filter applied via search token: ${sortFilter}\x1b[0m`);
      } else if (qualityMatch) {
        qualityFilter = {
          operator: qualityMatch[1] || ">=", // Default: filter IN good articles and filter OUT poor articles.
          value: parseFloat(qualityMatch[2])
        };
        console.log(`\x1b[31mQuality filter applied via search token: ${qualityMatch.slice(1).join(', ')}\x1b[0m`);
      } else if (freshnessMatch) {
        freshnessFilter = {
          operator: freshnessMatch[1] || ">=",
          value: parseFloat(freshnessMatch[2])
        };
        console.log(`\x1b[31mFreshness filter applied via search token: ${freshnessMatch.slice(1).join(', ')}\x1b[0m`);
      } else if (dateMatch) {
        // @YYYY-MM-DD: Specific calendar day in UTC
        dateToken = dateMatch[1];
        dateRange = {
          start: new Date(`${dateMatch[1]}T00:00:00.000Z`),
          end: new Date(`${dateMatch[1]}T23:59:59.999Z`)
        };
        console.log(`\x1b[31mDate filter applied via search token: ${dateToken}\x1b[0m`);
      } else if (todayMatch) {
        // @today: Rolling 24-hour window from now back
        dateToken = "today";
        const now = new Date();
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        dateRange = { start, end: now };
        console.log(`\x1b[31mDate filter applied via search token: today (last 24h)\x1b[0m`);
      } else if (yesterdayMatch) {
        // @yesterday: Previous UTC calendar day (00:00:00 to 23:59:59)
        dateToken = "yesterday";
        const today = new Date();
        const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1, 23, 59, 59, 999));
        dateRange = { start, end };
        console.log(`\x1b[31mDate filter applied via search token: yesterday (UTC day)\x1b[0m`);
      } else if (lastWeekMatch) {
        // @lastweek: Previous 7 days from now back
        dateToken = "lastweek";
        const now = new Date();
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateRange = { start, end: now };
        console.log(`\x1b[31mDate filter applied via search token: lastweek (previous 7 days)\x1b[0m`);
      } else {
        // Not a recognized filter token, keep for text search
        remainingTokens.push(cleaned);
      }
    });

    /**
     * Build LIKE search pattern from remaining (non-filter) tokens.
     * If only field filters were provided (no text search), use wildcard to match all.
     * Example: "javascript @today" → search for "javascript", filter by today
     * Example: "@today sort:ASC" → no text search (wildcard), just filters
     *
     * Special case: if title: filter is present, it searches title separately
     * Example: "title:meter" → search title for "meter"
     * Example: "title:javascript ai" → title contains "javascript" AND content contains "ai"
     * 
     * Quote handling:
     * - "Control Flow" (with quotes) → exact phrase match
     * - Control Flow (without quotes) → match both words individually (OR logic)
     */
    let wordMatches = []; // For unquoted searches: individual word matches
    
    if (quotedPhrase) {
      // Exact phrase match from quoted input
      console.log(`\x1b[31mUsing exact phrase match: "${quotedPhrase}"\x1b[0m`);
    } else if (remainingTokens.length > 0) {
      // Unquoted search: create individual word patterns for OR matching
      wordMatches = remainingTokens.map(token => ({ [Op.like]: `%${token}%` }));
      console.log(`\x1b[31mUsing word-by-word OR matching for: ${remainingTokens.join(", ")}\x1b[0m`);
    }
    // No remaining tokens or quoted phrase: match all

    /**
     * Determine final filter values.
     * Field filters from search string take precedence over query parameters.
     */
    // Sort: search token (sort:ASC/DESC/IMPORTANCE/QUALITY/ATTENTION) overrides query param
    // SortImportance flag set if sort is IMPORTANCE
    // Smart folder optimization: skip sort entirely (only counting articles)
    let workingSort = smartFolderSearch ? "DESC" : (sortFilter !== null ? sortFilter : (sort || "DESC"));
    let sortImportance = false;
    let sortQuality = false;
    let sortAttention = false;

    if (!smartFolderSearch) {
      // Normalize sort value when "IMPORTANCE" is specified
      if (workingSort.toUpperCase() === "IMPORTANCE") {
        workingSort = "DESC";
        sortImportance = true;
      } else if (workingSort.toUpperCase() === "QUALITY") {
        workingSort = "DESC";
        sortQuality = true;
      } else if (workingSort.toUpperCase() === "ATTENTION") {
        workingSort = "DESC";
        sortAttention = true;
      }
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
      // title:value specified - search title (exact match if quoted, otherwise LIKE)
      baseWhere.title = titleQuoted 
        ? { [Op.like]: `%${titleFilter}%` } // Still use LIKE for case-insensitive exact phrase
        : { [Op.like]: `%${titleFilter}%` };
      // If there are remaining tokens or quoted phrase, also search content for them
      if (quotedPhrase) {
        baseWhere.contentOriginal = { [Op.like]: `%${quotedPhrase}%` };
        console.log(`\x1b[31mTitle search: "%${titleFilter}%", Content exact phrase: "${quotedPhrase}"\x1b[0m`);
      } else if (remainingTokens.length > 0) {
        // OR on individual words in content
        baseWhere[Op.or] = wordMatches.map(match => ({ contentOriginal: match }));
        console.log(`\x1b[31mTitle search: "%${titleFilter}%", Content word-by-word OR: ${remainingTokens.join(", ")}\x1b[0m`);
      } else {
        console.log(`\x1b[31mTitle-only search: "%${titleFilter}%"\x1b[0m`);
      }
    } else if (quotedPhrase) {
      // Quoted phrase: search title OR content for exact phrase
      baseWhere[Op.or] = [
        { title: { [Op.like]: `%${quotedPhrase}%` } },
        { contentOriginal: { [Op.like]: `%${quotedPhrase}%` } }
      ];
      console.log(`\x1b[31mQuoted phrase search (exact): "${quotedPhrase}"\x1b[0m`);
    } else if (wordMatches.length > 0) {
      // Unquoted search: each word must appear somewhere in title OR content
      // Build: (title LIKE %word1% OR content LIKE %word1%) AND (title LIKE %word2% OR content LIKE %word2%) ...
      const wordConditions = wordMatches.map(match => ({
        [Op.or]: [
          { title: match },
          { contentOriginal: match }
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
     * - Regular searches with importance sort: id + published + score fields
     * - Regular searches with quality sort: id + score fields
     * - Regular searches otherwise: id + published (for ordering)
     */
    const queryAttributes = ["id"];
    
    // Determine what attributes we need based on filters and sort
    const needsQuality = qualityFilter || (!smartFolderSearch && sortQuality);
    const needsFreshness = freshnessFilter || (!smartFolderSearch && sortImportance);
    const needsAttention = !smartFolderSearch && sortAttention;
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
      // Also need quality scores for importance computation
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

    // Add order clause only for non-smart folder searches
    if (!smartFolderSearch) {
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
     * Search token (cluster:true/false) overrides clusterView parameter.
     */
    const workingClusterView = clusterFilter !== null ? clusterFilter : clusterView;
    if (workingClusterView) {
      articleQuery.where[Op.or] = [
        {
          id: {
            [Op.in]: Article.sequelize.literal(
              `(SELECT representativeArticleId FROM article_clusters)`
            )
          }
        },
        {
          clusterId: {
            [Op.is]: null
          }
        }
      ];
    }

    // Fetch articles based on constructed query
    let articles = await Article.findAll(articleQuery);
    
    console.log(`\x1b[33mFetched ${articles.length} articles from database (before in-memory filters)\x1b[0m`);

    // Apply quality score filter if present (must be done in-memory since quality is a virtual field)
    if (qualityFilter) {
      const beforeQualityCount = articles.length;
      articles = articles.filter(article => {
        const articleQuality = article.quality;
        const { operator, value } = qualityFilter;
        
        switch (operator) {
          case '=':
            return articleQuality === value;
          case '>':
            return articleQuality > value;
          case '<':
            return articleQuality < value;
          case '>=':
            return articleQuality >= value;
          case '<=':
            return articleQuality <= value;
          default:
            return true;
        }
      });
      console.log(`\x1b[31mApplied quality filter (${qualityFilter.operator}${qualityFilter.value}): ${beforeQualityCount} → ${articles.length} articles\x1b[0m`);
    }

    // Apply freshness score filter if present (must be done in-memory since freshness is a virtual field)
    if (freshnessFilter) {
      articles = articles.filter(article => {
        const articleFreshness = article.freshness;
        const { operator, value } = freshnessFilter;
        
        switch (operator) {
          case '=':
            return articleFreshness === value;
          case '>':
            return articleFreshness > value;
          case '<':
            return articleFreshness < value;
          case '>=':
            return articleFreshness >= value;
          case '<=':
            return articleFreshness <= value;
          default:
            return true;
        }
      });
      console.log(`\x1b[31mApplied freshness filter (${freshnessFilter.operator}${freshnessFilter.value}): ${articles.length} articles remaining\x1b[0m`);
    }
    
    // If sorting by importance, compute importance scores and sort
    if (!smartFolderSearch && sortImportance) {
      workingSort = "IMPORTANCE"; // Reflect importance sort in response, needed for later saving to Settings
    }
    if (!smartFolderSearch && sortQuality) {
      workingSort = "QUALITY";
    }
    if (!smartFolderSearch && sortAttention) {
      workingSort = "ATTENTION";
    }

    // Move the sorting logic here to after all filtering is done
    // Skip for smart folder searches (only counting articles)
    if (!smartFolderSearch) {
      console.log(`\x1b[33mSorting articles by ${workingSort}\x1b[0m`);
      if (sortImportance) {
        articles = articles
          .map(article => ({
            article,
            importance: computeImportance(article)
          }))
          .sort((a, b) => b.importance - a.importance)
          .map(item => item.article);
      } else if (sortQuality) {
        articles = articles
          .map(article => ({
            article,
            quality: article.quality
          }))
          .sort((a, b) => b.quality - a.quality)
          .map(item => item.article);
      } else if (sortAttention) {
        // Sort by virtual attentionScore (derives from bucket + opens/clicks)
        articles = articles
          .map(article => ({
            article,
            attention: article.attentionScore || 0
          }))
          .sort((a, b) => b.attention - a.attention)
          .map(item => item.article);
      }
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

      // Enforce a single settings row per user: clear then insert fresh
      await Setting.destroy({ where: { userId } });
      await Setting.create(settingsPayload);
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