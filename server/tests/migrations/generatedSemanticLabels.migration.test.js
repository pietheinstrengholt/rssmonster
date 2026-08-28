import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260828000000-add-generated-semantic-labels.js');

describe('generated semantic labels migration', () => {
  it('adds nullable generated fields after the deterministic fields', async () => {
    const queryInterface = {
      addColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.addColumn.mock.calls).toEqual([
      ['events', 'generatedName', expect.objectContaining({
        allowNull: true,
        defaultValue: null,
        after: 'name'
      })],
      ['topics', 'generatedName', expect.objectContaining({
        allowNull: true,
        defaultValue: null,
        after: 'name'
      })],
      ['islands', 'generatedLabel', expect.objectContaining({
        allowNull: true,
        defaultValue: null,
        after: 'label'
      })]
    ]);
  });

  it('removes the generated fields in reverse order', async () => {
    const queryInterface = {
      removeColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.down(queryInterface);

    expect(queryInterface.removeColumn.mock.calls).toEqual([
      ['islands', 'generatedLabel'],
      ['topics', 'generatedName'],
      ['events', 'generatedName']
    ]);
  });
});
