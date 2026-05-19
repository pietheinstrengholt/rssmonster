const DATE_DAY_PATTERN = /@"?last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"?/i;
const DATE_DAYS_AGO_PATTERN = /@"?(\d+)\s+days\s+ago"?/i;

const parseBooleanFilter = (token, key) => {
  const match = token.match(new RegExp(`^${key}:\\s*(true|false)$`, 'i'));
  return match ? match[1].toLowerCase() === 'true' : null;
};

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

  tokens.forEach(token => {
    const cleaned = token.replace(/[.,;]+$/, '');

    const star = parseBooleanFilter(cleaned, 'star');
    if (star !== null) {
      filters.star = star;
      return;
    }

    const unread = parseBooleanFilter(cleaned, 'unread');
    if (unread !== null) {
      filters.unread = unread;
      return;
    }

    const read = parseBooleanFilter(cleaned, 'read');
    if (read !== null) {
      filters.read = read;
      return;
    }

    const clicked = parseBooleanFilter(cleaned, 'clicked');
    if (clicked !== null) {
      filters.clicked = clicked;
      return;
    }

    const seen = parseBooleanFilter(cleaned, 'seen');
    if (seen !== null) {
      filters.seen = seen;
      return;
    }

    const hot = parseBooleanFilter(cleaned, 'hot');
    if (hot !== null) {
      filters.hot = hot;
      return;
    }

    const firstSeenAgeMatch = cleaned.match(/^firstSeen:\s*(\d+)([hd])$/i);
    if (firstSeenAgeMatch) {
      filters.firstSeenAge = {
        value: parseInt(firstSeenAgeMatch[1], 10),
        unit: firstSeenAgeMatch[2].toLowerCase()
      };
      return;
    }

    const tagMatch = cleaned.match(/^tag:\s*(.+)$/i);
    if (tagMatch) {
      filters.tag = tagMatch[1].trim();
      return;
    }

    if (!filters.title) {
      const titleMatch = cleaned.match(/^title:\s*(.+)$/i);
      if (titleMatch) {
        filters.title = titleMatch[1].trim();
        return;
      }
    }

    const sortMatch = cleaned.match(/^sort:\s*(DESC|ASC|RECOMMENDED|QUALITY|ATTENTION)$/i);
    if (sortMatch) {
      sort = sortMatch[1].toUpperCase();
      return;
    }

    const qualityMatch = cleaned.match(/^quality:(.+)$/i);
    if (qualityMatch) {
      const parsed = parseNumberOperatorFilter(qualityMatch[1]);
      if (parsed) {
        filters.quality = parsed;
        return;
      }
    }

    const freshnessMatch = cleaned.match(/^freshness:(.+)$/i);
    if (freshnessMatch) {
      const parsed = parseNumberOperatorFilter(freshnessMatch[1]);
      if (parsed) {
        filters.freshness = parsed;
        return;
      }
    }

    const clusterMatch = cleaned.match(/^cluster:\s*(all|eventCluster)$/i);
    if (clusterMatch) {
      filters.cluster = clusterMatch[1];
      return;
    }

    const clusterCountMatch = cleaned.match(/^clustercount:\s*(\d+)$/i);
    if (clusterCountMatch) {
      filters.clusterCount = parseInt(clusterCountMatch[1], 10);
      return;
    }

    const limitMatch = cleaned.match(/^limit:\s*(\d+)$/i);
    if (limitMatch) {
      limit = parseInt(limitMatch[1], 10);
      return;
    }

    const parsedDate = parseDateToken(cleaned);
    if (parsedDate) {
      filters.date = parsedDate;
      return;
    }

    remainingTokens.push(cleaned);
  });

  if (textMode !== 'exact' && remainingTokens.length > 0) {
    text = remainingTokens.join(' ');
    textMode = 'terms';
  }

  return {
    text,
    filters,
    sort,
    limit
  };
};
