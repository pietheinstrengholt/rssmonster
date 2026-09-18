import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class SecretEncryptionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecretEncryptionError';
    this.code = 'SETTINGS_ENCRYPTION_ERROR';
  }
}

const decodeBase64 = value => {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value ? decoded : null;
};
const encryptionKey = () => {
  const key = decodeBase64(process.env.ENCRYPTION_KEY);
  if (key?.length !== 32) throw new SecretEncryptionError('ENCRYPTION_KEY must be Base64 and decode to exactly 32 bytes');
  return key;
};

// Reserve all enc: versions so unsupported or malformed envelopes cannot become plaintext.
export const isEncryptedSecret = value => typeof value === 'string' && value.startsWith('enc:');

export const encryptSecret = value => {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
};

export const decryptSecret = value => {
  // Legacy database overrides remain readable until their next transactional settings save.
  if (!isEncryptedSecret(value)) return value;
  const key = encryptionKey();
  try {
    const [prefix, version, ivText, tagText, ciphertextText, extra] = value.split(':');
    const iv = decodeBase64(ivText);
    const tag = decodeBase64(tagText);
    const ciphertext = decodeBase64(ciphertextText);
    if (prefix !== 'enc' || version !== 'v1' || extra !== undefined || iv?.length !== 12 || tag?.length !== 16 || !ciphertext) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretEncryptionError('Stored setting could not be decrypted; check ENCRYPTION_KEY or replace the saved value');
  }
};
