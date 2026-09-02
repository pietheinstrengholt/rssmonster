const ITEM_FILTER_FIELDS = Object.freeze([
  'title',
  'content',
  'url',
  'author',
  'category'
]);

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

// This function validates one optional feed item filter using slash-delimited JavaScript syntax.
export const validateItemFilter = value => {
  const expression = String(value ?? '').trim();
  if (!expression) return { valid: true, error: '' };

  let filter = expression;
  if (filter.startsWith('!')) filter = filter.slice(1);

  if (!filter) {
    return {
      valid: false,
      error: 'Enter a regular expression after the exclamation mark.'
    };
  }

  if (!filter.startsWith('/')) {
    const separatorIndex = filter.indexOf(':');
    if (separatorIndex < 1) {
      return {
        valid: false,
        error: 'Use /.../ syntax, optionally preceded by a supported field.'
      };
    }

    const field = filter.slice(0, separatorIndex).toLowerCase();
    if (!ITEM_FILTER_FIELDS.includes(field)) {
      return {
        valid: false,
        error: `Unsupported field "${filter.slice(0, separatorIndex)}". Use title, content, url, author, or category.`
      };
    }
    filter = filter.slice(separatorIndex + 1);
  }

  if (!filter.startsWith('/')) {
    return {
      valid: false,
      error: 'The regular expression must start and end with a forward slash.'
    };
  }

  const closingSlash = findClosingSlash(filter);
  if (closingSlash < 0) {
    return {
      valid: false,
      error: 'The regular expression must end with a forward slash.'
    };
  }

  const pattern = filter.slice(1, closingSlash);
  const flags = filter.slice(closingSlash + 1);
  try {
    new RegExp(pattern, flags);
  } catch {
    return {
      valid: false,
      error: 'Invalid item filter: the regular expression or its flags could not be parsed.'
    };
  }

  return { valid: true, error: '' };
};

export default validateItemFilter;
