import { changeUserEmail } from '../email/emailVerification.js';
import { isLocalAuthEnabled } from '../../config/auth.js';
import { createHash } from 'node:crypto';
import db from '../../models/index.js';
import { normalizeEmailAddress } from '../../config/email.js';

const { User, OidcIdentity, sequelize } = db;
export const hashOidcValue = value => createHash('sha256').update(value).digest('hex');
export const passwordVersion = user => user.passwordChangedAt?.getTime?.().toString() || null;

export class OidcLoginError extends Error {
  constructor() {
    super('Provider sign-in could not be completed. Please start again or link your account first.');
    this.name = 'OidcLoginError';
  }
}

// Restrictions use validated ID-token claims, never locally stored profile data.
const enforceAccessPolicy = (claims, { allowedEmailDomains = [], allowedGroups = [], groupsClaim = 'groups' } = {}) => {
  if (allowedEmailDomains.length) {
    if (claims?.email_verified !== true || typeof claims.email !== 'string') throw new OidcLoginError();
    let email;
    try {
      email = normalizeEmailAddress(claims.email);
    } catch {
      throw new OidcLoginError();
    }
    if (!allowedEmailDomains.includes(email.split('@')[1])) throw new OidcLoginError();
  }
  if (allowedGroups.length) {
    const groups = claims && Object.hasOwn(claims, groupsClaim) ? claims[groupsClaim] : null;
    if (!Array.isArray(groups) || !groups.every(group => typeof group === 'string') ||
      !groups.some(group => allowedGroups.includes(group))) throw new OidcLoginError();
  }
};

// Call only after validating the configured provider's ID token.
export const resolveOidcIdentity = async (claims, {
  accessPolicy = {}, autoProvision = false, linkUserId = null, linkPasswordVersion = null, now = new Date()
} = {}) => {
  if (linkUserId && !isLocalAuthEnabled()) throw new OidcLoginError();
  if (typeof claims?.iss !== 'string' || !claims.iss || typeof claims.sub !== 'string' || !claims.sub) throw new OidcLoginError();
  enforceAccessPolicy(claims, accessPolicy);
  const identityHash = hashOidcValue(JSON.stringify([claims.iss, claims.sub]));
  const resolveExisting = async identity => {
    if (!identity || identity.issuer !== claims.iss || identity.subject !== claims.sub) throw new OidcLoginError();
    const user = await User.findByPk(identity.userId);
    if (!user || (linkUserId && (!user.password || user.id !== linkUserId || passwordVersion(user) !== linkPasswordVersion))) throw new OidcLoginError();
    if (!user.password && claims.email_verified === true && typeof claims.email === 'string') {
      try {
        return await sequelize.transaction(async transaction => {
          const current = await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
          if (!current) throw new OidcLoginError();
          if (!current.password) {
            await changeUserEmail(current.id, claims.email, { providerVerified: true, now, transaction });
            await current.reload({ transaction });
          }
          return current;
        });
      } catch {
        throw new OidcLoginError();
      }
    }
    return user;
  };
  const existing = await OidcIdentity.findByPk(identityHash);
  if (existing) return resolveExisting(existing);
  if (!linkUserId && !autoProvision) throw new OidcLoginError();

  try {
    return await sequelize.transaction(async transaction => {
      let user;
      if (linkUserId) {
        user = await User.findByPk(linkUserId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user || !user.password || passwordVersion(user) !== linkPasswordVersion) throw new OidcLoginError();
      } else {
        // Unverified provider email must neither reserve an address nor enable recovery.
        const email = claims.email_verified === true && typeof claims.email === 'string'
          ? normalizeEmailAddress(claims.email) : null;
        user = await User.create({
          username: `oidc-${identityHash}`,
          email, emailVerifiedAt: email ? now : null,
          password: null, feverCredentialHash: null,
          role: 'user', bootstrapAdminClaim: null
        }, { transaction });
      }
      await OidcIdentity.create({
        identityHash, issuer: claims.iss, subject: claims.sub, userId: user.id
      }, { transaction });
      return user;
    });
  } catch (error) {
    // Another login may have created this exact identity while this transaction waited.
    // Email/username conflicts without that identity always fail; never merge by email.
    if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    return resolveExisting(await OidcIdentity.findByPk(identityHash));
  }
};
