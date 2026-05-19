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

export const resolveDateFilterToRange = dateFilter => {
  if (!dateFilter || !dateFilter.type) {
    return null;
  }

  if (dateFilter.type === 'today') {
    const now = new Date();
    return {
      dateToken: 'today',
      dateRange: {
        start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        end: now
      }
    };
  }

  if (dateFilter.type === 'yesterday') {
    const today = new Date();
    return {
      dateToken: 'yesterday',
      dateRange: buildUtcDayRange(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1)
    };
  }

  if (dateFilter.type === 'lastweek') {
    const now = new Date();
    return {
      dateToken: 'lastweek',
      dateRange: {
        start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: now
      }
    };
  }

  if (dateFilter.type === 'date' && dateFilter.value) {
    return {
      dateToken: dateFilter.value,
      dateRange: {
        start: new Date(`${dateFilter.value}T00:00:00.000Z`),
        end: new Date(`${dateFilter.value}T23:59:59.999Z`)
      }
    };
  }

  if (dateFilter.type === 'daysAgo' && Number.isInteger(dateFilter.value)) {
    const today = new Date();
    const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - dateFilter.value, 0, 0, 0, 0));
    return {
      dateToken: `${dateFilter.value} days ago`,
      dateRange: buildUtcDayRange(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
    };
  }

  if (dateFilter.type === 'lastDay' && typeof dateFilter.value === 'string') {
    const normalizedDay = dateFilter.value.toLowerCase();
    const targetDay = dayNameToUtcIndex[normalizedDay];
    if (targetDay === undefined) {
      return null;
    }

    const today = new Date();
    const currentDay = today.getUTCDay();
    let daysBack = currentDay - targetDay;
    if (daysBack <= 0) {
      daysBack += 7;
    }

    const targetDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysBack, 0, 0, 0, 0));
    return {
      dateToken: `last ${normalizedDay}`,
      dateRange: buildUtcDayRange(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())
    };
  }

  return null;
};
