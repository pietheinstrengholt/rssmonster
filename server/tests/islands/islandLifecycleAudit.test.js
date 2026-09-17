import { describe, expect, it } from 'vitest';
import { buildIslandLifecycleDecision } from '../../services/islands/islandLifecycleAudit.js';
import { islandArchiveState } from '../../services/islands/islandLifecycle.js';

const at = days => new Date(Date.UTC(2026, 0, 1) + days * 86400000);
const previous = { weight: -0.8, archivedInd: false, lastBehaviorAt: at(0) };
const decision = (island, support, day) => buildIslandLifecycleDecision(island, support,
  islandArchiveState(island, support, at(day)), at(day));

describe('Island lifecycle explanations', () => {
  it('records sign, renewal clocks and unchanged replay without inventing activity', () => {
    const support = { weight: -0.8, lastBehaviorAt: at(10), confidence: 0.7 };
    expect(decision(previous, support, 10)).toMatchObject({ reason: 'renewed', preferenceSign: -1,
      qualifyingBehaviorAt: at(10).toISOString(), before: { lastBehaviorAt: at(0).toISOString() },
      after: { expiresAt: at(100).toISOString() } });
    expect(decision({ ...previous, lastBehaviorAt: at(10) }, support, 11).reason).toBe('unchanged_activity');
  });

  it('records the actual expiry boundary even when processing is late or support has disappeared', () => {
    for (const lastBehaviorAt of [at(0), null]) {
      expect(decision(previous, { lastBehaviorAt }, 100)).toMatchObject({ reason: 'inactivity_expired',
        boundaryAt: at(90).toISOString(), decidedAt: at(100).toISOString() });
    }
  });

  it('explains fresh reactivation, early archival rejection and unknown boundaries', () => {
    const archived = { ...previous, archivedInd: true, archivedAt: at(5) };
    expect(decision(archived, { weight: -0.8, lastBehaviorAt: at(6) }, 6)).toMatchObject({
      reason: 'reactivated', boundaryAt: at(5).toISOString() });
    expect(decision(archived, { lastBehaviorAt: at(5) }, 6)).toMatchObject({
      reason: 'reactivation_rejected', reactivationBlockedBy: 'evidence_not_newer_than_boundary' });
    expect(decision({ archivedInd: true }, { lastBehaviorAt: at(6) }, 6)).toMatchObject({
      reason: 'reactivation_rejected', reactivationBlockedBy: 'unknown_archive_boundary' });
    expect(decision(null, { lastBehaviorAt: null }, 6).reason).toBe('no_qualifying_activity');
  });
});
