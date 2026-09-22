// This function formats elapsed time for article publication dates.
export function timeDifference(current, previous) {
  const msPerMinute = 60 * 1000;
  const msPerHour = msPerMinute * 60;
  const msPerDay = msPerHour * 24;
  const msPerMonth = msPerDay * 30;
  const msPerYear = msPerDay * 365;
  const elapsed = Math.abs(current - previous);
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

  if (elapsed < msPerMinute) return plural(Math.round(elapsed / 1000), 'second');
  if (elapsed < msPerHour) return plural(Math.round(elapsed / msPerMinute), 'minute');
  if (elapsed < msPerDay) return plural(Math.round(elapsed / msPerHour), 'hour');
  if (elapsed < msPerMonth) return plural(Math.round(elapsed / msPerDay), 'day');
  if (elapsed < msPerYear) return plural(Math.round(elapsed / msPerMonth), 'month');
  return plural(Math.round(elapsed / msPerYear), 'year');
}

// This function formats a date value as capitalized elapsed time.
export function formatRelativeDate(value) {
  if (!value) return '';
  const publishedAt = new Date(value).getTime();
  if (Number.isNaN(publishedAt)) return '';
  const result = timeDifference(Date.now(), publishedAt);
  return result.charAt(0).toUpperCase() + result.slice(1);
}

// Uses local calendar days so the relative pill and long date always describe the same publication day.
export function articleDateContext(value, now = new Date()) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const dayKey = day => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isoDate = dayKey(date);
  const label = isoDate === dayKey(now) ? 'Today'
    : isoDate === dayKey(yesterday) ? 'Yesterday'
      : date.toLocaleDateString('en-GB', { weekday: 'long' });
  return {
    isoDate,
    label,
    longLabel: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  };
}
