export const articleAgeCutoffOptions = [
  { value: '24h', label: '24h', hours: 24 },
  { value: '3d', label: '3d', hours: 72 },
  { value: '7d', label: '7d', hours: 168 },
  { value: 'all', label: 'All', hours: 0 }
];

// Resolve once per collection so cursor pages keep the same date boundary.
export const withArticleAgeCutoff = (selection, ageCutoff, now = Date.now()) => {
  const query = { ...selection };
  delete query.publishedAfter;
  const hours = articleAgeCutoffOptions.find(option => option.value === ageCutoff)?.hours;
  return selection.status === 'unread' && hours
    ? { ...query, publishedAfter: new Date(now - hours * 3600000).toISOString() }
    : query;
};
