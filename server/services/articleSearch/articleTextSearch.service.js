// Builds Sequelize text-search predicates for article title and visible-text content fields.
// It centralizes how quoted phrases, title filters, and free-text terms combine with AND/OR logic.
import { Op, literal } from 'sequelize';
import { ciLike } from '../../utils/sequelize.utils.js';

// Appends a condition to a Sequelize Op.and array, creating the array when needed.
const appendAndCondition = (whereClause, condition) => {
  whereClause[Op.and] ??= [];
  whereClause[Op.and].push(condition);
};

// Adds a grouped OR predicate as one AND condition.
const appendOrGroup = (whereClause, conditions) => {
  appendAndCondition(whereClause, { [Op.or]: conditions });
};

// Mirrors the default InnoDB stopword set so candidate filtering never requires an absent token.
const INNODB_DEFAULT_STOPWORDS = new Set([
  'a', 'about', 'an', 'are', 'as', 'at', 'be', 'by', 'com', 'de', 'en', 'for',
  'from', 'how', 'i', 'in', 'is', 'it', 'la', 'of', 'on', 'or', 'that', 'the',
  'this', 'to', 'und', 'was', 'what', 'when', 'where', 'who', 'will', 'with', 'www'
]);

// Keeps only tokens that MySQL's Boolean full-text parser can consume predictably.
const fullTextTokens = value => String(value || '').match(/[\p{L}\p{N}_]+/gu) || [];

// Selects terms reliably present in a default InnoDB FULLTEXT index.
const indexedFullTextTokens = value => fullTextTokens(value).filter(token => (
  [...token].length >= 3 && !INNODB_DEFAULT_STOPWORDS.has(token.toLowerCase())
));

// Builds the predicate backed by the combined MySQL FULLTEXT(title, contentText) index.
const mysqlFullText = ({ value, escapeValue }) => {
  const tokens = indexedFullTextTokens(value);
  if (tokens.length === 0) return null;
  const query = tokens.map(token => `+${token}*`).join(' ');

  return literal(
    `MATCH(\`title\`, \`contentText\`) AGAINST (${escapeValue(query)} IN BOOLEAN MODE)`
  );
};

// Adapts a plain keyword/phrase input to the shared normalized-text search contract.
export const buildArticleKeywordWhereClause = ({
  search,
  dialect = 'sqlite',
  escapeValue
}) => {
  const normalized = String(search || '').trim();
  const quotedMatch = normalized.match(/^"([\s\S]+)"$/);
  const quotedPhrase = quotedMatch?.[1]?.trim() || null;
  const remainingTokens = quotedPhrase
    ? []
    : normalized.split(/\s+/).filter(Boolean);

  return buildTextSearchWhereClause({
    titleFilter: null,
    quotedPhrase,
    remainingTokens,
    dialect,
    ...(escapeValue ? { escapeValue } : {})
  });
};

// Builds the text portion of an article search WHERE clause.
export const buildTextSearchWhereClause = ({
  titleFilter,
  quotedPhrase,
  remainingTokens,
  dialect = 'sqlite',
  escapeValue = value => `'${String(value).replaceAll("'", "''")}'`
}) => {
  // Builds the text where clause assembled while building text search where clause.
  const textWhereClause = {};
  const useFullText = dialect === 'mysql';

  // Handles the case where title filter is available.
  if (titleFilter) {
    appendAndCondition(textWhereClause, ciLike('title', titleFilter));

    // Handles the case where quoted phrase is available.
    if (quotedPhrase) {
      const candidatePredicate = useFullText
        ? mysqlFullText({ value: quotedPhrase, escapeValue })
        : null;
      if (candidatePredicate) appendAndCondition(textWhereClause, candidatePredicate);
      appendAndCondition(textWhereClause, ciLike('contentText', quotedPhrase));
    // Handles the case where remaining tokens count exceeds value.
    } else if (remainingTokens.length > 0) {
      // Title-filter body terms retain their existing OR semantics.
      appendOrGroup(textWhereClause, remainingTokens.map(token => ciLike('contentText', token)));
    }
  // Handles the case where quoted phrase is available.
  } else if (quotedPhrase) {
    const candidatePredicate = useFullText
      ? mysqlFullText({ value: quotedPhrase, escapeValue })
      : null;
    if (candidatePredicate) appendAndCondition(textWhereClause, candidatePredicate);
    appendOrGroup(textWhereClause, [
      ciLike('title', quotedPhrase),
      ciLike('contentText', quotedPhrase)
    ]);
  // Handles the case where remaining tokens count exceeds value.
  } else if (remainingTokens.length > 0) {
    const candidatePredicate = useFullText
      ? mysqlFullText({ value: remainingTokens.join(' '), escapeValue })
      : null;
    if (candidatePredicate) appendAndCondition(textWhereClause, candidatePredicate);

    // Deterministic predicates preserve the public requirement that every term must occur.
    for (const token of remainingTokens) {
      appendOrGroup(textWhereClause, [
        ciLike('title', token),
        ciLike('contentText', token)
      ]);
    }
  }

  return textWhereClause;
};
