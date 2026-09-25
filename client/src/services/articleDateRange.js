import { withArticleAgeCutoff } from './articleAgeCutoff.js';

export const articleDateRangeOptions = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  {
    value: 'day-before-yesterday',
    get label() {
      const date = new Date();
      date.setDate(date.getDate() - 2);
      return date.toLocaleDateString('en-GB', { weekday: 'long' });
    }
  },
  { value: 'this-month', label: 'This month' },
  { value: 'custom', label: 'Custom date...' }
];

const localDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};

// Calendar boundaries use local dates; adding a calendar day respects DST transitions.
export const resolveArticleDateRange = (value, custom = {}, now = Date.now()) => {
  if (value === 'all') return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now + 1); // Exclusive upper bound includes the request instant.
  if (value === 'custom') {
    const customStart = localDate(custom.start);
    const customEnd = localDate(custom.end);
    if (!customStart || !customEnd || customStart > customEnd) return null;
    customEnd.setDate(customEnd.getDate() + 1);
    return { start: customStart, end: customEnd };
  }
  if (value === 'yesterday' || value === 'day-before-yesterday') {
    start.setDate(start.getDate() - (value === 'yesterday' ? 1 : 2));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 1);
  } else if (value === 'this-month') {
    start.setDate(1);
  } else if (value !== 'today') return null;
  return { start, end };
};

export const withArticleDateFilters = (selection, state, now = Date.now()) => {
  const query = withArticleAgeCutoff(selection, state.ageCutoff, now);
  const range = selection.status === 'unread'
    ? resolveArticleDateRange(state.dateRange, state.customDateRange, now)
    : null;
  if (!range) return query;
  query.publishedAfter = new Date(Math.max(range.start.getTime(), query.publishedAfter ? Date.parse(query.publishedAfter) : -Infinity)).toISOString();
  query.publishedBefore = new Date(Math.min(range.end.getTime(), query.publishedBefore ? Date.parse(query.publishedBefore) : Infinity)).toISOString();
  return query;
};
