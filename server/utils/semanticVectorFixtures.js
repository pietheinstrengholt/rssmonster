import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const FIXTURE_DIR = join(SERVER_DIR, 'tests', 'fixtures');
const STATE_DIR = join(SERVER_DIR, 'tests', '.semantic-regression');
const ACTIVE_MODEL_PATH = join(STATE_DIR, 'active-vector-model.json');

// This function converts any model identifier into a stable filename component.
export function semanticVectorModelSlug(model) {
  return String(model || 'unknown-model')
    .replaceAll('/', '--')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-model';
}

// This function resolves the legacy unqualified vector fixture path.
export function legacySemanticVectorFixturePath(fixtureName) {
  return join(FIXTURE_DIR, `${fixtureName}.vectors.json`);
}

// This function resolves a model-qualified vector fixture path.
export function semanticVectorFixturePath(fixtureName, model) {
  return join(FIXTURE_DIR, `${fixtureName}.${semanticVectorModelSlug(model)}.vectors.json`);
}

// This function reports whether a generated vector fixture exists without hiding other I/O errors.
export async function semanticVectorFixtureExists(path, accessImplementation = access) {
  try {
    await accessImplementation(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

// This function records which model-qualified fixture set the regression suite should load.
export async function selectSemanticVectorModel(metadata) {
  const selection = {
    provider: metadata.provider || null,
    model: metadata.model,
    dimensions: metadata.dimensions || null,
    task: metadata.task || null,
    selectedAt: new Date().toISOString()
  };

  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(ACTIVE_MODEL_PATH, `${JSON.stringify(selection, null, 2)}\n`);

  return selection;
}

// This function reads the active model selection without contacting inference.
export async function readSelectedSemanticVectorModel() {
  try {
    const source = await readFile(ACTIVE_MODEL_PATH, 'utf8');
    if (typeof source !== 'string') return null;
    return JSON.parse(source);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// This function resolves the selected model fixture with legacy compatibility.
export async function resolveSemanticVectorFixturePath(fixtureName) {
  const selection = await readSelectedSemanticVectorModel();
  if (selection?.model) {
    const selectedPath = semanticVectorFixturePath(fixtureName, selection.model);
    try {
      await access(selectedPath);
      return selectedPath;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      return selectedPath;
    }
  }

  return legacySemanticVectorFixturePath(fixtureName);
}

// This function loads a model fixture, importing matching legacy data when available.
export async function loadSemanticVectorFixtureForModel(fixtureName, model) {
  const modelPath = semanticVectorFixturePath(fixtureName, model);

  for (const path of [modelPath, legacySemanticVectorFixturePath(fixtureName)]) {
    try {
      const fixture = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
      if (fixture.embeddingModel === model) return { fixture, path: modelPath };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return { fixture: null, path: modelPath };
}
