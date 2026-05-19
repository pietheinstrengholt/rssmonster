import { Op } from 'sequelize';
import { ciLike } from './articleSearch.service.js';

export const buildTextSearchWhereClause = ({ titleFilter, quotedPhrase, remainingTokens }) => {
  const baseWhere = {};

  if (titleFilter) {
    const titleCond = ciLike('title', titleFilter);
    baseWhere[Op.and] = [...(baseWhere[Op.and] || []), titleCond];

    if (quotedPhrase) {
      const contentCond = ciLike('contentOriginal', quotedPhrase);
      baseWhere[Op.and] = [...(baseWhere[Op.and] || []), contentCond];
    } else if (remainingTokens.length > 0) {
      baseWhere[Op.or] = remainingTokens.map(token => ciLike('contentOriginal', token));
    }
  } else if (quotedPhrase) {
    baseWhere[Op.or] = [
      ciLike('title', quotedPhrase),
      ciLike('contentOriginal', quotedPhrase)
    ];
  } else if (remainingTokens.length > 0) {
    const wordConditions = remainingTokens.map(token => ({
      [Op.or]: [
        ciLike('title', token),
        ciLike('contentOriginal', token)
      ]
    }));
    baseWhere[Op.and] = wordConditions;
  }

  return baseWhere;
};