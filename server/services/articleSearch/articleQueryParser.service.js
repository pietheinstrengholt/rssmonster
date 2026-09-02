// Parses article search strings into structured filters, text search terms, sort order, and limits.
// It understands RSS Monster's compact query language so the search service can build database predicates.
import { isValidUtcCalendarDate } from './articleDateParser.service.js';

// Defines the date day pattern enforced by this service.
const DATE_DAY_PATTERN = /@"?last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"?/i;
// Defines the date days ago pattern enforced by this service.
const DATE_DAYS_AGO_PATTERN = /@"?(\d+)\s+days\s+ago"?/i;
// Defines the iso date token pattern enforced by this service.
const ISO_DATE_TOKEN_PATTERN = /^@(\d{4}-\d{2}-\d{2})$/;
export const MAX_ARTICLE_SEARCH_LENGTH = 4096;
const BOOLEAN_FILTER_KEYS = [
  'favorite',
  'star',
  'unread',
  'read',
  'clicked',
  'seen',
  'hot',
  'island',
  'briefing',
  'developing'
];
const KNOWN_FILTER_KEYS = new Set([
  ...BOOLEAN_FILTER_KEYS,
  'firstseen',
  'tag',
  'title',
  'author',
  'language',
  'sort',
  'quality',
  'freshness',
  'event',
  'eventcount',
  'limit'
]);

// Identifies an invalid persisted expression without changing lenient interactive search behavior.
export class ArticleExpressionValidationError extends Error {
  constructor(code, message, token = null) {
    super(message);
    this.name = 'ArticleExpressionValidationError';
    this.code = code;
    this.token = token;
  }
}

// Rejects one token while preserving a structured error contract for API callers.
const rejectExpressionToken = (code, message, token) => {
  throw new ArticleExpressionValidationError(code, message, token);
};

// Returns the normalized field name from a structured expression token.
const expressionFieldName = token => {
  const separatorIndex = token.indexOf(':');
  return separatorIndex > 0
    ? token.slice(0, separatorIndex).toLowerCase()
    : null;
};

// Canonicalizes supported article sorts while retaining Trust as a legacy Quality alias.
export const normalizeArticleSort = sortValue => {
  const normalized = String(sortValue || 'desc').toLowerCase();
  if (normalized === 'trust') return 'quality';
  if (normalized === 'topstories') return 'topStories';
  return ['asc', 'desc', 'recommended', 'quality', 'attention'].includes(normalized)
    ? normalized
    : 'desc';
};

// Parses a boolean field token such as unread:true or hot:false.
const parseBooleanFilter = (token, key) => {
  // Derives the match through match while parsing boolean filter.
  const match = token.match(new RegExp(`^${key}:\\s*(true|false)$`, 'i'));
  // Selects the result based on whether match is available.
  return match ? match[1].toLowerCase() === 'true' : null;
};

// Parses numeric filters that may include comparison operators.
const parseNumberOperatorFilter = token => {
  const normalizedToken = token.trimStart();
  const operator = ['<=', '>='].includes(normalizedToken.slice(0, 2))
    ? normalizedToken.slice(0, 2)
    : ['<', '>', '='].includes(normalizedToken[0]) ? normalizedToken[0] : '';
  const numberToken = normalizedToken.slice(operator.length).trimStart();
  let decimalPointSeen = false;
  let digitSeen = false;

  for (const character of numberToken) {
    if (character >= '0' && character <= '9') {
      digitSeen = true;
      continue;
    }
    if (character === '.' && !decimalPointSeen) {
      decimalPointSeen = true;
      continue;
    }
    return null;
  }

  if (!digitSeen) {
    return null;
  }

  return {
    operator: operator || '>=',
    value: parseFloat(numberToken)
  };
};

// Splits the compact query language without backtracking over quoted user input.
const tokenizeSearch = search => {
  const tokens = [];
  let index = 0;

  while (index < search.length) {
    while (index < search.length && (search[index] === ',' || /\s/.test(search[index]))) index += 1;
    if (index >= search.length) break;

    const start = index;
    let quoteIndex = index;
    while (quoteIndex < search.length && /[A-Za-z]/.test(search[quoteIndex])) quoteIndex += 1;
    if (search[quoteIndex] === ':' && search[quoteIndex + 1] === '"') quoteIndex += 1;
    else quoteIndex = index;

    if (search[quoteIndex] === '"') {
      index = search.indexOf('"', quoteIndex + 1);
      index = index === -1 ? search.length : index + 1;
    } else {
      while (index < search.length && search[index] !== ',' && !/\s/.test(search[index])) index += 1;
    }
    tokens.push(search.slice(start, index));
  }

  return tokens;
};

