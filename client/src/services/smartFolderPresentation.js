import { normalizeSortValueForApi } from './queryValidation.js';

// Keeps quoted values intact when reading presentation tokens from a saved expression.
export const tokenizeSmartFolderExpression = query => (
  String(query || '').match(/(?:[A-Za-z]+:)?"[^"]*"|[^\s,]+/g) || []
);

// Resolves the same last-token-wins presentation used by article search.
export function smartFolderPresentation(query) {
  const presentation = { sort: 'desc', grouping: 'none', includeDevelopingEvents: false };
  for (const token of tokenizeSmartFolderExpression(query)) {
    const cleaned = token.replace(/[.,;]+$/, '');
    const sort = cleaned.match(/^sort:(desc|asc|topStories|recommended|quality)$/i);
    const grouping = cleaned.match(/^grouping:(none|event)$/i);
    const developing = cleaned.match(/^developing:(true|false)$/i);
    if (sort) presentation.sort = normalizeSortValueForApi(sort[1].toLowerCase());
    if (grouping) presentation.grouping = grouping[1].toLowerCase();
    if (developing) presentation.includeDevelopingEvents = developing[1].toLowerCase() === 'true';
  }
  if (presentation.includeDevelopingEvents) presentation.grouping = 'event';
  return presentation;
}

// Makes legacy folders explicit without rebuilding or discarding their search expression.
export function completeSmartFolderQuery(query, limitCount) {
  const tokens = tokenizeSmartFolderExpression(query).map(token => token.replace(/[.,;]+$/, ''));
  const presentation = smartFolderPresentation(query);
  const parts = [String(query || '').trim()];
  if (!tokens.some(token => /^sort:(desc|asc|topStories|recommended|quality)$/i.test(token))) {
    parts.push(`sort:${presentation.sort}`);
  }
  const groupingTokens = tokens.filter(token => /^grouping:(none|event)$/i.test(token));
  if (groupingTokens.at(-1)?.toLowerCase() !== `grouping:${presentation.grouping}`) {
    parts.push(`grouping:${presentation.grouping}`);
  }
  if (limitCount && !tokens.some(token => /^limit:\d+$/i.test(token))) parts.push(`limit:${limitCount}`);
  return parts.filter(Boolean).join(' ');
}

// Carries search edits out of a folder without retaining its unchanged presentation overrides.
export function detachSmartFolderQuery(query, previousQuery) {
  const previous = smartFolderPresentation(previousQuery);
  const edited = smartFolderPresentation(query);
  const presentation = {};
  const tokens = tokenizeSmartFolderExpression(query).filter(token => {
    const match = token.replace(/[.,;]+$/, '').match(/^(sort|grouping):/i);
    if (!match) return true;
    const key = match[1].toLowerCase();
    if (edited[key] === previous[key]) return false;
    presentation[key] = edited[key];
    return true;
  });
  return { search: tokens.join(' ') || null, ...presentation };
}
