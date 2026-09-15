import { describe, expect, it } from 'vitest';

import {
  buildDisambiguatedIslandName,
  buildUniqueIslandName,
  compareIslandStrength,
  groupIslandsByNormalizedName,
  isNearDuplicateIslandName,
  normalizeIslandName,
  sourceArticleCountForIsland,
  strongestIslandForDuplicateNameGroup
} from '../../services/islands/islandNameDisambiguation.js';

// This function creates a small island-like object for pure helper tests.
function island(overrides = {}) {
  return {
    id: 1,
    label: 'AI Companions',
    embedding_model: 'test-model', islandVector: [1, 0, 0],
    weight: 0.5,
    populationAudit: [{
      metrics: { relatedArticleCount: 1 },
      sourceArticles: {
        articles: [{
          title: 'The New AI Companions and the Claude Mythos'
        }]
      }
    }],
    ...overrides
  };
}

describe('island name disambiguation', () => {
  it('normalizes simple punctuation and whitespace differences', () => {
    expect(normalizeIslandName('  AI   Companions! ')).toBe('ai companions');
  });

  it('adds an incrementing suffix to make newly created island names unique', () => {
    const usedNames = new Set([
      normalizeIslandName('AI Companions'),
      normalizeIslandName('AI Companions (2)')
    ]);

    expect(buildUniqueIslandName('AI Companions', usedNames)).toBe('AI Companions (3)');
    expect(buildUniqueIslandName('Energy', usedNames)).toBe('Energy');
  });

  it('treats same-name high-similarity islands as near duplicates', () => {
    const left = island({ id: 1, islandVector: [1, 0, 0] });
    const right = island({ id: 2, islandVector: [0.99, 0.01, 0] });

    expect(isNearDuplicateIslandName(left, right, 0.92)).toBe(true);
  });

  it('allows same-name low-similarity islands to be disambiguated', () => {
    const left = island({ id: 1, islandVector: [1, 0, 0] });
    const right = island({ id: 2, islandVector: [0, 1, 0] });

    expect(isNearDuplicateIslandName(left, right, 0.92)).toBe(false);
    expect(buildDisambiguatedIslandName(left.label, right)).toBe('AI Companions: Claude Mythos');
  });

  it('keeps the strongest island on the broad base name', () => {
    const weak = island({ id: 1, weight: 0.2 });
    const strong = island({
      id: 2,
      weight: 0.1,
      populationAudit: [{
        metrics: { relatedArticleCount: 10 },
        sourceArticles: { articles: [] }
      }]
    });
    expect(compareIslandStrength(strong, weak)).toBeLessThan(0);
    expect(strongestIslandForDuplicateNameGroup([weak, strong])).toBe(strong);

  });

  it('builds a specific suffix without repeating generic base words', () => {
    const nextName = buildDisambiguatedIslandName(
      'AI Companions',
      island({
        id: 9,
        populationAudit: [{
          metrics: { relatedArticleCount: 3 },
          sourceArticles: {
            articles: [{
              title: 'The Future of AI Companions with Claude Mythos'
            }]
          }
        }]
      })
    );

    expect(nextName).toBe('AI Companions: Future Claude Mythos');
    expect(nextName).toMatch(/^AI Companions: .+/);
  });

  it('groups only islands with usable normalized names', () => {
    const groups = groupIslandsByNormalizedName([
      island({ id: 1, label: 'AI!' }),
      island({ id: 2, label: ' ai ' }),
      island({ id: 3, label: '---' })
    ]);

    expect([...groups.keys()]).toEqual(['ai']);
    expect(groups.get('ai').map(entry => entry.id)).toEqual([1, 2]);
  });

  it('falls back from audited metrics to source rows and then zero', () => {
    expect(sourceArticleCountForIsland(island({
      populationAudit: [{ metrics: {}, sourceArticles: { articles: [{}, {}] } }]
    }))).toBe(2);
    expect(sourceArticleCountForIsland(island({ populationAudit: null }))).toBe(0);
  });

  it('uses an id-based variant when every descriptive suffix is already used', () => {
    const target = island({ id: 42, populationAudit: [] });
    const usedNames = new Set([normalizeIslandName('AI Companions: Variant')]);

    expect(buildDisambiguatedIslandName('AI Companions', target, usedNames)).toBe('AI Companions: Variant 42');
  });
  it('preserves a unique suffix for long labels and occupied fallback names', () => {
    const baseName = 'A'.repeat(90);
    const target = island({ id: 42, populationAudit: [] });
    const usedNames = new Set([normalizeIslandName(baseName)]);
    for (let index = 0; index < 4; index++) {
      const name = buildDisambiguatedIslandName(baseName, target, usedNames);
      expect(name.length).toBeLessThanOrEqual(90);
      expect(usedNames.has(normalizeIslandName(name))).toBe(false);
      usedNames.add(normalizeIslandName(name));
    }
  });

  it.each([null, '', 'other-model'])('preserves distinct same-name Islands from incompatible spaces: %s', model => {
    expect(isNearDuplicateIslandName(island(), island({ id: 2, embedding_model: model }), -1)).toBe(false);
  });

});
