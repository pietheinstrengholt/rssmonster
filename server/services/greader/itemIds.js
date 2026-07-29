const ITEM_ID_PREFIX = 'tag:google.com,2005:reader/item/';
const FULL_ITEM_ID_PATTERN =
  /^tag:google\.com,2005:reader\/item\/([0-9a-fA-F]{16})$/;
const BARE_ITEM_ID_PATTERN = /^[0-9a-fA-F]{16}$/;
const DECIMAL_ITEM_ID_PATTERN = /^\d+$/;
const MAX_ARTICLE_ID = 2_147_483_647n;

// This class identifies invalid Google Reader item IDs.
export class GreaderItemIdError extends Error {
  constructor() {
    super('Invalid item ID');
    this.name = 'GreaderItemIdError';
  }
}

// This function converts a supported item-ID input into a validated bigint.
const validatedArticleId = value => {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new GreaderItemIdError();
    }
    value = String(value);
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new GreaderItemIdError();
  }

  const fullMatch = FULL_ITEM_ID_PATTERN.exec(value);
  const bareMatch = BARE_ITEM_ID_PATTERN.exec(value);
  const isDecimal = DECIMAL_ITEM_ID_PATTERN.test(value);
  if (!fullMatch && !bareMatch && (!isDecimal || value.length > 10)) {
    throw new GreaderItemIdError();
  }
  const numeric = fullMatch
    ? BigInt(`0x${fullMatch[1]}`)
    : bareMatch
      ? BigInt(`0x${bareMatch[0]}`)
      : isDecimal
      ? BigInt(value)
      : null;
  if (numeric === null || numeric <= 0n || numeric > MAX_ARTICLE_ID) {
    throw new GreaderItemIdError();
  }

  return numeric;
};

// This function serializes a database article ID as a Google Reader item ID.
export const serializeGreaderItemId = value => {
  const numeric = validatedArticleId(value);
  return `${ITEM_ID_PREFIX}${numeric.toString(16).padStart(16, '0')}`;
};

// This function parses a strict decimal or full Google Reader item ID.
export const parseGreaderItemId = value =>
  Number(validatedArticleId(value));

// This function parses and deduplicates IDs without changing first-occurrence order.
export const parseRequestedGreaderItemIds = values => {
  const seen = new Set();
  const parsed = [];

  for (const value of values) {
    const id = parseGreaderItemId(value);
    if (seen.has(id)) continue;
    seen.add(id);
    parsed.push(id);
  }

  return parsed;
};

export { BARE_ITEM_ID_PATTERN, ITEM_ID_PREFIX, MAX_ARTICLE_ID };
