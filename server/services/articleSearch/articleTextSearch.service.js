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
  // Builds the text where clause assembled while building text search where clause.
  const textWhereClause = {};

  // Handles the case where title filter is available.
  if (titleFilter) {
    appendAndCondition(textWhereClause, ciLike('title', titleFilter));

    // Handles the case where quoted phrase is available.
    if (quotedPhrase) {
      appendAndCondition(textWhereClause, ciLike('contentOriginal', quotedPhrase));
    // Handles the case where remaining tokens count exceeds value.
    } else if (remainingTokens.length > 0) {
      // Maps source values into the result produced while building text search where clause.
      appendOrGroup(textWhereClause, remainingTokens.map(token => ciLike('contentOriginal', token)));
    }
  // Handles the case where quoted phrase is available.
  } else if (quotedPhrase) {
    appendOrGroup(textWhereClause, [
      ciLike('title', quotedPhrase),
      ciLike('contentOriginal', quotedPhrase)
    ]);
  // Handles the case where remaining tokens count exceeds value.
  } else if (remainingTokens.length > 0) {
    // Processes each remaining tokens entry in turn.
    for (const token of remainingTokens) {
      appendOrGroup(textWhereClause, [
        ciLike('title', token),
        ciLike('contentOriginal', token)
      ]);
    }
  }

  return textWhereClause;
};
