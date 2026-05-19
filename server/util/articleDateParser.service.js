const dayNameToUtcIndex = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const buildUtcDayRange = (year, month, day) => ({
  start: new Date(Date.UTC(year, month, day, 0, 0, 0, 0)),
  end: new Date(Date.UTC(year, month, day, 23, 59, 59, 999))
});

/**
 * Parse date expressions that may include spaces and optional quotes.
 * Supported:
 * - @"N days ago"
 * - @"last monday"
 */
export const parseQuotedDatePattern = ({ rawSearch, workingSearch, dateRange }) => {
  let nextWorkingSearch = workingSearch;
  let nextDateRange = dateRange;
  let dateToken = null;

  const daysAgoMatch = rawSearch.match(/@"?(\d+)\s+days\s+ago"?/i);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    if (!Number.isNaN(days)) {
      const today = new Date();
      const targetYear = today.getUTCFullYear();
      const targetMonth = today.getUTCMonth();
      const targetDay = today.getUTCDate() - days;

      nextDateRange = buildUtcDayRange(targetYear, targetMonth, targetDay);
      dateToken = `${days} days ago`;
      nextWorkingSearch = nextWorkingSearch.replace(daysAgoMatch[0], '').trim();
    }
  }

  const lastDayMatch = rawSearch.match(/@"?last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"?/i);
  if (lastDayMatch && !nextDateRange) {
    const dayName = lastDayMatch[1].toLowerCase();
    const targetDay = dayNameToUtcIndex[dayName];

    const today = new Date();
    const currentDay = today.getUTCDay();
    let daysBack = currentDay - targetDay;
    if (daysBack <= 0) {
      daysBack += 7;
    }

    const targetDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysBack, 0, 0, 0, 0));
    nextDateRange = buildUtcDayRange(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate());
    dateToken = `last ${dayName}`;
    nextWorkingSearch = nextWorkingSearch.replace(lastDayMatch[0], '').trim();
  }

  return { dateRange: nextDateRange, dateToken, workingSearch: nextWorkingSearch };
};

/**
 * Parse single-token date filters.
 * Supported:
 * - @today
 * - @yesterday
 * - @lastweek
 * - @YYYY-MM-DD
 */
export const parseDateToken = token => {
  const dateMatch = token.match(/^@(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch) {
    const date = dateMatch[1];
    return {
      dateToken: date,
      dateRange: {
        start: new Date(`${date}T00:00:00.000Z`),
        end: new Date(`${date}T23:59:59.999Z`)
      }
    };
  }

  const todayMatch = token.match(/^@today$/i);
  if (todayMatch) {
    const now = new Date();
    return {
      dateToken: 'today',
      dateRange: {
        start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        end: now
      }
    };
  }

  const yesterdayMatch = token.match(/^@yesterday$/i);
  if (yesterdayMatch) {
    const today = new Date();
    return {
      dateToken: 'yesterday',
      dateRange: buildUtcDayRange(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1)
    };
  }

  const lastWeekMatch = token.match(/^@lastweek$/i);
  if (lastWeekMatch) {
    const now = new Date();
    return {
      dateToken: 'lastweek',
      dateRange: {
        start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: now
      }
    };
  }

  return null;
};
