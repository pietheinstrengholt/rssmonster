import { describe, expect, it } from 'vitest';

import {
  renderSemanticRegressionMarkdown,
  reportModelSlug,
  reportTimestamp
} from './semanticRegressionMarkdownReport.js';

describe('semantic regression Markdown report', () => {
  it('creates model-agnostic sortable report names', () => {
    expect(reportModelSlug('organization/future/model name')).toBe('model-name');
    expect(reportTimestamp(new Date('2026-08-18T12:34:56.789Z'))).toBe('20260818123456');
  });

  it('summarizes semantic entities without listing every article separately', () => {
    const markdown = renderSemanticRegressionMarkdown({
      generatedAt: new Date('2026-08-18T12:34:56.789Z'),
      metadata: {
        provider: 'provider-under-test',
        model: 'organization/model-under-test',
        dimensions: 1024,
        task: 'feature-extraction'
      },
      trace: {
        runId: 'run-1',
        phase: 'rebuild-islands',
        articles: {
          1: {
            articleId: 1,
            source: 'baseline',
            title: 'First article',
            eventId: 10,
            eventName: 'Shared event',
            islandId: 30,
            islandName: 'Shared island',
            islandDecision: 'vector-fallback',
            semanticPath: 'A→E→I',
            sourceCount: 2
          },
          2: {
            articleId: 2,
            source: 'incremental',
            title: 'Second | article',
            eventId: 10,
            eventName: 'Shared event',
            islandId: 30,
            islandName: 'Shared island',
            islandDecision: 'vector-fallback',
            eventDecision: 'existing-event',
            semanticPath: 'A→E→I (fallback)',
            sourceCount: 2
          }
        }
      },
      duplicateGroups: [{
        canonicalId: 1,
        canonicalTitle: 'First article',
        duplicates: [{ id: 2, title: 'Second | article' }]
      }]
    });

    expect(markdown).toContain('# Semantic Regression Report');
    expect(markdown).toContain('| Model | organization/model-under-test |');
    expect(markdown).toContain('| Shared event | 2 | 2 |');
    expect(markdown).toContain('| Shared island | 2 |');
    expect(markdown).toContain('Second \\| article');
    expect(markdown).not.toContain('\n| 1 | First article | Shared event |');
  });
  it('keeps isolated corpus counts and failing gold assertions visible', () => {
    const markdown = renderSemanticRegressionMarkdown({ trace: { articles: { 1: { title: 'Legacy article' } } }, metadata: {},
      expansion: { expansionCorpusCount: 226, metrics: { 'Explicit held-out articles': 40 }, checks: [{ pass: true }, { pass: false }] } });
    expect(markdown).toContain('| Legacy main user | 1 |');
    expect(markdown).toContain('| Dedicated expansion | 226 |');
    expect(markdown).toContain('| Combined | 227 |');
    expect(markdown).toContain('Gold assertions: 1 passed; 1 failed.');
    expect(markdown).toContain('expansion-report.md');
  });

});
