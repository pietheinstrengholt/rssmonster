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
});
