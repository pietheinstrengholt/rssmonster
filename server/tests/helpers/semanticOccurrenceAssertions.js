import { expect } from 'vitest';

// Fixture source IDs identify reports; database Event IDs are only compared relationally.
export function expectSameEvent(rows, sourceIds) {
  const selected = sourceIds.map(sourceId => {
    const row = rows.find(article => article.sourceId === sourceId);
    expect(row, `Missing fixture article ${sourceId}`).toBeTruthy();
    expect.soft(row.eventId, `${sourceId} must belong to an Event`).not.toBeNull();
    return row;
  });
  expect.soft(new Set(selected.map(row => row.eventId)).size, `Same Event: ${sourceIds.join(', ')}`).toBe(1);
  return selected[0].eventId;
}

export function expectDifferentEvents(rows, ...groups) {
  const eventIds = groups.map(group => expectSameEvent(rows, group));
  expect.soft(new Set(eventIds).size, `Distinct occurrences: ${groups.map(group => group.join(', ')).join(' / ')}`).toBe(groups.length);
}

export function expectEventless(rows, sourceId) {
  const row = rows.find(article => article.sourceId === sourceId);
  expect(row, `Missing fixture article ${sourceId}`).toBeTruthy();
  expect.soft(row.eventId, `${sourceId} must remain Eventless`).toBeNull();
}

export function expectEventCounts(rows, events) {
  for (const event of events) {
    const members = rows.filter(article => article.eventId === event.id);
    expect.soft(Number(event.articleCount), `Event ${event.id} article count`).toBe(members.length);
    expect.soft(Number(event.sourceCount), `Event ${event.id} distinct sources`).toBe(new Set(members.map(article => article.feedId)).size);
    expect.soft(members.length, `Event ${event.id} must not be a singleton`).toBeGreaterThanOrEqual(2);
  }
}
