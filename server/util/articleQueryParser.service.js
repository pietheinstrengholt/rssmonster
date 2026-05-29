// Parses article search strings into structured filters, text search terms, sort order, and limits.
// It understands RSS Monster's compact query language so the search service can build database predicates.
const DATE_DAY_PATTERN = /@"?last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"?/i;
const DATE_DAYS_AGO_PATTERN = /@"?(\d+)\s+days\s+ago"?/i;

// Parses a boolean field token such as unread:true or hot:false.
const parseBooleanFilter = (token, key) => {
  const match = token.match(new RegExp(`^${key}:\\s*(true|false)$`, 'i'));
  return match ? match[1].toLowerCase() === 'true' : null;
};

// Parses numeric filters that may include comparison operators.
const parseNumberOperatorFilter = token => {
  const match = token.match(/^(<=|>=|<|>|=)?\s*(\d+\.?\d*|\.\d+)$/i);
  if (!match) {
    return null;
  }

  return {
    operator: match[1] || '>=',
    value: parseFloat(match[2])
  };
};

// Parses simple date tokens such as @today, @yesterday, @lastweek, or @YYYY-MM-DD.
const parseDateToken = token => {
  const normalizedToken = token.toLowerCase();

  if (/^@today$/i.test(normalizedToken)) {
    return { type: 'today' };
  }

  if (/^@yesterday$/i.test(normalizedToken)) {
    return { type: 'yesterday' };
  }

  if (/^@lastweek$/i.test(normalizedToken)) {
    return { type: 'lastweek' };
  }

  const isoDateMatch = token.match(/^@(\d{4}-\d{2}-\d{2})$/);
  if (isoDateMatch) {
    return {
      type: 'date',
      value: isoDateMatch[1]
    };
  }

  return null;
};

// Extracts quoted natural-language date patterns while preserving the remaining search text.
const parseQuotedDatePattern = search => {
  const daysAgoMatch = search.match(DATE_DAYS_AGO_PATTERN);
  if (daysAgoMatch) {
    const value = parseInt(daysAgoMatch[1], 10);
    if (!Number.isNaN(value)) {
      return {
        date: {
          type: 'daysAgo',
          value
        },
        cleanedSearch: search.replace(daysAgoMatch[0], '').trim()
      };
    }
  }

  const dayMatch = search.match(DATE_DAY_PATTERN);
  if (dayMatch) {
    return {
      date: {
        type: 'lastDay',
        value: dayMatch[1].toLowerCase()
      },
      cleanedSearch: search.replace(dayMatch[0], '').trim()
    };
  }

  return {
    date: null,
    cleanedSearch: search
  };
};

// Converts a raw article search expression into normalized search text, filters, sorting, and limit data.
export const parseArticleQuery = ({ search = '', defaultSort = 'DESC' } = {}) => {
  const rawSearch = String(search).trim();
  const filters = {};
  let workingSearch = rawSearch;
  let text = '';
  let textMode = 'none';
  let sort = (defaultSort || 'DESC').toUpperCase();
  let limit = null;

  const titleQuotedMatch = workingSearch.match(/title:"([^"]+)"/i);
  if (titleQuotedMatch) {
    filters.title = titleQuotedMatch[1].trim();
    filters.titleExact = true;
    workingSearch = workingSearch.replace(titleQuotedMatch[0], '').trim();
  }

  const quotedDate = parseQuotedDatePattern(workingSearch);
  if (quotedDate.date) {
    filters.date = quotedDate.date;
    workingSearch = quotedDate.cleanedSearch;
  }

  const quotedTextMatch = workingSearch.match(/"([^"]+)"/);
  if (quotedTextMatch) {
    text = quotedTextMatch[1].trim();
    textMode = 'exact';
    workingSearch = workingSearch.replace(quotedTextMatch[0], '').trim();
  }

  const tokens = workingSearch === '' ? [] : workingSearch.split(/[\s,]+/).filter(Boolean);
  const remainingTokens = [];

  for (const token of tokens) {
    const cleaned = token.replace(/[.,;]+$/, '');

    // Simplified boolean filter parsing
    let matchedBooleanFilter = false;
    for (const key of ['star', 'unread', 'read', 'clicked', 'seen', 'hot']) {
      const value = parseBooleanFilter(cleaned, key);
      if (value !== null) {
        filters[key] = value;
        matchedBooleanFilter = true;
        break;
      }
    }
    if (matchedBooleanFilter) {
      continue;
    }

    const firstSeenAgeMatch = cleaned.match(/^firstSeen:\s*(\d+)([hd])$/i);
    if (firstSeenAgeMatch) {
      filters.firstSeenAge = {
        value: parseInt(firstSeenAgeMatch[1], 10),
        unit: firstSeenAgeMatch[2].toLowerCase()
      };
      continue;
    }

    const tagMatch = cleaned.match(/^tag:\s*(.+)$/i);
    if (tagMatch) {
      filters.tag = tagMatch[1].trim();
      continue;
    }

    if (!filters.title) {
      const titleMatch = cleaned.match(/^title:\s*(.+)$/i);
      if (titleMatch) {
        filters.title = titleMatch[1].trim();
        continue;
      }
    }

    const sortMatch = cleaned.match(/^sort:\s*(DESC|ASC|RECOMMENDED|QUALITY|ATTENTION)$/i);
    if (sortMatch) {
      sort = sortMatch[1].toUpperCase();
      continue;
    }

    const qualityMatch = cleaned.match(/^quality:(.+)$/i);
    if (qualityMatch) {
      filters.quality = parseNumberOperatorFilter(qualityMatch[1]);
      continue;
    }

    const limitMatch = cleaned.match(/^limit:\s*(\d+)$/i);
    if (limitMatch) {
      limit = parseInt(limitMatch[1], 10);
      continue;
    }

    const parsedDate = parseDateToken(cleaned);
    if (parsedDate) {
      filters.date = parsedDate;
      continue;
    }

    remainingTokens.push(cleaned);
  }

  if (textMode !== 'exact' && remainingTokens.length > 0) {
    text = remainingTokens.join(' ');
    textMode = 'terms';
  }

  return {
    text,
    textMode,
    filters,
    sort,
    limit
  };
};
