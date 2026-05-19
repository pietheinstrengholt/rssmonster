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
  const baseWhere = {};

  if (titleFilter) {
    appendAndCondition(baseWhere, ciLike('title', titleFilter));

    if (quotedPhrase) {
      appendAndCondition(baseWhere, ciLike('contentOriginal', quotedPhrase));
    } else if (remainingTokens.length > 0) {
      appendOrGroup(baseWhere, remainingTokens.map(token => ciLike('contentOriginal', token)));
    }
  } else if (quotedPhrase) {
    appendOrGroup(baseWhere, [
      ciLike('title', quotedPhrase),
      ciLike('contentOriginal', quotedPhrase)
    ]);
  } else if (remainingTokens.length > 0) {
    remainingTokens.forEach(token => {
      appendOrGroup(baseWhere, [
        ciLike('title', token),
        ciLike('contentOriginal', token)
      ]);
    });
  }

  return baseWhere;
};