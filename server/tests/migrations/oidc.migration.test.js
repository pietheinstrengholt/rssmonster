import { Sequelize, DataTypes } from 'sequelize';
import { describe, expect, it } from 'vitest';
import migration from '../../migrations/20260910000000-add-oidc-login.js';
import createIdentity from '../../models/oidcIdentity.js';
import createTransaction from '../../models/oidcTransaction.js';
import createUser from '../../models/user.js';
import credentialsMigration from '../../migrations/20260910001000-allow-oidc-only-users.js';

describe('OIDC migration', () => {
  it.each([false, true])('preserves SQLite user references, indexes and allocated IDs (empty=%s)', async empty => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    try {
      const User = createUser(sequelize);
      User.rawAttributes.password.allowNull = false;
      User.rawAttributes.feverCredentialHash.allowNull = false;
      User.refreshAttributes();
      await User.sync();
      const existing = await User.create({ username: 'local-reader', email: 'local@example.com', password: 'hash', feverCredentialHash: 'fever-hash' });
      await User.create({ id: 100, username: 'deleted-reader', password: 'deleted-hash', feverCredentialHash: 'deleted-fever' });
      await User.destroy({ where: { id: 100 } });
      await migration.up(sequelize.getQueryInterface(), DataTypes);
      const Identity = createIdentity(sequelize);
      if (empty) await existing.destroy();
      else await Identity.create({ identityHash: 'e'.repeat(64), issuer: 'https://issuer.example', subject: 'linked', userId: existing.id });

      await credentialsMigration.up(sequelize.getQueryInterface(), DataTypes);
      User.rawAttributes.password.allowNull = true;
      User.rawAttributes.feverCredentialHash.allowNull = true;
      User.refreshAttributes();
      const created = await User.create({ username: 'provider-reader', password: null, feverCredentialHash: null });
      expect(created.id).toBeGreaterThan(100);
      if (!empty) {
        expect((await existing.reload()).password).toBe('hash');
        expect(await Identity.count()).toBe(1);
        await expect(User.create({ username: 'duplicate-email', email: existing.email, password: null, feverCredentialHash: null }))
          .rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
      }
      await expect(credentialsMigration.down(sequelize.getQueryInterface(), DataTypes)).rejects.toThrow('OIDC-only accounts exist');
      await created.destroy();
      await credentialsMigration.down(sequelize.getQueryInterface(), DataTypes);
      const columns = await sequelize.getQueryInterface().describeTable('users');
      expect(columns.password.allowNull).toBe(false);
      expect(columns.feverCredentialHash.allowNull).toBe(false);
      const [foreignKeys] = await sequelize.query('PRAGMA foreign_keys');
      expect(foreignKeys.foreign_keys).toBe(1);
    } finally {
      await sequelize.close();
    }
  });

  it('supports the model contracts, unique identities, user deletion and rollback on SQLite', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    try {
      const User = sequelize.define('users', { id: { type: DataTypes.INTEGER, primaryKey: true } });
      await User.sync();
      await User.create({ id: 1 });
      await migration.up(sequelize.getQueryInterface(), DataTypes);
      const Identity = createIdentity(sequelize);
      const Transaction = createTransaction(sequelize);
      const values = { identityHash: 'a'.repeat(64), issuer: 'https://issuer.example', subject: 'Subject', userId: 1 };
      await Identity.create(values);
      await expect(Identity.create(values)).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
      await Transaction.create({
        stateHash: 'b'.repeat(64), browserHash: 'c'.repeat(64), configurationHash: 'd'.repeat(64),
        phase: 'pending', linkUserId: 1, expiresAt: new Date()
      });
      await User.destroy({ where: { id: 1 } });
      expect(await Identity.count()).toBe(0);
      expect(await Transaction.count()).toBe(0);
      await migration.down(sequelize.getQueryInterface());
      expect(await sequelize.getQueryInterface().showAllTables()).not.toContain('oidc_identities');
      expect(await sequelize.getQueryInterface().showAllTables()).not.toContain('oidc_transactions');
    } finally {
      await sequelize.close();
    }
  });
});
