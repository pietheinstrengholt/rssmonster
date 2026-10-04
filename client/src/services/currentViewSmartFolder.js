import { buildSmartFolderQuery, createEmptySmartFolderConfig, tokenizeSmartFolderQuery, stripSmartFolderQuotes } from '../components/settings/smartFolders/smartFolderQuery.js';
import { expressionPatterns, validateSmartFolderQuery } from './queryValidation.js';

// Use the editor's configuration defaults and its advanced expression vocabulary.
// Navigation IDs and rolling publication-age controls have no equivalent saved rule.
export function currentViewSmartFolder(selection, { dateRange = 'all' } = {}) {
  const config = createEmptySmartFolderConfig();
  if (Object.hasOwn(config.status, selection.status)) config.status[selection.status] = true;
  if (selection.status === 'unread') config.date.preset = { today: '@today', yesterday: '@yesterday' }[dateRange] || '';
  config.scores.quality = Number(selection.minOverallQualityScore || 0) / 100;
  config.grouping = selection.grouping === 'event' ? 'event' : 'none';
  config.sort.field = { desc: 'published-desc', asc: 'published-asc' }[selection.sort] || selection.sort || 'published-desc';
  const searchTokens = tokenizeSmartFolderQuery(selection.search).filter(token => {
    if (expressionPatterns.some(pattern => pattern.regex.test(token))) return true;
    return !token.includes(':') && !token.startsWith('@') && validateSmartFolderQuery(token).valid;
  });
  if (selection.tag) searchTokens.push(`tag:"${String(selection.tag).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`);
  const tokens = [...tokenizeSmartFolderQuery(buildSmartFolderQuery(config)), ...searchTokens];
  // Match the expression parser's last-token-wins rules without changing operators.
  const key = token => token.startsWith('@') ? 'date' : token.match(/^([a-z]+):/i)?.[1].toLowerCase();
  const effective = tokens.filter((token, index) => !key(token) || !tokens.slice(index + 1).some(later => key(later) === key(token)));
  const query = effective.join(' ');
  const limit = effective.find(token => /^limit:/i.test(token));
  const rules = smartFolderRulePreview(query);
  const context = rules.find(rule => /^(tag|title|text)$/.test(rule.key))?.label.slice(0, 60);
  const qualifier = rules.find(rule => rule.key === 'unread' || rule.key === 'read' || rule.key === 'quality' || rule.key === 'sort')?.label;
  return { name: [context, qualifier].filter(Boolean).join(' · ') || 'Smart Folder', query, limitCount: limit ? Number(limit.split(':')[1]) : config.limitCount, markAsReadOnScroll: false };
}

// Chips describe the persisted expression, including advanced operators and false values.
export function smartFolderRulePreview(query) {
  const names = { unread: 'Unread', read: 'Read', favorite: 'Favorite', star: 'Favorite', clicked: 'Clicked', hot: 'Hot', event: 'Events', developing: 'Developing events', seen: 'Seen', briefing: 'Briefing' };
  const sorts = { desc: 'Newest', asc: 'Oldest', recommended: 'Recommended', quality: 'Quality', topStories: 'Top stories' };
  return tokenizeSmartFolderQuery(query).filter(token => !/^limit:/i.test(token) && !/^grouping:none$/i.test(token)).map((token, index) => {
    const match = token.match(/^([a-z]+):(.*)$/i);
    const key = match?.[1].toLowerCase() || (token.startsWith('@') ? 'date' : 'text');
    const value = match?.[2];
    let label = stripSmartFolderQuotes(value ?? token);
    if (names[key]) label = `${value === 'false' ? 'Not ' : ''}${names[key]}`;
    else if (key === 'grouping') label = 'Group by event';
    else if (key === 'sort') label = sorts[value] || value;
    else if (key === 'quality' || key === 'freshness') {
      const score = value.match(/^(<=|>=|<|>|=)?([\d.]+)$/);
      label = score ? `${key === 'quality' ? 'Quality' : 'Freshness'} ${score[1] || '='} ${Math.round(Number(score[2]) * 100)}` : token;
    } else if (key === 'firstseen') label = `First seen within ${value}`;
    else if (key === 'date') label = { '@today': 'Today', '@yesterday': 'Yesterday', '@lastweek': 'Last week' }[token] || token;
    else if (!['tag', 'title', 'text'].includes(key)) label = `${key}: ${label}`;
    return { key, id: `${index}-${token}`, label, value };
  });
}
