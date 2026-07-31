import { describe, expect, it } from 'vitest';
import {
  isValidUtcCalendarDate,
  resolveDateFilterToRange
} from '../../services/articleSearch/articleDateParser.service.js';

describe('articleDateParser.service calendar validation', () => {
  it.each(['2024-02-29', '2026-01-31', '2026-12-31'])(
    'accepts real UTC calendar date %s',
    value => {
      expect(isValidUtcCalendarDate(value)).toBe(true);
      expect(resolveDateFilterToRange({ type: 'date', value })).toEqual({
        dateToken: value,
        dateRange: {
          start: new Date(`${value}T00:00:00.000Z`),
          end: new Date(`${value}T23:59:59.999Z`)
        }
      });
    }
  );

  it.each(['2025-02-29', '2026-02-31', '2026-00-10', '2026-13-01', '2026-99-99'])(
    'rejects invalid UTC calendar date %s',
    value => {
      expect(isValidUtcCalendarDate(value)).toBe(false);
      expect(resolveDateFilterToRange({ type: 'date', value })).toBeNull();
    }
  );

  // Covers absent and malformed filter input without broadening the search window.
  it.each([null, {}, { type: 'date', value: 'not-a-date' }])(
    'returns no range for unsupported filter %j',
    dateFilter => {
      expect(resolveDateFilterToRange(dateFilter)).toBeNull();
    }
  );

  // Resolves rolling windows relative to the supplied clock for deterministic searches.
  it.each([
    ['today', '2026-07-30T12:00:00.000Z'],
    ['lastweek', '2026-07-24T12:00:00.000Z']
  ])('resolves @%s as a rolling window', (type, expectedStart) => {
    const now = new Date('2026-07-31T12:00:00.000Z');

    expect(resolveDateFilterToRange({ type }, now)).toEqual({
      dateToken: type,
      dateRange: {
        start: new Date(expectedStart),
        end: now
      }
    });
  });

  // Resolves yesterday as the complete preceding UTC calendar day.
  it('resolves yesterday across a month boundary', () => {
    expect(resolveDateFilterToRange(
      { type: 'yesterday' },
      new Date('2026-08-01T03:00:00.000Z')
    )).toEqual({
      dateToken: 'yesterday',
      dateRange: {
        start: new Date('2026-07-31T00:00:00.000Z'),
        end: new Date('2026-07-31T23:59:59.999Z')
      }
    });
  });

  // Resolves numeric day offsets as complete UTC calendar days.
  it('resolves a days-ago filter', () => {
    expect(resolveDateFilterToRange(
      { type: 'daysAgo', value: 2 },
      new Date('2026-07-31T12:00:00.000Z')
    )).toEqual({
      dateToken: '2 days ago',
      dateRange: {
        start: new Date('2026-07-29T00:00:00.000Z'),
        end: new Date('2026-07-29T23:59:59.999Z')
      }
    });
  });

  // Resolves named weekdays strictly before the current UTC day.
  it.each([
    ['friday', '2026-07-24'],
    ['sunday', '2026-07-26']
  ])('resolves last %s to the previous occurrence', (day, expectedDate) => {
    const result = resolveDateFilterToRange(
      { type: 'lastDay', value: day.toUpperCase() },
      new Date('2026-07-31T12:00:00.000Z')
    );

    expect(result).toEqual({
      dateToken: `last ${day}`,
      dateRange: {
        start: new Date(`${expectedDate}T00:00:00.000Z`),
        end: new Date(`${expectedDate}T23:59:59.999Z`)
      }
    });
  });

  // Rejects unsupported named-day values and non-integer offsets.
  it.each([
    { type: 'lastDay', value: 'funday' },
    { type: 'daysAgo', value: 1.5 }
  ])('rejects invalid relative date filter %j', dateFilter => {
    expect(resolveDateFilterToRange(dateFilter)).toBeNull();
  });
});
