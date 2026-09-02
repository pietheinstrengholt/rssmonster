const ITEM_FILTER_FIELDS = Object.freeze([
  'title',
  'content',
  'url',
  'author',
  'category'
]);

// This error identifies invalid persisted or request-provided feed item filters.
export class ItemFilterValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ItemFilterValidationError';
    this.code = 'FEED_ITEM_FILTER_INVALID';
  }
}

// This function creates one stable validation error without exposing engine internals.
const invalidItemFilter = message => new ItemFilterValidationError(message);

// This function finds the first slash that is not escaped by an odd backslash count.
const findClosingSlash = expression => {
  for (let index = 1; index < expression.length; index += 1) {
    if (expression[index] !== '/') continue;

    let backslashCount = 0;
    for (let previous = index - 1; previous >= 0 && expression[previous] === '\\'; previous -= 1) {
      backslashCount += 1;
    }
    if (backslashCount % 2 === 0) return index;
  }

  return -1;
};

// This function parses and compiles one optional slash-delimited JavaScript item filter.
export const compileItemFilter = value => {
  const expression = String(value ?? '').trim();
  if (!expression) return null;

  let filter = expression;
  const negated = filter.startsWith('!');
  if (negated) filter = filter.slice(1);
  if (!filter) {
    throw invalidItemFilter('Invalid item filter: enter a regular expression after the exclamation mark.');
  }

  let field = null;
  if (!filter.startsWith('/')) {
    const separatorIndex = filter.indexOf(':');
    if (separatorIndex < 1) {
      throw invalidItemFilter(
        'Invalid item filter: use /.../ syntax, optionally preceded by a supported field.'
      );
    }

    const suppliedField = filter.slice(0, separatorIndex);
    field = suppliedField.toLowerCase();
    if (!ITEM_FILTER_FIELDS.includes(field)) {
      throw invalidItemFilter(
        `Invalid item filter: unsupported field "${suppliedField}". ` +
        'Use title, content, url, author, or category.'
      );
    }
    filter = filter.slice(separatorIndex + 1);
  }

  if (!filter.startsWith('/')) {
    throw invalidItemFilter(
      'Invalid item filter: the regular expression must start and end with a forward slash.'
    );
  }

  const closingSlash = findClosingSlash(filter);
  if (closingSlash < 0) {
    throw invalidItemFilter(
      'Invalid item filter: the regular expression must end with a forward slash.'
    );
  }

  const pattern = filter.slice(1, closingSlash);
  const flags = filter.slice(closingSlash + 1);
  let regex;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    throw invalidItemFilter(
      'Invalid item filter: the regular expression or its flags could not be parsed.'
    );
  }

  return Object.freeze({ expression, negated, field, regex });
};

// This function tests one regular expression without leaking state from global or sticky flags.
const matchesValue = (regex, value) => {
  if (value === null || value === undefined || String(value) === '') return false;
  regex.lastIndex = 0;
  return regex.test(String(value));
};

// This function selects the normalized item values addressed by one compiled filter.
const filterValues = (item, field) => {
  if (!field) return [item?.title, item?.content];
  if (field === 'category') {
    return Array.isArray(item?.categories) ? item.categories : [item?.categories];
  }
  return [item?.[field]];
};

// This function reports whether one normalized feed item is accepted by a compiled filter.
export const matchesItemFilter = (item, compiledFilter) => {
  if (!compiledFilter) return true;

  const matched = filterValues(item, compiledFilter.field)
    .some(value => matchesValue(compiledFilter.regex, value));
  return compiledFilter.negated ? !matched : matched;
};

export default {
  compileItemFilter,
  matchesItemFilter
};