// Returns a non-empty value following a case-insensitive field prefix.
const parseTextFilter = (token, prefix) => {
  if (!token.toLowerCase().startsWith(prefix)) return null;
  const value = token.slice(prefix.length).trimStart();
  return value || null;
};

// Removes trailing query punctuation in linear time.
const trimTrailingPunctuation = token => {
  let end = token.length;
  while (end > 0 && ['.', ',', ';'].includes(token[end - 1])) end -= 1;
  return token.slice(0, end);
};

// Parses simple date tokens such as @today, @yesterday, @lastweek, or @YYYY-MM-DD.
const parseDateToken = token => {
  // Normalizes the token before parsing date token.
  const normalizedToken = token.toLowerCase();

  // Returns early when normalized token matches the expected format.
  if (/^@today$/i.test(normalizedToken)) {
    return { type: 'today' };
  }

  // Returns early when normalized token matches the expected format.
  if (/^@yesterday$/i.test(normalizedToken)) {
    return { type: 'yesterday' };
  }

  // Returns early when normalized token matches the expected format.
  if (/^@lastweek$/i.test(normalizedToken)) {
    return { type: 'lastweek' };
  }

  // Derives the iso date match through match while parsing date token.
  const isoDateMatch = token.match(ISO_DATE_TOKEN_PATTERN);
  // Returns early when iso date match is available and iso date match 1 is valid utc calendar date.
  if (isoDateMatch && isValidUtcCalendarDate(isoDateMatch[1])) {
    return {
      type: 'date',
      value: isoDateMatch[1]
    };
  }

  return null;
};

