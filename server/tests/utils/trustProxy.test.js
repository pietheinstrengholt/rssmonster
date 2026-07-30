import { describe, expect, it } from 'vitest';
import { getTrustProxySetting } from '../../utils/trustProxy.js';

describe('trust proxy configuration', () => {
  it('trusts only loopback proxies by default', () => {
    expect(getTrustProxySetting(undefined)).toBe('loopback');
    expect(getTrustProxySetting('')).toBe('loopback');
  });

  it('supports explicit proxy hop counts and addresses', () => {
    expect(getTrustProxySetting('1')).toBe(1);
    expect(getTrustProxySetting(' loopback, 10.0.0.0/8 ')).toBe(
      'loopback, 10.0.0.0/8'
    );
  });

  it('supports direct deployments without a trusted proxy', () => {
    expect(getTrustProxySetting('false')).toBe(false);
  });

  it('rejects the spoofable permissive setting', () => {
    expect(() => getTrustProxySetting('true')).toThrow(
      'TRUST_PROXY=true is unsafe'
    );
  });
});
