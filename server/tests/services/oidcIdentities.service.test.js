import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { resolveOidcIdentity, hashOidcValue } from '../../services/auth/identities.js';

const { User, OidcIdentity } = db;
const userIds = [];
const claims = () => ({ iss: 'https://issuer.example.com', sub: randomBytes(16).toString('hex') });
const provision = async (identity, options = {}) => {
  const user = await resolveOidcIdentity(identity, { autoProvision: true, ...options });
  userIds.push(user.id);
  return user;
};
const localUser = async values => {
  const user = await User.create({
    username: `local-${randomBytes(8).toString('hex')}`, password: 'local-password-hash',
    feverCredentialHash: randomBytes(32).toString('hex'), ...values
  });
  userIds.push(user.id);
  return user;
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await User.destroy({ where: { id: userIds.splice(0) } });
});

describe('external identity resolution', () => {
  it('provisions an ordinary passwordless user without a bootstrap administrator claim', async () => {
    const count = vi.spyOn(User, 'count');
    const identity = claims();
    const email = `reader-${identity.sub}@example.com`;
    const user = await provision({ ...identity, email: ` ${email.toUpperCase()} `, email_verified: true, role: 'admin' });
    expect(count).not.toHaveBeenCalled();
    expect(user).toMatchObject({ role: 'user', bootstrapAdminClaim: null, password: null, feverCredentialHash: null, email });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.toJSON()).toMatchObject({ localPasswordEnabled: false });
    expect(user.toJSON()).not.toHaveProperty('password');
    expect(await resolveOidcIdentity(identity)).toMatchObject({ id: user.id });
  });

  it('rejects unknown identities unless provisioning is enabled', async () => {
    const create = vi.spyOn(User, 'create');
    await expect(resolveOidcIdentity(claims())).rejects.toMatchObject({ name: 'OidcLoginError' });
    expect(create).not.toHaveBeenCalled();
  });

  it('distinguishes issuer and subject case using a deterministic unique identity key', async () => {
    const original = claims();
    const first = await provision({ ...original, sub: `${original.sub}A` });
    const second = await provision({ ...original, sub: `${original.sub}a` });
    const third = await provision({ ...original, iss: 'https://another-issuer.example.com', sub: `${original.sub}A` });
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
  });

  it('ignores unverified email and adopts verified email on subsequent logins', async () => {
    const identity = claims();
    const user = await provision({ ...identity, email: 'unverified@example.com', email_verified: 'true' });
    expect(user.email).toBeNull();
    expect(user.emailVerifiedAt).toBeNull();
    expect(await resolveOidcIdentity({ ...identity, email: 'changed@example.com', email_verified: true }))
      .toMatchObject({ id: user.id, email: 'changed@example.com', emailVerifiedAt: expect.any(Date) });
  });

  it('does not merge matching emails or leave a user after an email conflict', async () => {
    const email = `existing-${randomBytes(8).toString('hex')}@example.com`;
    const existing = await localUser({ email });
    const identity = { ...claims(), email, email_verified: true };
    await expect(provision(identity)).rejects.toMatchObject({ name: 'OidcLoginError' });
    expect(await User.count({ where: { email } })).toBe(1);
    expect((await existing.reload()).password).toBe('local-password-hash');
    expect(await OidcIdentity.findByPk(hashOidcValue(JSON.stringify([identity.iss, identity.sub])))).toBeNull();
  });

  it('rolls back user creation when identity persistence fails', async () => {
    const identity = claims();
    vi.spyOn(OidcIdentity, 'create').mockRejectedValueOnce(new Error('Persistence failure'));
    await expect(provision(identity)).rejects.toThrow('Persistence failure');
    const username = `oidc-${hashOidcValue(JSON.stringify([identity.iss, identity.sub]))}`;
    expect(await User.count({ where: { username } })).toBe(0);
  });

  it('resolves concurrent first logins to one account and identity', async () => {
    const identity = claims();
    const results = await Promise.all([provision(identity), provision(identity), provision(identity)]);
    expect(new Set(results.map(user => user.id)).size).toBe(1);
    expect(await OidcIdentity.count({ where: { userId: results[0].id } })).toBe(1);
    expect(await User.count({ where: { username: results[0].username } })).toBe(1);
  });

  it('links explicitly without changing the user ID, password or administrator role', async () => {
    const existing = await localUser({ role: 'admin' });
    const identity = claims();
    expect(await resolveOidcIdentity(identity, { linkUserId: existing.id }))
      .toMatchObject({ id: existing.id, role: 'admin', password: 'local-password-hash' });
    expect(await resolveOidcIdentity(identity)).toMatchObject({ id: existing.id });
    const other = await localUser({});
    await expect(resolveOidcIdentity(identity, { linkUserId: other.id }))
      .rejects.toMatchObject({ name: 'OidcLoginError' });
  });

  it('rejects linking after a password change', async () => {
    const existing = await localUser({ passwordChangedAt: new Date() });
    await expect(resolveOidcIdentity(claims(), { linkUserId: existing.id, linkPasswordVersion: null }))
      .rejects.toMatchObject({ name: 'OidcLoginError' });
  });

  it('does not allow passwordless accounts to use the local-password linking flow', async () => {
    const identity = claims();
    const user = await provision(identity);
    await expect(resolveOidcIdentity(identity, { linkUserId: user.id }))
      .rejects.toMatchObject({ name: 'OidcLoginError' });
    await expect(resolveOidcIdentity(claims(), { linkUserId: user.id }))
      .rejects.toMatchObject({ name: 'OidcLoginError' });
  });
});


