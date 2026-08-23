import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

import { buildTaxonomyEmbeddingText } from '../../services/islands/taxonomyEmbeddingText.js';

const require = createRequire(import.meta.url);
const seeder = require('../../seeders/20260520104500-island-taxonomy.js');

describe('island taxonomy embedding text', () => {
  it('builds deterministic structured text with aliases', () => {
    const item = {
      categoryName: 'Technology & Computing',
      displayName: 'Vector Databases',
      description: 'Databases optimized for vector similarity search.',
      aliases: ['vector database', 'vector store']
    };

    expect(buildTaxonomyEmbeddingText(item)).toBe([
      'Category: Technology & Computing',
      'Topic: Vector Databases',
      'Description: Databases optimized for vector similarity search.',
      'Aliases: vector database, vector store'
    ].join('\n'));
    expect(buildTaxonomyEmbeddingText(item)).toBe(buildTaxonomyEmbeddingText({ ...item }));
  });

  it('omits the alias line when aliases are unavailable', () => {
    expect(buildTaxonomyEmbeddingText({
      categoryName: 'Science',
      displayName: 'Astronomy',
      description: 'Scientific study of celestial objects and phenomena.'
    })).toBe([
      'Category: Science',
      'Topic: Astronomy',
      'Description: Scientific study of celestial objects and phenomena.'
    ].join('\n'));
  });

  it('omits the description line when a description is unavailable', () => {
    expect(buildTaxonomyEmbeddingText({
      categoryName: 'Sports',
      displayName: 'Tennis',
      aliases: ['lawn tennis']
    })).toBe([
      'Category: Sports',
      'Topic: Tennis',
      'Aliases: lawn tennis'
    ].join('\n'));
  });

  it('preserves canonical identities while consolidating RAG into an alias', () => {
    const rag = seeder.taxonomyItems.find(item =>
      item.displayName === 'Retrieval Augmented Generation'
    );

    expect(seeder.toIdentity(rag.categoryName, rag.displayName)).toBe(
      'technology-and-computing-retrieval-augmented-generation'
    );
    expect(rag.aliases).toContain('RAG');
    expect(seeder.taxonomyItems.some(item => item.displayName === 'RAG')).toBe(false);
    expect(seeder.deprecatedTaxonomyIdentities).toEqual([
      'technology-and-computing-rag'
    ]);
    expect(seeder.toIdentity('Technology & Computing', 'C#')).toBe(
      'technology-and-computing-c'
    );
    expect(seeder.toIdentity('Technology & Computing', 'C++')).toBe(
      'technology-and-computing-c-plus-plus'
    );
    expect(new Set(seeder.taxonomyItems.map(item =>
      seeder.toIdentity(item.categoryName, item.displayName)
    )).size).toBe(seeder.taxonomyItems.length);
  });

  it('seeds descriptions without persisting aliases', async () => {
    const queryInterface = {
      bulkInsert: vi.fn().mockResolvedValue(undefined),
      bulkDelete: vi.fn().mockResolvedValue(undefined)
    };

    await seeder.up(queryInterface);

    const rows = queryInterface.bulkInsert.mock.calls[0][1];
    const vectorDatabases = rows.find(row => row.displayName === 'Vector Databases');
    expect(vectorDatabases.description).toContain('storing, indexing, and retrieving vector embeddings');
    expect(vectorDatabases.identity).toBe('technology-and-computing-vector-databases');
    expect(vectorDatabases).not.toHaveProperty('aliases');
    expect(rows.every(row => row.description)).toBe(true);
  });

  it('disambiguates intentionally retained duplicate labels by category', () => {
    const liveStreamingItems = seeder.taxonomyItems.filter(item =>
      item.displayName === 'Live Streaming'
    );

    expect(liveStreamingItems).toHaveLength(2);
    expect(liveStreamingItems[0].description).not.toBe(liveStreamingItems[1].description);
    expect(liveStreamingItems.map(buildTaxonomyEmbeddingText)).toEqual([
      expect.stringContaining('entertainment, events, performances'),
      expect.stringContaining('gameplay, gaming commentary')
    ]);
  });
});
