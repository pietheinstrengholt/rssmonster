import { describe, expect, it } from 'vitest';
import {
  parseProcessingJobOperatorArguments
} from '../../scripts/manageProcessingJobs.js';

describe('processing job operator command', () => {
  it('requires an explicit owner and exact requeue targets', () => {
    expect(() => parseProcessingJobOperatorArguments(['list-dead']))
      .toThrow(/--user-id is required/);
    expect(() => parseProcessingJobOperatorArguments([
      'requeue-dead', '--user-id', '4'
    ])).toThrow(/explicit --job-id/);
    expect(parseProcessingJobOperatorArguments([
      'requeue-dead', '--user-id', '4', '--job-id', 'job-a', '--job-id', 'job-b'
    ])).toEqual({
      command: 'requeue-dead',
      userId: '4',
      jobIds: ['job-a', 'job-b']
    });
  });

  it('supports bounded dead-job inspection filters', () => {
    expect(parseProcessingJobOperatorArguments([
      'list-dead', '--user-id', '7', '--type', 'semantic_label', '--limit', '10'
    ])).toEqual({
      command: 'list-dead',
      userId: '7',
      jobIds: [],
      type: 'semantic_label',
      limit: '10'
    });
  });
});
