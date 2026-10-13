import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import { createFeverApiKey, createFeverCredentialHash } from '../../utils/apiCredentials.js';
import { confirmPasswordReset } from '../../services/email/passwordReset.js';

const run = promisify(execFile);
const serverDirectory = fileURLToPath(new URL('../../', import.meta.url));
const userIds = [];
const originalPassword = 'original-password';

const createUser = async (overrides = {}) => {
  const username = `cli-reset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await db.User.create({
    username,
    password: await bcrypt.hash(originalPassword, 4),
    feverCredentialHash: createFeverCredentialHash(createFeverApiKey(username, originalPassword)),
    ...overrides
  });
  userIds.push(user.id);
  return user;
};

const reset = (args, environment = {}) => run(process.execPath, ['scripts/resetPassword.js', ...args], {
  cwd: serverDirectory,
  env: { ...process.env, ...environment }
});

afterEach(async () => {
  await db.PasswordResetToken.destroy({ where: { userId: userIds } });
  await db.User.destroy({ where: { id: userIds } });
  userIds.length = 0;
});

describe('password reset command', () => {
  it('hashes the password, rotates credentials and expires reset links for only the selected user', async () => {
    const user = await createUser({ role: 'admin' });
    const other = await createUser();
    const otherPasswordHash = other.password;
    const previousHash = user.feverCredentialHash;
    const rawToken = 'A'.repeat(43);
    const token = await db.PasswordResetToken.create({
      userId: user.id,
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000)
    });
    const password = 'replacement-password';

    const { stdout, stderr } = await reset([user.username, password]);

    expect(stdout).toContain('Password updated.');
    expect(stderr).toBe('');
    expect(stdout).not.toContain(password);
    await user.reload();
    expect(user.password).not.toBe(password);
    expect(stdout).not.toContain(user.password);
    expect(await bcrypt.compare(password, user.password)).toBe(true);
    expect(await bcrypt.compare(originalPassword, user.password)).toBe(false);
    expect(user.feverCredentialHash).not.toBe(previousHash);
    expect(user.feverCredentialHash).toBe(createFeverCredentialHash(createFeverApiKey(user.username, password)));
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
    expect(user.role).toBe('admin');
    expect(user.email).toBeNull();
    expect((await token.reload()).usedAt).toBeInstanceOf(Date);
    expect((await other.reload()).password).toBe(otherPasswordHash);
    expect(other.passwordChangedAt).toBeNull();
    await expect(confirmPasswordReset({ token: rawToken, password, passwordRepeat: password }))
      .rejects.toMatchObject({ code: 'PASSWORD_RESET_INVALID' });
  });

  it.each([[], ['username'], ['username', 'new-password', 'extra']].map(args => [args]))('rejects incorrect argument counts: %j', async args => {
    await expect(reset(args)).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Usage:') });
  });

  it('does not create an unknown user', async () => {
    const username = 'missing-cli-reset-user';
    await expect(reset([username, 'replacement-password']))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('User not found.') });
    expect(await db.User.findOne({ where: { username } })).toBeNull();
  });

  it.each(['short', 'a'.repeat(129)])('rejects invalid passwords without changing credentials', async password => {
    const user = await createUser();
    const previousHash = user.password;
    await expect(reset([user.username, password]))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('between 8 and 128') });
    expect((await user.reload()).password).toBe(previousHash);
    expect(user.passwordChangedAt).toBeNull();
  });

  it('preserves provider-only accounts', async () => {
    const user = await createUser({ password: null, feverCredentialHash: null });
    await expect(reset([user.username, 'replacement-password']))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('provider sign-in') });
    expect((await user.reload()).password).toBeNull();
    expect(user.feverCredentialHash).toBeNull();
  });

  it('respects disabled local authentication', async () => {
    const user = await createUser();
    const previousHash = user.password;
    await expect(reset([user.username, 'replacement-password'], { LOCAL_AUTH_ENABLED: 'false' }))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Local authentication is disabled.') });
    expect((await user.reload()).password).toBe(previousHash);
  });

  it('reports configuration failures without leaking database details or passwords', async () => {
    const password = 'replacement-password';
    await expect(reset(['username', password], { DB_DIALECT: 'invalid' }))
      .rejects.toMatchObject({ code: 1, stderr: 'Password reset failed. Check the backend database configuration and authentication secrets.\n' });
  });
});
