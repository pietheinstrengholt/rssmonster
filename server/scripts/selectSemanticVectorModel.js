import { access, copyFile, readFile } from 'node:fs/promises';

import {
  legacySemanticVectorFixturePath,
  selectSemanticVectorModel,
  semanticVectorFixturePath
} from '../utils/semanticVectorFixtures.js';

const REQUIRED_FIXTURES = [
  'semantic-regression',
  'semantic-regression-incremental',
  'semantic-regression-incremental.unread',
  'island-taxonomy'
];

// This function reads one named command-line option.
function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find(value => value.startsWith(prefix))?.slice(prefix.length) || null;
}

async function main() {
  const model = option('model');
  if (!model) throw new Error('Provide the full model ID with --model=<model-id>');

  const fixturePaths = REQUIRED_FIXTURES.map(fixtureName => semanticVectorFixturePath(fixtureName, model));
  await Promise.all(REQUIRED_FIXTURES.map(async (fixtureName, index) => {
    const modelPath = fixturePaths[index];
    try {
      await access(modelPath);
      return;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    const legacyPath = legacySemanticVectorFixturePath(fixtureName);
    const legacyFixture = JSON.parse(await readFile(legacyPath, 'utf8'));
    if (legacyFixture.embeddingModel !== model) {
      throw new Error(`Missing cached ${fixtureName} vectors for ${model}`);
    }

    await copyFile(legacyPath, modelPath);
  }));

  const fixture = JSON.parse(await readFile(fixturePaths[0], 'utf8'));
  if (fixture.embeddingModel !== model) {
    throw new Error(`Fixture model ${fixture.embeddingModel || 'unknown'} does not match ${model}`);
  }

  await selectSemanticVectorModel({
    provider: fixture.embeddingProvider,
    model: fixture.embeddingModel,
    dimensions: fixture.embeddingDimensions || fixture.articles?.[0]?.articleVector?.length,
    task: fixture.embeddingTask
  });

  console.log(`[SEMANTIC FIXTURE] selected cached vectors for ${model}`);
}

main().catch(err => {
  console.error('[SEMANTIC FIXTURE] selection failed:', err.message);
  process.exitCode = 1;
});
