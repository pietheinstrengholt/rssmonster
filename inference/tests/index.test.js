import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { isInferenceEntryPoint } from '../src/index.js';

describe('inference process entry point', () => {
  it('starts when Node executes the inference module directly', () => {
    const scriptPath = '/srv/rssmonster/inference/src/index.js';

    expect(isInferenceEntryPoint({
      argv: ['node', scriptPath],
      environment: {},
      moduleUrl: pathToFileURL(scriptPath).href
    })).toBe(true);
  });

  it('starts when PM2 loads the module through its process wrapper', () => {
    expect(isInferenceEntryPoint({
      argv: ['node', '/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js'],
      environment: { pm_id: '3' },
      moduleUrl: 'file:///srv/rssmonster/inference/src/index.js'
    })).toBe(true);
  });

  it('does not start merely because another module imports it', () => {
    expect(isInferenceEntryPoint({
      argv: ['node', '/srv/rssmonster/test-runner.js'],
      environment: {},
      moduleUrl: 'file:///srv/rssmonster/inference/src/index.js'
    })).toBe(false);
  });
});
