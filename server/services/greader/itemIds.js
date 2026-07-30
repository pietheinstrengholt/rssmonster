// Defines the item id prefix enforced by this service.
const ITEM_ID_PREFIX = 'tag:google.com,2005:reader/item/';
// Defines the full item id pattern enforced by this service.
const FULL_ITEM_ID_PATTERN =
  /^tag:google\.com,2005:reader\/item\/([0-9a-fA-F]{16})$/;
// Defines the bare item id pattern enforced by this service.
const BARE_ITEM_ID_PATTERN = /^[0-9a-fA-F]{16}$/;
// Defines the decimal item id pattern enforced by this service.
const DECIMAL_ITEM_ID_PATTERN = /^\d+$/;
// Defines the max article id enforced by this service.
const MAX_ARTICLE_ID = 2_147_483_647n;

// This class identifies invalid Google Reader item IDs.
export class GreaderItemIdError extends Error {
  // Performs the constructor operation.
  constructor() {
    super('Invalid item ID');
    this.name = 'GreaderItemIdError';
  }
}

// This function converts a supported item-ID input into a validated bigint.
const validatedArticleId = value => {
  // Handles the case where value is number.
  if (typeof value === 'number') {
    // Rejects processing when value is not safe integer or value is at most value.
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new GreaderItemIdError();
    }
    value = String(value);
  }
  // Rejects processing when value is not string or value count is value.
  if (typeof value !== 'string' || value.length === 0) {
    throw new GreaderItemIdError();
  }

  // Derives the full match through exec while performing validated article id.
  const fullMatch = FULL_ITEM_ID_PATTERN.exec(value);
  // Derives the bare match through exec while performing validated article id.
  const bareMatch = BARE_ITEM_ID_PATTERN.exec(value);
  // Derives the is decimal through test while performing validated article id.
  const isDecimal = DECIMAL_ITEM_ID_PATTERN.test(value);
  // Rejects processing when full match is unavailable and bare match is unavailable and is decimal is unavailable or value count exceeds 10.
  if (!fullMatch && !bareMatch && (!isDecimal || value.length > 10)) {
    throw new GreaderItemIdError();
  }
  // Selects the numeric based on whether full match is available.
  const numeric = fullMatch
    ? BigInt(`0x${fullMatch[1]}`)
    : bareMatch
      ? BigInt(`0x${bareMatch[0]}`)
      : isDecimal
      ? BigInt(value)
      : null;
  // Rejects processing when numeric is value or numeric is at most value or numeric exceeds max article id.
  if (numeric === null || numeric <= 0n || numeric > MAX_ARTICLE_ID) {
    throw new GreaderItemIdError();
  }

  return numeric;
};

// This function serializes a database article ID as a Google Reader item ID.
export const serializeGreaderItemId = value => {
  // Derives the numeric through validated article id while performing serialize greader item id.
  const numeric = validatedArticleId(value);
  return `${ITEM_ID_PREFIX}${numeric.toString(16).padStart(16, '0')}`;
};

// This function parses a strict decimal or full Google Reader item ID.
export const parseGreaderItemId = value =>
  Number(validatedArticleId(value));

// This function parses and deduplicates IDs without changing first-occurrence order.
export const parseRequestedGreaderItemIds = values => {
  // Tracks distinct seen while parsing requested greader item id.
  const seen = new Set();
  // Collects the parsed while parsing requested greader item id.
  const parsed = [];

  // Processes each values entry in turn.
  for (const value of values) {
    // Parses the greader item id while parsing requested greader item id.
    const id = parseGreaderItemId(value);
    // Skips the current entry when seen contains id.
    if (seen.has(id)) continue;
    seen.add(id);
    parsed.push(id);
  }

  return parsed;
};

export { BARE_ITEM_ID_PATTERN, ITEM_ID_PREFIX, MAX_ARTICLE_ID };
