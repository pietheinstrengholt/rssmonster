import { Op } from 'sequelize';
import { usableBehaviorDate } from '../articles/articleBehaviorTime.js';

const configuredDays = Number(process.env.ISLAND_INACTIVITY_DAYS);
export const ISLAND_INACTIVITY_DAYS = Number.isFinite(configuredDays) && configuredDays >= 30 && configuredDays <= 90
  ? configuredDays : 90;
const inactivityMs = ISLAND_INACTIVITY_DAYS * 86400000;

export const islandBehaviorTime = (value, now = Date.now()) => usableBehaviorDate(value, now)?.getTime() ?? null;

// Technical timestamps and historical weight never establish an activity deadline.
export const islandExpiresAt = (island, now = Date.now()) => {
  const time = islandBehaviorTime(island?.lastBehaviorAt, now);
  return time == null ? null : new Date(time + inactivityMs);
};

export const isActiveIsland = (island, now = Date.now()) => !island.archivedInd
  && Number(islandExpiresAt(island, now)) > Number(now);

// Equality is expired. Unknown and future activity cannot grant active participation.
export const activeIslandWhere = (now = Date.now()) => ({
  archivedInd: false,
  lastBehaviorAt: { [Op.gt]: new Date(Number(now) - inactivityMs), [Op.lte]: new Date(now) }
});

// Delayed expiry and early archival share this boundary for decisions and their explanations.
export const islandReactivationBoundary = (island, now = Date.now()) => {
  const expiry = islandExpiresAt(island, now)?.getTime();
  const archived = islandBehaviorTime(island?.archivedAt, now);
  const boundaries = [
    ...(island?.archivedInd && archived != null ? [archived] : []),
    ...(expiry != null && expiry <= Number(now) ? [expiry] : [])
  ];
  return boundaries.length ? Math.min(...boundaries) : null;
};
