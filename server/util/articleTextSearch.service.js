import { Op } from 'sequelize';
import { ciLike } from './sequelize.utils.js';

const appendAndCondition = (whereClause, condition) => {
  whereClause[Op.and] ??= [];
  whereClause[Op.and].push(condition);
};

const appendOrGroup = (whereClause, conditions) => {
  appendAndCondition(whereClause, { [Op.or]: conditions });
};

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