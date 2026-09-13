import { describe, expect, it } from 'vitest';
import { renderEventDiagnostics } from './semanticEventDiagnosticReport.js';

describe('Event diagnostic report', () => {
  it('retains evidence and distinguishes candidate decisions from assignment outcomes', () => {
    const rows = [
      { articleId: 7, articleTitle: 'Orion OS 4.3', stage: 'event_candidates', topMatches: [{ eventId: 24, decision: 'reject', reasons: ['version_conflict'], similarity: 0.96 }] },
      { articleId: 7, articleTitle: 'Orion OS 4.3', stage: 'assignment', eventId: null, decision: 'reject', outcome: 'eventless' }
    ];
    const markdown = renderEventDiagnostics(rows);
    expect(markdown).toContain('Candidate decisions precede persistence');
    for (const row of rows) expect(markdown).toContain(JSON.stringify(row));
    expect(markdown).toContain('version_conflict');
  });
});
