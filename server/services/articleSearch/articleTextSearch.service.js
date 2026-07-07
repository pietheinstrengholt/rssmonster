// Builds Sequelize text-search predicates for article title and original content fields.
// It centralizes how quoted phrases, title filters, and free-text terms combine with AND/OR logic.
import { Op } from 'sequelize';
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

// Builds the text portion of an article search WHERE clause.
export const buildTextSearchWhereClause = ({ titleFilter, quotedPhrase, remainingTokens }) => {
  const textWhereClause = {};

  if (titleFilter) {
    appendAndCondition(textWhereClause, ciLike('title', titleFilter));

    if (quotedPhrase) {
      appendAndCondition(textWhereClause, ciLike('contentOriginal', quotedPhrase));
    } else if (remainingTokens.length > 0) {
      appendOrGroup(textWhereClause, remainingTokens.map(token => ciLike('contentOriginal', token)));
    }
  } else if (quotedPhrase) {
    appendOrGroup(textWhereClause, [
      ciLike('title', quotedPhrase),
      ciLike('contentOriginal', quotedPhrase)
    ]);
  } else if (remainingTokens.length > 0) {
    for (const token of remainingTokens) {
      appendOrGroup(textWhereClause, [
        ciLike('title', token),
        ciLike('contentOriginal', token)
      ]);
    }
  }

  return textWhereClause;
};
