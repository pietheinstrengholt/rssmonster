import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveIncludeDevelopingEvents } from '../src/api/settings.js';

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));

vi.mock('../src/api/client', () => ({
  default: { patch }
}));

describe('settings API', () => {
  beforeEach(() => {
    patch.mockReset();
  });

  it('sends only the developing-events boolean to its dedicated endpoint', () => {
    saveIncludeDevelopingEvents(true);

    expect(patch).toHaveBeenCalledWith('/setting/developing-events', {
      includeDevelopingEvents: true
    });
  });
});
