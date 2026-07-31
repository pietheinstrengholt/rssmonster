import { describe, expect, it } from 'vitest';
import helper from '../src/services/helper.js';

describe('helper service', () => {
  it('removes every loosely matching array value without mutating the input', () => {
    const values = [1, '1', 2, 1];

    expect(helper.arrayRemove(values, 1)).toEqual([2]);
    expect(values).toEqual([1, '1', 2, 1]);
  });

  it('finds an object by a loosely matching id', () => {
    const values = [{ id: 1, name: 'First' }, { id: 2, name: 'Second' }];

    expect(helper.findArrayById(values, '2')).toEqual({ id: 2, name: 'Second' });
    expect(helper.findArrayById(values, 3)).toBeUndefined();
  });

  it('finds an object index by a loosely matching id', () => {
    const values = [{ id: 1 }, { id: 2 }];

    expect(helper.findIndexById(values, '1')).toBe(0);
    expect(helper.findIndexById(values, 3)).toBe(-1);
  });
});
