import { afterEach, describe, expect, it, vi } from 'vitest';
import { candidateDiagnostic, emitEventDiagnostic, eventDiagnosticsEnabled, eventDiagnosticChannel } from '../../services/events/eventDecisionDiagnostics.js';
import { evaluateArticleAgainstEvent, selectEventDecision } from '../../services/events/eventOccurrencePolicy.js';

const now = new Date('2026-09-10T12:00:00Z');
function evaluate(title, name) {
  const article = { id: 1, userId: 1, title, embedding_model: 'test-model', articleVector: [1, 0], publishedAt: now };
  const event = { id: 24, userId: 1, name, embedding_model: 'test-model', eventVector: [1, 0], eventWindowStartAt: now, eventWindowEndAt: now };
  return { event, ...evaluateArticleAgainstEvent(article, event, { now: now.getTime() }) };
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('Event candidate diagnostics', () => {
  it.each([
    ['Orion OS 4.3 released', 'Orion OS 4.2 released', ['version_conflict']],
    ['Train collision in Rotterdam', 'Train collision in Antwerp', ['location_conflict']],
    ['Fabrikam cuts the price of its existing Lyra Air notebook', 'Fabrikam launches new generation Lyra Air notebook', ['action_conflict', 'object_conflict']]
  ])('explains the occurrence rejection: %s', (title, name, reasons) => {
    const result = evaluate(title, name);
    const row = candidateDiagnostic(result);
    expect(row.decision).toBe('reject');
    expect(row.reasons).toEqual(expect.arrayContaining(['semantic_match', ...reasons]));
    expect(row).toMatchObject({ eventId: 24, eventName: name, similarity: 1, temporalCompatibility: true, eventSpanCompatibility: true });
    expect(row.score).toBe(result.score);
  });

  it('accepts Orion launch pricing without a false conflict', () => {
    const row = candidateDiagnostic(evaluate('Acme reveals Orion X1 pricing after launch', 'Acme launches new generation Orion X1 notebook'));
    expect(row.decision).toBe('join');
    expect(row.reasons).toContain('semantic_match');
    expect(row.reasons.filter(reason => reason.endsWith('_conflict'))).toEqual([]);
  });

  it('explains winner ambiguity without changing the policy result', () => {
    const first = evaluate('Orion OS 4.2 released', 'Orion OS 4.2 released');
    const second = { ...first, event: { ...first.event, id: 25 } };
    const before = structuredClone([first, second]);
    const selection = selectEventDecision([first, second]);
    for (const result of [first, second]) {
      expect(candidateDiagnostic(result, selection)).toMatchObject({ decision: 'ambiguous', reasons: expect.arrayContaining(['ambiguous_candidates']) });
    }
    expect([first, second]).toEqual(before);
  });

  it('keeps missing occurrence evidence neutral and explains exceeded spans', () => {
    const result = evaluate('Local news', 'Local news');
    result.evidence.temporal = 0;
    result.evidence.spanHours = 52;
    result.reasons = ['event_span_exceeded'];
    const row = candidateDiagnostic(result);
    expect(row).toMatchObject({ temporalCompatibility: false, eventSpanCompatibility: false, versionMatch: false, versionConflict: false });
    expect(row.reasons).toContain('event_span_exceeded');
  });

  it('emits only in explicit diagnostic mode and excludes bodies and vectors', () => {
    for (const key of ['EVENT_DEBUG', 'EVENT_RECLUSTER_DEBUG', 'SEMANTIC_REPORT_LEVEL']) vi.stubEnv(key, '');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(eventDiagnosticsEnabled()).toBe(false);
    emitEventDiagnostic({ id: 1, title: 'Safe title', contentText: 'PRIVATE BODY', password: 'SECRET' }, 'assignment', { decision: 'reject' });
    expect(log).not.toHaveBeenCalled();
    const received = [];
    const listener = row => received.push(row);
    eventDiagnosticChannel.subscribe(listener);
    try {
      const result = evaluate('Safe title', 'Safe name');
      result.event.description = 'PRIVATE BODY';
      emitEventDiagnostic({ id: 1, title: 'Safe title', contentText: 'PRIVATE BODY', password: 'SECRET' }, 'event_candidates', { candidates: [candidateDiagnostic(result)] });
      expect(received).toHaveLength(1);
      expect(JSON.stringify(received)).not.toMatch(/PRIVATE BODY|SECRET|eventVector|articleVector/);
      expect(log).not.toHaveBeenCalled();
    } finally {
      eventDiagnosticChannel.unsubscribe(listener);
    }
  });
});
