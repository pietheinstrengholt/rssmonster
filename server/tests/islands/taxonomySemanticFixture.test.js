import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { buildTaxonomyEmbeddingText } from '../../services/islands/taxonomyEmbeddingText.js';
import { cosineSimilarity } from '../../services/vectors/index.js';

const require = createRequire(import.meta.url);
const { taxonomyItems, toIdentity } = require('../../seeders/20260520104500-island-taxonomy.js');
const fixtureUrl = new URL('../fixtures/island-taxonomy.semantic.json', import.meta.url);

const decodeVector = ({ data, scale }) =>
  Array.from(Buffer.from(data, 'base64'), value => (value - 128) * scale);

describe('island taxonomy semantic fixture', () => {
  it('keeps representative article text closer to its intended concept', async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
    const taxonomyByIdentity = new Map(taxonomyItems.map(item => [
      toIdentity(item.categoryName, item.displayName),
      item
    ]));
    const vectorsByIdentity = new Map(fixture.topics.map(topic => {
      const currentInput = buildTaxonomyEmbeddingText(taxonomyByIdentity.get(topic.identity));
      const currentInputHash = crypto.createHash('sha256').update(currentInput).digest('hex');
      expect(currentInputHash).toBe(topic.embeddingInputHash);
      return [topic.identity, decodeVector(topic.vector)];
    }));

    for (const article of fixture.articles) {
      const articleVector = decodeVector(article.vector);
      const intendedSimilarity = cosineSimilarity(
        articleVector,
        vectorsByIdentity.get(article.intendedIdentity)
      );
      const unrelatedSimilarity = cosineSimilarity(
        articleVector,
        vectorsByIdentity.get(article.unrelatedIdentity)
      );

      expect(intendedSimilarity).toBeGreaterThan(unrelatedSimilarity);
    }
  });
});
