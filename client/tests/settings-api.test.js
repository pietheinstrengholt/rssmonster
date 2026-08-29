import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  saveIncludeDevelopingEvents,
  saveMarkAsReadOnScroll,
  savePrioritizeHighTrust,
  saveStartupViewMode,
  recalculateIslands
} from '../src/api/settings.js';

const { patch, post } = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }));

vi.mock('../src/api/client', () => ({
  default: { patch, post }
}));

describe('settings API', () => {
  beforeEach(() => {
    patch.mockReset();
    post.mockReset();
  });

  it('sends only the developing-events boolean to its dedicated endpoint', () => {
    saveIncludeDevelopingEvents(true);

    expect(patch).toHaveBeenCalledWith('/setting/developing-events', {
      includeDevelopingEvents: true
    });
  });

  it('sends the startup view mode to its dedicated endpoint', () => {
    saveStartupViewMode('default');

    expect(patch).toHaveBeenCalledWith('/setting/startup-view', {
      startupViewMode: 'default'
    });
  });

  it('sends the mark-as-read scrolling preference to its dedicated endpoint', () => {
    saveMarkAsReadOnScroll(false);

    expect(patch).toHaveBeenCalledWith('/setting/mark-as-read-on-scroll', {
      markAsReadOnScroll: false
    });
  });

  it('sends the generic high-trust preference to its dedicated endpoint', () => {
    savePrioritizeHighTrust(true);

    expect(patch).toHaveBeenCalledWith('/setting/prioritize-high-trust', {
      prioritizeHighTrust: true
    });
  });

  it('starts island recalculation with an extended request timeout', () => {
    recalculateIslands();

    expect(post).toHaveBeenCalledWith('/setting/islands/recalculate', null, {
      timeout: 120000
    });
  });
});
