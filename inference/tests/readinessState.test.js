import { describe, expect, it, vi } from 'vitest';
import { createReadinessState } from '../src/readiness/readinessState.js';

describe('readiness state', () => {
  it('validates initial and transition states', () => {
    expect(() => createReadinessState({ initialState: 'unknown' }))
      .toThrow('Invalid inference readiness state: unknown');

    const readiness = createReadinessState({ logger: { log: vi.fn() } });
    expect(() => readiness.transitionTo('unknown'))
      .toThrow('Invalid inference readiness state: unknown');
  });

  it('announces each state once and exposes immutable snapshots', () => {
    const logger = { log: vi.fn() };
    const readiness = createReadinessState({ logger });

    expect(readiness.announce()).toBe(true);
    expect(readiness.announce()).toBe(false);
    expect(readiness.getState()).toBe('starting');
    expect(readiness.getSnapshot()).toEqual({ state: 'starting' });
    expect(Object.isFrozen(readiness.getSnapshot())).toBe(true);
    expect(readiness.transitionTo('ready')).toBe(true);
    expect(readiness.transitionTo('ready')).toBe(false);

    expect(logger.log.mock.calls).toEqual([
      ['[INFERENCE] Readiness state=starting'],
      ['[INFERENCE] Readiness state=ready']
    ]);
  });

  it('does not leave the terminal shutting-down state', () => {
    const readiness = createReadinessState({
      initialState: 'shutting_down',
      logger: { log: vi.fn() }
    });

    expect(readiness.transitionTo('failed')).toBe(false);
    expect(readiness.getState()).toBe('shutting_down');
  });
});
