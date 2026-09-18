import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret, decryptSecret, isEncryptedSecret, SecretEncryptionError } from '../../services/secretEncryption.js';

beforeEach(() => vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64')));
afterEach(() => vi.unstubAllEnvs());

describe('server setting encryption', () => {
  it.each(['a secret', ' whitespace\n密碼 ', ''])('roundtrips plaintext %j', value => {
    const stored = encryptSecret(value);
    expect(isEncryptedSecret(stored)).toBe(true);
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(decryptSecret(stored)).toBe(value);
  });
  it('uses a fresh 12-byte IV for every encryption', () => {
    const first = encryptSecret('same value');
    const second = encryptSecret('same value');
    expect(first).not.toBe(second);
    expect(first.split(':')[2]).not.toBe(second.split(':')[2]);
    expect(Buffer.from(first.split(':')[2], 'base64')).toHaveLength(12);
  });
  it.each([undefined, '', 'not-base64', Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64'), `${Buffer.alloc(32).toString('base64')}\n`])('rejects missing or invalid keys on encryption and decryption', key => {
    const stored = encryptSecret('private');
    vi.stubEnv('ENCRYPTION_KEY', key);
    vi.stubEnv('JWT_SECRET', 'must-not-be-used');
    expect(() => encryptSecret('private')).toThrow(/ENCRYPTION_KEY/);
    expect(() => decryptSecret(stored)).toThrow(/ENCRYPTION_KEY/);
  });
  it.each([2, 3, 4])('rejects tampering with envelope segment %s', index => {
    const parts = encryptSecret('private').split(':');
    const bytes = Buffer.from(parts[index], 'base64');
    bytes[0] ^= 1;
    parts[index] = bytes.toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow(SecretEncryptionError);
  });
  it.each(['enc:v2:a:b:c', 'enc:v1:', 'enc:v1:!:!:!', 'enc:v1:YQ==:Yg==:Yw=='])('rejects malformed or unknown envelopes', value => {
    expect(() => decryptSecret(value)).toThrow(/could not be decrypted/);
  });
  it('rejects an incorrect key without disclosing values', () => {
    const stored = encryptSecret('private');
    vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 8).toString('base64'));
    expect(() => decryptSecret(stored)).toThrow('Stored setting could not be decrypted; check ENCRYPTION_KEY or replace the saved value');
  });
  it('reads legacy plaintext without requiring a key', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(isEncryptedSecret('legacy')).toBe(false);
    expect(decryptSecret('legacy')).toBe('legacy');
  });
});
