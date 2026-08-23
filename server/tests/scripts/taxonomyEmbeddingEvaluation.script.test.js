import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { buildArticleEventEmbeddingText } from '../../services/articles/embedArticle.js';

const require = createRequire(import.meta.url);
const { taxonomyItems, toIdentity } = require('../../seeders/20260520104500-island-taxonomy.js');
const fixtureUrl = new URL('../fixtures/island-taxonomy-evaluation.json', import.meta.url);

describe('taxonomy embedding strategy evaluation fixture', () => {
  it('uses valid expected concepts and production article text', async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
    const candidateIdentities = new Set(fixture.candidateConcepts.map(concept =>
      toIdentity(...concept)
    ));
    const taxonomyIdentities = new Set(taxonomyItems.map(item =>
      toIdentity(item.categoryName, item.displayName)
    ));

    expect(fixture.articles).toHaveLength(23);
    expect(candidateIdentities.size).toBe(fixture.candidateConcepts.length);
    expect([...candidateIdentities].every(identity => taxonomyIdentities.has(identity))).toBe(true);

    for (const article of fixture.articles) {
      expect(candidateIdentities.has(toIdentity(...article.expected))).toBe(true);
      expect(buildArticleEventEmbeddingText(article).length).toBeGreaterThanOrEqual(60);
    }
  });
});
