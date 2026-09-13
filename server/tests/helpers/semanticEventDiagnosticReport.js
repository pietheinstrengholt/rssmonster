import { beforeAll, afterAll } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { eventDiagnosticChannel } from '../../services/events/eventDecisionDiagnostics.js';

export function renderEventDiagnostics(rows) {
  return ['# Event candidate diagnostics', '',
    'Candidate decisions precede persistence; assignment rows record the committed outcome. Shared entities is the winning witness overlap count. Missing identity evidence has both match and conflict false. Seed candidates have no Event ID yet.', '',
    ...rows.flatMap(row => [
      `Article ${row.articleId}: ${row.articleTitle} (${row.stage})`,
      '```json', JSON.stringify(row), '```', ''
    ])].join('\n');
}

// Each test file owns its subscription and bounded report; no production state or queries.
export function installEventDiagnosticReport(name) {
  const rows = [];
  let omitted = 0;
  const listener = row => {
    if (rows.length < 10000) rows.push(structuredClone(row));
    else omitted++;
  };
  beforeAll(() => eventDiagnosticChannel.subscribe(listener));
  afterAll(async () => {
    eventDiagnosticChannel.unsubscribe(listener);
    const directory = new URL('../.semantic-regression/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL(`${name}-decisions.json`, directory), JSON.stringify({ omitted, rows }, null, 2));
    await writeFile(new URL(`${name}-decisions.md`, directory), `${renderEventDiagnostics(rows)}\nOmitted records: ${omitted}\n`);
  });
  return () => rows;
}
