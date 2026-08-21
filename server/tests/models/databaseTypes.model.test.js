import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import {
  unsignedBigIntType,
  unsignedIntegerType
} from '../../models/databaseTypes.js';

const sqlite = { getDialect: () => 'sqlite' };

describe('dialect-aware unsigned model types', () => {
  // Uses plain SQLite integer types without unsupported unsigned modifiers.
  it('uses plain integer affinity for SQLite', () => {
    expect(unsignedIntegerType(sqlite).toString()).toBe('INTEGER');
    expect(unsignedBigIntType(sqlite).toString()).toBe('BIGINT');
  });

  // Keeps initialized model types aligned with the active database dialect.
  it('uses dialect-aware integer types on initialized models', () => {
    const sqliteDialect = db.sequelize.getDialect() === 'sqlite';
    const integerType = sqliteDialect ? 'INTEGER' : 'INTEGER UNSIGNED';
    const bigIntType = sqliteDialect ? 'BIGINT' : 'BIGINT UNSIGNED';

    expect(db.Article.rawAttributes.imageWidth.type.toString()).toBe(integerType);
    expect(db.Article.rawAttributes.imageHeight.type.toString()).toBe(integerType);
    expect(db.Island.rawAttributes.id.type.toString()).toBe(bigIntType);
    expect(db.IslandTopic.rawAttributes.islandId.type.toString()).toBe(bigIntType);
    expect(db.IslandTaxonomy.rawAttributes.id.type.toString()).toBe(bigIntType);
  });
});
