export const articleAgeCutoffOptions = [
  { value: '24h', label: '24h', hours: 24 },
  ...[1, 2, 4, 8, 12, 24, 48, 72, 120, 168, 336, 720].map(hours => ({
    value: hours < 24 ? `${hours}h` : `${hours / 24}d`,
    label: hours < 24 ? `${hours}h` : `${hours / 24}d`,
    hours
  })),
  { value: 'all', label: 'All', hours: 0 }
];

const ageCutoffRanges = [
  [6, ['1h', '2h', '4h']],
  [12, ['2h', '4h', '8h']],
  [24, ['4h', '8h', '12h']],
  [72, ['12h', '1d', '2d']],
  [168, ['1d', '3d', '5d']],
  [336, ['1d', '3d', '7d']],
  [720, ['3d', '7d', '14d']],
  [Infinity, ['7d', '14d', '30d']]
];

export const ageCutoffOptionsForOldest = (oldestPublishedAt, now = Date.now()) => {
  const oldestTime = Date.parse(oldestPublishedAt);
  const ageHours = Number.isFinite(oldestTime) ? Math.max(0, (now - oldestTime) / 3600000) : Infinity;
  const values = ageCutoffRanges.find(([maximum]) => ageHours <= maximum)[1];
  return [...values, 'all'].map(value => articleAgeCutoffOptions.find(option => option.value === value));
};

// Resolve once per collection so cursor pages keep the same date boundary.
export const withArticleAgeCutoff = (selection, ageCutoff, now = Date.now()) => {
  const query = { ...selection };
  delete query.publishedAfter;
  delete query.publishedBefore;
  const hours = articleAgeCutoffOptions.find(option => option.value === ageCutoff)?.hours;
  return selection.status === 'unread' && hours
    ? { ...query, publishedAfter: new Date(now - hours * 3600000).toISOString(), publishedBefore: new Date(now + 1).toISOString() }
    : query;
};
