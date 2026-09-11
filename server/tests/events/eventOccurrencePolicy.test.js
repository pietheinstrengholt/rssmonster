import { describe, expect, it } from 'vitest';
import {
  evaluateArticleAgainstEvent, evaluateCandidateSignal, evaluateEventCreation, selectEventDecision
} from '../../services/events/eventOccurrencePolicy.js';
import { buildCanonicalEventProjection } from '../../services/events/eventProjection.js';
import { extractOccurrenceFeatures, aggregateOccurrenceFeatures } from '../../services/events/occurrenceFeatures.js';

const origin = Date.parse('2026-09-10T00:00:00Z');
const at = hours => new Date(origin + hours * 3600000);
const article = (hours = 1, overrides = {}) => ({
  id: 10, userId: 1, feedId: 1, title: 'Acme releases the new compiler',
  articleVector: [1, 0], publishedAt: at(hours), ...overrides
});
const event = (overrides = {}) => ({
  id: 1, userId: 1, name: 'Acme releases the new compiler', eventVector: [1, 0],
  eventWindowStartAt: at(0), eventWindowEndAt: at(0), ...overrides
});
const evaluate = (a, e, evidence = {}) => evaluateArticleAgainstEvent(a, e, { now: at(4).getTime(), ...evidence });

describe('shared Event occurrence policy', () => {
  it.each([
    ['Orion OS 4.2 released', 'Orion OS 4.3 released', 'version_conflict'],
    ['Train collision in Rotterdam', 'Train collision in Antwerp', 'location_conflict'],
    ['Fabrikam cuts the price of its existing Lyra Air notebook', 'Fabrikam launches a new generation of Lyra Air notebook', 'object_conflict']
  ])('rejects explicit occurrence contradictions despite identical vectors: %s', (title, other, reason) => {
    const incoming = article(1, { title });
    const member = article(0, { id: 1, title: other });
    // Retrieval still discovers a semantically strong report; identity decides later.
    expect(evaluateCandidateSignal({ article: incoming, candidate: member, articleEventVector: incoming.articleVector }).accepted).toBe(true);
    expect(evaluateCandidateSignal({ article: incoming, candidate: member, articleEventVector: incoming.articleVector, enforceOccurrence: true }).accepted).toBe(false);
    const result = evaluate(incoming, event({ name: other }), {
      eventOccurrenceFeatures: aggregateOccurrenceFeatures([member, member].map(extractOccurrenceFeatures))
    });
    expect(result).toMatchObject({ eligible: false, reasons: expect.arrayContaining([reason]) });
  });

  it('uses member consensus rather than a noisy representative or one matching member', () => {
    const incoming = article(1, { title: 'Orion OS 4.3 released' });
    const members = [
      article(0, { id: 1, eventId: 1, title: 'Orion OS 4.2 released' }),
      article(0, { id: 2, eventId: 1, title: 'Orion OS 4.2 released' }),
      article(0, { id: 3, eventId: 1, title: 'Orion OS 4.3 released' })
    ];
    const memberSignals = members.map(candidate => evaluateCandidateSignal({ article: incoming, candidate, articleEventVector: incoming.articleVector }));
    expect(evaluate(incoming, event({ name: incoming.title, articleCount: 3 }), { memberSignals }))
      .toMatchObject({ eligible: false, reasons: expect.arrayContaining(['version_conflict']) });
    expect(evaluate(incoming, event({ name: members[0].title, articleCount: 3 }), { memberSignals: [memberSignals[0]] }).evidence.versionConflict).toBe(false);
  });

  it('uses the same occurrence protection when validating creation', () => {
    const members = [article(0, { id: 1, title: 'Orion OS 4.2 released' }), article(1, { id: 2, title: 'Orion OS 4.3 released' })];
    expect(evaluateEventCreation(members, { ...event(), ...buildCanonicalEventProjection(members) }))
      .toMatchObject({ decision: 'reject', reasons: expect.arrayContaining(['version_conflict']) });
  });

  it('keeps action-only conflicts soft and exposes their reasons', () => {
    const result = evaluate(article(1, { title: 'Contoso launches Project Nova' }), event({ name: 'Contoso cancels Project Nova' }));
    expect(result).toMatchObject({ eligible: true, reasons: expect.arrayContaining(['action_conflict']) });
    expect(result.evidence.actionConflict).toBe(true);
    expect(result.evidence.strongActionConflict).toBe(false);
  });

  it('accepts the same occurrence with stable evidence and reasons', () => {
    expect(evaluate(article(), event())).toMatchObject({
      eligible: true, decision: 'join',
      reasons: expect.arrayContaining(['semantic_match', 'headline_overlap', 'shared_entities', 'temporal_match']),
      evidence: { spanHours: 1 }
    });
  });

  it.each(['event_cache', 'event_database', 'member_articles'])('discovery via %s does not change acceptance or score', source => {
    const baseline = evaluate(article(), event());
    const result = evaluate(article(), event(), { candidateSources: [source] });
    expect(result.decision).toBe(baseline.decision);
    expect(result.score).toBe(baseline.score);
    expect(result.reasons).toEqual(baseline.reasons);
  });

  it('member support cannot bypass the proposed whole-Event span', () => {
    const incoming = article(36);
    const member = article(20, { id: 2, eventId: 1 });
    const support = evaluateCandidateSignal({ article: incoming, candidate: member, articleEventVector: incoming.articleVector });
    expect(support.accepted).toBe(true);
    const result = evaluate(incoming, event({ eventWindowEndAt: at(20) }), { memberSignals: [support] });
    expect(result).toMatchObject({ eligible: false, decision: 'reject', reasons: ['event_span_exceeded'] });
  });

  it('preserves the exclusive 24-hour boundary', () => {
    expect(evaluate(article(24), event()).reasons).toContain('event_span_exceeded');
    expect(evaluate(article(23.99), event()).decision).toBe('join');
  });

  it('rejects opposite-side seed evidence with an excessive combined span', () => {
    const seed = article(0);
    const members = [article(-20, { id: 1 }), seed, article(20, { id: 2 })];
    for (const candidate of [members[0], members[2]]) {
      expect(evaluateCandidateSignal({ article: seed, candidate, articleEventVector: seed.articleVector }).accepted).toBe(true);
    }
    expect(evaluateEventCreation(members, {
      ...event(), ...buildCanonicalEventProjection(members)
    })).toMatchObject({ decision: 'reject', reasons: ['event_span_exceeded'] });
  });

  it('does not let the seed vector corroborate itself', () => {
    const members = [article(0, { id: 1, articleVector: [1, 0] }), article(1, { id: 2, articleVector: [0.7, Math.sqrt(0.51)] })];
    expect(evaluateEventCreation(members, {
      ...event(), ...buildCanonicalEventProjection(members)
    }).decision).toBe('reject');
  });

  it('preserves near-identical headline matching below the normal semantic threshold', () => {
    const result = evaluate(article(), event({ eventVector: [0.8, 0.6] }));
    expect(result.decision).toBe('join');
    expect(result.reasons).toContain('near_identical_headline');
    expect(result.reasons).not.toContain('semantic_match');
  });

  it('rejects weak semantic evidence and insufficient supporting evidence', () => {
    expect(evaluate(article(), event({ eventVector: [0, 1] })).reasons).toContain('insufficient_semantic_match');
    expect(evaluate(article(), event({ name: 'unrelated words only', eventVector: [0.85, Math.sqrt(1 - 0.85 ** 2)] })).reasons).toContain('insufficient_support');
  });

  it('uses the strongest qualifying member without a count bonus', () => {
    const incoming = article();
    const support = evaluateCandidateSignal({ article: incoming, candidate: article(0), articleEventVector: incoming.articleVector });
    const e = event({ name: 'Centroid misses', eventVector: [0, 1] });
    expect(evaluate(incoming, e, { memberSignals: [support] }).score)
      .toBe(evaluate(incoming, e, { memberSignals: Array(100).fill(support) }).score);
    expect(evaluate(incoming, e, { memberSignals: [support] }).decision).toBe('join');
  });

  it('selects a stronger occurrence over a larger weaker Event', () => {
    const strong = event({ id: 1, articleCount: 2 });
    const weak = event({ id: 2, articleCount: 100, eventVector: [0.9, Math.sqrt(0.19)] });
    const decisions = [weak, strong].map(e => ({ event: e, ...evaluate(article(), e) }));
    expect(selectEventDecision(decisions).candidate.event.id).toBe(1);
  });

  it('makes similarly strong candidates ambiguous, including exact ties with a zero margin setting', () => {
    const decisions = [event(), event({ id: 2 })].map(e => ({ event: e, ...evaluate(article(), e) }));
    expect(selectEventDecision(decisions)).toMatchObject({ decision: 'ambiguous', candidate: null, reasons: ['ambiguous_candidates'] });
    expect(selectEventDecision(decisions, 0).decision).toBe('ambiguous');
  });

  it('uses the configurable margin for close but unequal matches', () => {
    const decisions = [event(), event({ id: 2, eventVector: [0.98, Math.sqrt(1 - 0.98 ** 2)] })]
      .map(e => ({ event: e, ...evaluate(article(), e) }));
    expect(selectEventDecision(decisions).decision).toBe('ambiguous');
    expect(selectEventDecision(decisions, 0.01).decision).toBe('join');
  });

  it('does not make an old clear match ambiguous merely because scores have decayed', () => {
    const decisions = [event(), event({ id: 2, eventVector: [0.9, Math.sqrt(0.19)] })]
      .map(e => ({ event: e, ...evaluateArticleAgainstEvent(article(), e, { now: at(2000).getTime() }) }));
    expect(selectEventDecision(decisions).decision).toBe('join');
  });

  it.each([
    ['Patch Tuesday April 2026', 'Patch Tuesday May 2026', 30 * 24],
    ['Compiler build 100 released', 'Compiler build 101 released', 48],
    ['Acme developer conference 2025', 'Acme developer conference 2026', 365 * 24]
  ])('separates recurring occurrences: %s / %s', (previousTitle, nextTitle, hours) => {
    const result = evaluate(article(hours, { title: nextTitle }), event({ name: previousTitle }));
    expect(result.decision).toBe('reject');
    expect(result.reasons).toContain('event_span_exceeded');
  });

  it('rejects foreign ownership, duplicates and filtered input', () => {
    expect(evaluate(article(), event({ userId: 2 })).reasons).toContain('ownership_mismatch');
    for (const fields of [{ filteredInd: true }, { duplicateOfArticleId: 1 }, { status: 'duplicate' }]) {
      expect(evaluate(article(1, fields), event()).reasons).toContain('noncanonical_article');
    }
  });
});
