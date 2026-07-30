// Converts parsed article date filters into concrete UTC date ranges.
// This keeps search query parsing separate from the time-window calculations used by article lookup.
const dayNameToUtcIndex = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

// Checks that an ISO-shaped date names the same real UTC calendar day.
export const isValidUtcCalendarDate = value => {
  // Coerces the normalized value into the representation required while checking valid utc calendar date.
  const normalizedValue = String(value);
  // Rejects the value when normalized value does not match the expected format.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return false;
  }

  // Normalizes the parsed date used while checking valid utc calendar date.
  const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === normalizedValue;
};

// Builds an inclusive UTC range for a single calendar day.
const buildUtcDayRange = (year, month, day) => ({
  start: new Date(Date.UTC(year, month, day, 0, 0, 0, 0)),
  end: new Date(Date.UTC(year, month, day, 23, 59, 59, 999))
});

// Resolves supported date filter tokens into the range object expected by Sequelize queries.
export const resolveDateFilterToRange = (dateFilter, now = new Date()) => {
  // Returns no result when date filter is unavailable or date filter type is unavailable.
  if (!dateFilter || !dateFilter.type) {
    return null;
  }

  // Normalizes the reference now used while resolving date filter to range.
  const referenceNow = new Date(now);

  // Returns early when date filter type is today.
  if (dateFilter.type === 'today') {
    return {
      dateToken: 'today',
      dateRange: {
        start: new Date(referenceNow.getTime() - 24 * 60 * 60 * 1000),
        end: referenceNow
      }
    };
  }

  // Handles the case where date filter type is yesterday.
  if (dateFilter.type === 'yesterday') {
    const today = referenceNow;
    return {
      dateToken: 'yesterday',
      dateRange: buildUtcDayRange(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1)
    };
  }

  // Returns early when date filter type is lastweek.
  if (dateFilter.type === 'lastweek') {
    return {
      dateToken: 'lastweek',
      dateRange: {
        start: new Date(referenceNow.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: referenceNow
      }
    };
  }

  // Returns early when date filter type is date and date filter value is valid utc calendar date.
  if (dateFilter.type === 'date' && isValidUtcCalendarDate(dateFilter.value)) {
    return {
      dateToken: dateFilter.value,
      dateRange: {
        start: new Date(`${dateFilter.value}T00:00:00.000Z`),
        end: new Date(`${dateFilter.value}T23:59:59.999Z`)
      }
    };
  }

  // Handles the case where date filter type is days ago and date filter value is an integer.
  if (dateFilter.type === 'daysAgo' && Number.isInteger(dateFilter.value)) {
    const today = referenceNow;
    // Normalizes the target used while resolving date filter to range.
    const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - dateFilter.value, 0, 0, 0, 0));
    return {
      dateToken: `${dateFilter.value} days ago`,
      dateRange: buildUtcDayRange(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
    };
  }

  // Handles the case where date filter type is last day and date filter is string.
  if (dateFilter.type === 'lastDay' && typeof dateFilter.value === 'string') {
    // Normalizes the day before resolving date filter to range.
    const normalizedDay = dateFilter.value.toLowerCase();
    const targetDay = dayNameToUtcIndex[normalizedDay];
    // Returns no result when target day is undefined.
    if (targetDay === undefined) {
      return null;
    }

    const today = referenceNow;
    // Derives the current day through get utcday while resolving date filter to range.
    const currentDay = today.getUTCDay();
    // Derives the days back required while resolving date filter to range.
    let daysBack = currentDay - targetDay;
    // Handles the case where days back is at most value.
    if (daysBack <= 0) {
      daysBack += 7;
    }

    // Normalizes the target date used while resolving date filter to range.
    const targetDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysBack, 0, 0, 0, 0));
    return {
      dateToken: `last ${normalizedDay}`,
      dateRange: buildUtcDayRange(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())
    };
  }

  return null;
};
