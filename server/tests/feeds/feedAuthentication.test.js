import { describe, expect, it } from 'vitest';
import { normalizeFeedAuthentication } from '../../services/feeds/feedAuthentication.js';

describe('feed authentication whitespace normalization', () => {
  const basic = { authenticationType: 'basic', authenticationUsername: 'reader', authenticationPassword: 'secret' };

  it('removes trailing whitespace without removing leading or internal characters', () => {
    expect(normalizeFeedAuthentication({ ...basic, authenticationUsername: ' reader name \u00a0', authenticationPassword: ' secret word\t\n\u00a0' }))
      .toEqual({ authenticationType: 'basic', authenticationUsername: ' reader name', authenticationPassword: ' secret word' });
  });

  it.each(['authenticationUsername', 'authenticationPassword'])('rejects whitespace-only %s on creation', field => {
    expect(() => normalizeFeedAuthentication({ ...basic, [field]: ' \t\u00a0' })).toThrow();
  });

  it('keeps the saved password when an edit contains only whitespace', () => {
    const result = normalizeFeedAuthentication({ ...basic, authenticationPassword: ' \u00a0' }, basic);
    expect(result).not.toHaveProperty('authenticationPassword');
  });

  it('normalizes a replacement password before saving', () => {
    expect(normalizeFeedAuthentication({ ...basic, authenticationPassword: 'replacement \u00a0' }, basic).authenticationPassword).toBe('replacement');
  });
});
