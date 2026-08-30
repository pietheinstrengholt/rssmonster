import { readFile, rename, writeFile } from 'node:fs/promises';

export const parsePositiveIntegerConfig = (value, fallback, name) => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
};

export const createWorkerHealthReporter = ({ filePath, now }) => async state => {
  const persistedState = { ...state, updatedAt: now().toISOString() };
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(persistedState)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
  return persistedState;
};

export const readWorkerHealthState = async ({ filePath, evaluate }) => {
  const state = JSON.parse(await readFile(filePath, 'utf8'));
  return { ...evaluate(state), state };
};
