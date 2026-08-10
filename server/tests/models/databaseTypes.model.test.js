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

  // Preserves the existing unsigned definitions on initialized MySQL models.
  it('keeps unsigned MySQL model fields', () => {
    expect(db.Article.rawAttributes.imageWidth.type.toString()).toBe('INTEGER UNSIGNED');
    expect(db.Article.rawAttributes.imageHeight.type.toString()).toBe('INTEGER UNSIGNED');
    expect(db.Island.rawAttributes.id.type.toString()).toBe('BIGINT UNSIGNED');
    expect(db.IslandTopic.rawAttributes.islandId.type.toString()).toBe('BIGINT UNSIGNED');
    expect(db.IslandTaxonomy.rawAttributes.id.type.toString()).toBe('BIGINT UNSIGNED');
  });
});