it('keeps provisioned and previously linked OIDC login available when local authentication is disabled', async () => {
  const identity = claims();
  const user = await localUser({});
  await resolveOidcIdentity(identity, { linkUserId: user.id });
  vi.stubEnv('LOCAL_AUTH_ENABLED', 'false');
  expect(await resolveOidcIdentity(identity)).toMatchObject({ id: user.id });
  const created = await provision(claims());
  expect(created.password).toBeNull();
});

describe('OIDC access restrictions', () => {
  const accessPolicy = { allowedEmailDomains: ['example.com'], allowedGroups: ['Readers'], groupsClaim: 'groups' };
  const permitted = () => ({ ...claims(), email: `reader-${randomBytes(8).toString('hex')}@EXAMPLE.COM`, email_verified: true, groups: ['Readers'] });

  it.each([
    { email_verified: false }, { email_verified: 'true' }, { email_verified: undefined },
    { email: undefined }, { email: 'bad-email' }, { email: 'user@sub.example.com' },
    { email: 'user@evilexample.com' }, { email: 'user@example.com.evil.org' },
    { groups: undefined }, { groups: 'Readers' }, { groups: ['readers'] },
    { groups: ['Readers', 42] }, { groups: { Readers: true } }
  ])('denies invalid required claims without reading or creating accounts: %j', overrides => {
    const lookup = vi.spyOn(OidcIdentity, 'findByPk');
    const create = vi.spyOn(User, 'create');
    return expect(resolveOidcIdentity({ ...permitted(), ...overrides }, { accessPolicy, autoProvision: true }))
      .rejects.toMatchObject({ name: 'OidcLoginError' }).then(() => {
        expect(lookup).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
      });
  });

  it('requires both restrictions, accepts exact claims, and never promotes provider roles', async () => {
    const identity = { ...permitted(), groups: ['Other', 'Readers'], role: 'admin' };
    const user = await provision(identity, { accessPolicy });
    expect(user.role).toBe('user');
    await expect(resolveOidcIdentity({ ...identity, groups: [] }, { accessPolicy })).rejects.toMatchObject({ name: 'OidcLoginError' });
    expect(await resolveOidcIdentity(identity, { accessPolicy })).toMatchObject({ id: user.id });
  });

  it('checks linking and later logins using fresh provider claims rather than saved email', async () => {
    const user = await localUser({ email: 'local@example.com' });
    const identity = permitted();
    await expect(resolveOidcIdentity({ ...identity, email_verified: false }, { accessPolicy, linkUserId: user.id })).rejects.toMatchObject({ name: 'OidcLoginError' });
    await resolveOidcIdentity(identity, { accessPolicy, linkUserId: user.id });
    await expect(resolveOidcIdentity({ ...identity, email: 'user@other.org' }, { accessPolicy })).rejects.toMatchObject({ name: 'OidcLoginError' });
    expect((await user.reload()).email).toBe('local@example.com');
  });

  it('supports a literal custom group claim and independent group-only restrictions', async () => {
    const identity = { ...claims(), 'custom.groups': ['Readers'] };
    const policy = { allowedGroups: ['Readers'], groupsClaim: 'custom.groups' };
    const user = await provision(identity, { accessPolicy: policy });
    expect(user.email).toBeNull();
    await expect(resolveOidcIdentity({ ...claims(), custom: { groups: ['Readers'] } }, { accessPolicy: policy })).rejects.toMatchObject({ name: 'OidcLoginError' });
  });

  it('supports email-only restrictions without a group claim', async () => {
    const identity = { ...permitted(), groups: undefined };
    const user = await provision(identity, { accessPolicy: { allowedEmailDomains: ['example.com'] } });
    expect(user.email).toMatch(/@example.com$/);
  });
});


describe('provider-managed email', () => {
  it('synchronizes verified changes, invalidates old verification links, and ignores unverified changes', async () => {
    const identity = claims();
    const user = await provision({ ...identity, email: `old-${identity.sub}@example.com`, email_verified: true });
    const token = await db.EmailVerificationToken.create({ userId: user.id, tokenHash: hashOidcValue(identity.sub), expiresAt: new Date(Date.now() + 60_000) });
    const email = `new-${identity.sub}@example.com`;
    expect(await resolveOidcIdentity({ ...identity, email, email_verified: true })).toMatchObject({ id: user.id, email, emailVerifiedAt: expect.any(Date) });
    expect((await token.reload()).usedAt).toBeInstanceOf(Date);
    expect(await resolveOidcIdentity({ ...identity, email: 'unverified@example.com', email_verified: false })).toMatchObject({ email });
  });

  it('rejects conflicts atomically and preserves linked local account email', async () => {
    const identity = claims();
    const owner = await localUser({ email: `owner-${identity.sub}@example.com` });
    const user = await provision({ ...identity, email: `old-${identity.sub}@example.com`, email_verified: true });
    const oldEmail = user.email;
    await expect(resolveOidcIdentity({ ...identity, email: owner.email, email_verified: true })).rejects.toMatchObject({ name: 'OidcLoginError' });
    expect((await user.reload()).email).toBe(oldEmail);
    const linked = claims();
    await resolveOidcIdentity(linked, { linkUserId: owner.id });
    expect(await resolveOidcIdentity({ ...linked, email: 'provider@example.com', email_verified: true })).toMatchObject({ email: owner.email });
  });
});
