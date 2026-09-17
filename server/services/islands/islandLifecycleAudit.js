import { ISLAND_CAPACITY_ORDER } from './islandCapacity.js';
import { ISLAND_INACTIVITY_DAYS, islandBehaviorTime, islandExpiresAt, islandReactivationBoundary } from './islandDeadline.js';

const iso = value => {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const stateSnapshot = (island, now) => ({
  weight: Number(island?.weight || 0),
  archivedInd: Boolean(island?.archivedInd),
  archivedAt: iso(island?.archivedAt),
  lastBehaviorAt: iso(island?.lastBehaviorAt),
  expiresAt: islandExpiresAt(island, now)?.toISOString() ?? null
});

// Observational metadata only: decisions never feed back into lifecycle or scoring.
export function buildIslandLifecycleDecision(island, support, nextState, now = new Date()) {
  const boundary = islandReactivationBoundary(island, now);
  const supportingTime = islandBehaviorTime(support?.lastBehaviorAt, now);
  const previousTime = islandBehaviorTime(island?.lastBehaviorAt, now);
  const supportExpiry = islandExpiresAt(support, now)?.getTime();
  let reason;
  if (nextState.archivedInd) {
    const previousExpiry = islandExpiresAt(island, now)?.getTime();
    reason = (supportExpiry != null && supportExpiry <= Number(now))
      || (supportingTime == null && previousExpiry != null && previousExpiry <= Number(now))
      ? 'inactivity_expired' : supportingTime == null ? 'no_qualifying_activity' : 'reactivation_rejected';
  } else {
    reason = !island ? 'created'
      : island.archivedInd || boundary != null ? 'reactivated'
        : previousTime == null || supportingTime > previousTime ? 'renewed' : 'unchanged_activity';
  }
  return {
    reason, decidedAt: now.toISOString(), inactivityDays: ISLAND_INACTIVITY_DAYS,
    boundaryAt: iso(boundary ?? (nextState.archivedInd ? nextState.archivedAt : null)),
    qualifyingBehaviorAt: iso(supportingTime), preferenceSign: Math.sign(support?.weight ?? island?.weight ?? 0),
    ...(reason === 'reactivation_rejected' ? { reactivationBlockedBy: boundary == null
      ? 'unknown_archive_boundary' : 'evidence_not_newer_than_boundary' } : {}),
    supportExpiresAt: iso(supportExpiry), retainedSupport: Number(support?.retainedSupport || 0), confidence: Number(support?.confidence || 0),
    before: island ? stateSnapshot(island, now) : null,
    after: stateSnapshot({ ...nextState, weight: support?.weight ?? island?.weight }, now)
  };
}

// At most two decisions per persistence entry: ordinary lifecycle, then capacity.
export function appendCapacityDecision(audit, island, archiveState, ranked, maxIslands, now = new Date()) {
  const rank = ranked.findIndex(row => Number(row.id) === Number(island.id));
  const candidate = ranked[rank];
  const cutoff = ranked[maxIslands - 1];
  const order = ISLAND_CAPACITY_ORDER;
  const decision = {
    reason: 'capacity_archived', decidedAt: now.toISOString(), boundaryAt: now.toISOString(),
    before: stateSnapshot(island, now),
    after: stateSnapshot({ ...archiveState, weight: island.weight, lastBehaviorAt: island.lastBehaviorAt }, now),
    capacity: {
      limit: maxIslands, candidateCount: ranked.length, rank: rank + 1,
      order: order.map(field => ({ field, direction: field === 'id' ? 'ascending' : 'descending' })),
      candidate, cutoff,
      decidedBy: order.find(field => candidate[field] !== cutoff[field])
    }
  };
  const previous = Array.isArray(audit) ? audit : [];
  const latest = previous.at(-1) || { runAt: now.toISOString() };
  return [...previous.slice(0, -1), { ...latest, lifecycle: [...(latest.lifecycle || []), decision].slice(-2) }];
}