// Extracts quoted natural-language date patterns while preserving the remaining search text.
const parseQuotedDatePattern = search => {
  // Derives the days ago match through match while parsing quoted date pattern.
  const daysAgoMatch = search.match(DATE_DAYS_AGO_PATTERN);
  // Handles the case where days ago match is available.
  if (daysAgoMatch) {
    // Parses the int while parsing quoted date pattern.
    const value = parseInt(daysAgoMatch[1], 10);
    // Returns early when value is not na n.
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

  // Derives the day match through match while parsing quoted date pattern.
  const dayMatch = search.match(DATE_DAY_PATTERN);
  // Returns early when day match is available.
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
export const parseArticleQuery = ({ search = '', defaultSort = 'desc', strict = false } = {}) => {
  // Normalizes the raw search before parsing article query.
  const rawSearch = String(search).trim();
  if (strict && rawSearch.length > MAX_ARTICLE_SEARCH_LENGTH) {
    throw new ArticleExpressionValidationError(
      'EXPRESSION_TOO_LONG',
      `Expression must not exceed ${MAX_ARTICLE_SEARCH_LENGTH} characters.`
    );
  }
  if (strict && (rawSearch.match(/"/g)?.length || 0) % 2 !== 0) {
    throw new ArticleExpressionValidationError(
      'EXPRESSION_UNTERMINATED_QUOTE',
      'Expression contains an unterminated quoted value.'
    );
  }
  // Builds the filters assembled while parsing article query.
  const filters = {};
  let workingSearch = rawSearch;
  let text = '';
  let textMode = 'none';
  // Normalizes the sort before parsing article query.
  let sort = normalizeArticleSort(defaultSort);
  let sortExplicit = false;
  let limit = null;

  // Derives the title quoted match through match while parsing article query.
  const titleQuotedMatch = workingSearch.match(/title:"([^"]+)"/i);
  // Handles the case where title quoted match is available.
  if (titleQuotedMatch) {
    filters.title = titleQuotedMatch[1].trim();
    filters.titleExact = true;
    workingSearch = workingSearch.replace(titleQuotedMatch[0], '').trim();
  }

  // Derives the author quoted match through match while parsing article query.
  const authorQuotedMatch = workingSearch.match(/author:"([^"]+)"/i);
  // Handles the case where author quoted match is available.
  if (authorQuotedMatch) {
    filters.author = authorQuotedMatch[1].trim();
    workingSearch = workingSearch.replace(authorQuotedMatch[0], '').trim();
  }

  // Parses the quoted date pattern while parsing article query.
  const quotedDate = parseQuotedDatePattern(workingSearch);
  // Handles the case where quoted date date is available.
  if (quotedDate.date) {
    filters.date = quotedDate.date;
    workingSearch = quotedDate.cleanedSearch;
  }

  // Derives the quoted text match through match while parsing article query.
  const quotedTextMatch = workingSearch.match(/"([^"]+)"/);
  // Handles the case where quoted text match is available.
  if (quotedTextMatch) {
    text = quotedTextMatch[1].trim();
    textMode = 'exact';
    workingSearch = workingSearch.replace(quotedTextMatch[0], '').trim();
  }

  // Derives the tokens required while parsing article query.
  const tokens = tokenizeSearch(workingSearch);
  // Collects the remaining tokens while parsing article query.
  const remainingTokens = [];

  // Processes each tokens entry in turn.
  for (const token of tokens) {
    // Removes punctuation following the current token.
    const cleaned = trimTrailingPunctuation(token);

    // Simplified boolean filter parsing
    let matchedBooleanFilter = false;
    // Processes each entry entry in turn.
    for (const key of BOOLEAN_FILTER_KEYS) {
      // Parses the boolean filter while parsing article query.
      const value = parseBooleanFilter(cleaned, key);
      // Handles the case where value is not value.
      if (value !== null) {
        // Selects the result based on whether key is favorite.
        filters[key === 'favorite' ? 'star' : key] = value;
        matchedBooleanFilter = true;
        break;
      }
    }
    // Skips the current entry when matched boolean filter is available.
    if (matchedBooleanFilter) {
      continue;
    }

    // Derives the first seen age match through match while parsing article query.
    const firstSeenAgeMatch = cleaned.match(/^firstSeen:\s*(\d+)([hd])$/i);
    // Handles the case where first seen age match is available.
    if (firstSeenAgeMatch) {
      const firstSeenAgeValue = parseInt(firstSeenAgeMatch[1], 10);
      if (strict && !Number.isSafeInteger(firstSeenAgeValue)) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Invalid first-seen range: "${cleaned}".`,
          cleaned
        );
      }
      filters.firstSeenAge = {
        value: firstSeenAgeValue,
        unit: firstSeenAgeMatch[2].toLowerCase()
      };
      continue;
    }

    // Derives the tag value while parsing article query.
    const tag = parseTextFilter(cleaned, 'tag:');
    // Handles the case where tag is available.
    if (tag) {
      if (strict && !tag.trim().replace(/^"|"$/g, '')) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Tag filter cannot be empty: "${cleaned}".`,
          cleaned
        );
      }
      filters.tag = tag.trim();
      continue;
    }

    // Handles the case where filters title is unavailable.
    if (!filters.title) {
      // Derives the title value while parsing article query.
      const title = parseTextFilter(cleaned, 'title:');
      // Handles the case where title is available.
      if (title) {
        const titleValue = title.trim().replace(/^"|"$/g, '');
        if (strict && !titleValue) {
          rejectExpressionToken(
            'EXPRESSION_INVALID_TOKEN',
            `Title filter cannot be empty: "${cleaned}".`,
            cleaned
          );
        }
        filters.title = titleValue;
        continue;
      }
    }

    // Derives the author value while parsing article query.
    const author = parseTextFilter(cleaned, 'author:');
    // Handles the case where author is available.
    if (author) {
      const authorValue = author.trim().replace(/^"|"$/g, '');
      if (strict && !authorValue) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Author filter cannot be empty: "${cleaned}".`,
          cleaned
        );
      }
      filters.author = authorValue;
      continue;
    }

    // Derives the language match through match while parsing article query.
    const languageMatch = cleaned.match(/^language:\s*([a-z]{2,3})$/i);
    // Handles the case where language match is available.
    if (languageMatch) {
      filters.language = languageMatch[1].toLowerCase();
      continue;
    }

    // Derives the sort match through match while parsing article query.
    const sortMatch = cleaned.match(/^sort:\s*(desc|asc|trust|topStories|recommended|quality|attention)$/i);
    // Handles the case where sort match is available.
    if (sortMatch) {
      sort = normalizeArticleSort(sortMatch[1]);
      sortExplicit = true;
      continue;
    }

    // Derives the quality match through match while parsing article query.
    const qualityMatch = cleaned.match(/^quality:(.+)$/i);
    // Handles the case where quality match is available.
    if (qualityMatch) {
      filters.quality = parseNumberOperatorFilter(qualityMatch[1]);
      if (strict && (!filters.quality || !Number.isFinite(filters.quality.value))) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Invalid numeric filter: "${cleaned}".`,
          cleaned
        );
      }
      continue;
    }

    // Derives the freshness match through match while parsing article query.
    const freshnessMatch = cleaned.match(/^freshness:(.+)$/i);
    // Handles the case where freshness match is available.
    if (freshnessMatch) {
      filters.freshness = parseNumberOperatorFilter(freshnessMatch[1]);
      if (strict && (!filters.freshness || !Number.isFinite(filters.freshness.value))) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Invalid numeric filter: "${cleaned}".`,
          cleaned
        );
      }
      continue;
    }

    // Derives the event match through match while parsing article query.
    const eventMatch = cleaned.match(/^event:\s*(true|false)$/i);
    // Handles the case where event match is available.
    if (eventMatch) {
      filters.event = eventMatch[1].toLowerCase() === 'true';
      continue;
    }

    // Derives the event count match through match while parsing article query.
    const eventCountMatch = cleaned.match(/^eventCount:\s*(?:>=\s*)?(\d+)$/i);
    // Handles the case where event count match is available.
    if (eventCountMatch) {
      const eventCount = parseInt(eventCountMatch[1], 10);
      if (strict && !Number.isSafeInteger(eventCount)) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Invalid event count: "${cleaned}".`,
          cleaned
        );
      }
      filters.eventCount = eventCount;
      continue;
    }

    // Derives the limit match through match while parsing article query.
    const limitMatch = cleaned.match(/^limit:\s*(\d+)$/i);
    // Handles the case where limit match is available.
    if (limitMatch) {
      limit = parseInt(limitMatch[1], 10);
      if (strict && (!Number.isSafeInteger(limit) || limit < 1)) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Invalid result limit: "${cleaned}".`,
          cleaned
        );
      }
      continue;
    }

    // Parses the date token while parsing article query.
    const parsedDate = parseDateToken(cleaned);
    // Handles the case where parsed date is available.
    if (parsedDate) {
      filters.date = parsedDate;
      continue;
    }

    // Handles the case where cleaned matches the expected format.
    if (ISO_DATE_TOKEN_PATTERN.test(cleaned)) {
      if (strict) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Invalid calendar date: "${cleaned}".`,
          cleaned
        );
      }
      filters.date ??= null;
      continue;
    }

    if (strict) {
      const fieldName = expressionFieldName(cleaned);
      if (fieldName) {
        if (!KNOWN_FILTER_KEYS.has(fieldName)) {
          rejectExpressionToken(
            'EXPRESSION_UNKNOWN_FILTER',
            `Unknown expression field: "${fieldName}".`,
            cleaned
          );
        }
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Invalid expression token: "${cleaned}".`,
          cleaned
        );
      }

      const equalsMatch = cleaned.match(/^([A-Za-z]+)=/);
      if (equalsMatch && KNOWN_FILTER_KEYS.has(equalsMatch[1].toLowerCase())) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Use a colon instead of equals in "${cleaned}".`,
          cleaned
        );
      }

      if (cleaned.startsWith('@')) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          `Invalid date expression: "${cleaned}".`,
          cleaned
        );
      }

      if (/^""$/.test(cleaned)) {
        rejectExpressionToken(
          'EXPRESSION_INVALID_TOKEN',
          'Quoted search text cannot be empty.',
          cleaned
        );
      }
    }

    remainingTokens.push(cleaned);
  }

  // Handles the case where text mode is not exact and remaining tokens count exceeds value.
  if (textMode !== 'exact' && remainingTokens.length > 0) {
    text = remainingTokens.join(' ');
    textMode = 'terms';
  }

  // Derives the has search intent required while parsing article query.
  const hasSearchIntent = textMode !== 'none' ||
    Object.values(filters).some(value => value !== null && value !== undefined) ||
    sortExplicit ||
    limit !== null;

  return {
    text,
    textMode,
    filters,
    sort,
    limit,
    hasSearchIntent
  };
};

// Validates a persisted expression through the same parser used to execute article searches.
export const validateArticleExpression = (
  expression,
  { allowEmpty = false, defaultSort = 'desc' } = {}
) => {
  const normalizedExpression = String(expression ?? '').trim();
  if (!normalizedExpression) {
    if (allowEmpty) {
      return parseArticleQuery({ search: '', defaultSort, strict: true });
    }
    throw new ArticleExpressionValidationError(
      'EXPRESSION_REQUIRED',
      'Expression cannot be empty.'
    );
  }

  return parseArticleQuery({
    search: normalizedExpression,
    defaultSort,
    strict: true
  });
};
