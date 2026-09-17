import { articleRecords } from '../../services/articles/articleRecords.js';
import { collectIslandDiagnostics, recommendationCoverage, interestPathMetrics } from './semanticRecommendationDiagnostics.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';


const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(__dirname, '..', '.semantic-regression');
const TRACE_PATH = join(REPORT_DIR, 'trace.json');
const SAMPLE_TITLE_LIMIT = 3;

// This function makes external model identifiers safe for report filenames.
export function reportModelSlug(model) {
  return String(model || 'unknown-model')
    .split('/')
    .at(-1)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-model';
}

// This function formats one UTC instant for stable, sortable report filenames.
export function reportTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '').slice(0, 14);
}

// This function escapes values for Markdown table cells.
function cell(value) {
  return String(value ?? '-').replaceAll('|', '\\|').replaceAll('\n', ' ').trim() || '-';
}

// This function formats a compact Markdown table.
function markdownTable(headers, rows) {
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)
  ].join('\n');
}

// This function returns a few representative titles without expanding the report excessively.
function sampleTitles(rows) {
  return rows
    .map(row => row.title)
    .filter(Boolean)
    .slice(0, SAMPLE_TITLE_LIMIT)
    .join('; ') || '-';
}

// This function groups trace rows by one semantic entity.
function groupedRows(rows, idKey) {
  const groups = new Map();

  for (const row of rows) {
    const id = Number(row[idKey] || 0);
    if (!id) continue;
    const group = groups.get(id) || [];
    group.push(row);
    groups.set(id, group);
  }

  return groups;
}

// This function builds event-level report rows from the persisted semantic trace.
function eventRows(rows) {
  return [...groupedRows(rows, 'eventId').entries()]
    .map(([eventId, articles]) => ({
      eventId,
      name: articles.find(row => row.eventName)?.eventName || '-',
      articleCount: articles.length,
      sourceCount: Math.max(...articles.map(row => Number(row.sourceCount || 0))),
      samples: sampleTitles(articles)
    }))
    .sort((left, right) => right.articleCount - left.articleCount || left.name.localeCompare(right.name));
}

// This function builds island-level report rows from direct vector assignments.
function islandRows(rows) {
  return [...groupedRows(rows, 'islandId').entries()]
    .map(([islandId, articles]) => ({
      islandId,
      name: articles.find(row => row.islandName)?.islandName || '-',
      fallbackArticles: articles.filter(row => row.islandDecision === 'vector-fallback').length,
      samples: sampleTitles(articles)
    }))
    .sort((left, right) => (
      right.fallbackArticles - left.fallbackArticles ||
      left.name.localeCompare(right.name)
    ));
}

// This function builds management-level statistics for one completed semantic run.
function summaryRows(rows, events, islands, duplicates) {
  const incrementalRows = rows.filter(row => row.source === 'incremental');

  return [
    ['Articles evaluated', rows.length],
    ...Object.entries(recommendationCoverage(rows)),
    ...Object.entries(interestPathMetrics(rows)),
    ['Baseline articles', rows.filter(row => row.source === 'baseline').length],
    ['Incremental articles', incrementalRows.length],
    ['Articles assigned to events', rows.filter(row => row.eventId).length],
    ['Active events', events.length],
    ['Interest islands used', islands.length],
    ['Vector-fallback island paths', rows.filter(row => row.islandDecision === 'vector-fallback').length],
    ['Standalone articles', rows.filter(row => row.semanticPath === 'A').length],
    ['Incremental joins to existing events', rows.filter(row => row.eventDecision === 'existing-event').length],
    ['Incremental articles in new events', rows.filter(row => row.eventDecision === 'new-event').length],
    ['Duplicate groups', duplicates.length],
    ['Duplicate articles', duplicates.reduce((sum, group) => sum + group.duplicates.length, 0)]
  ];
}

// This function renders the reusable Markdown artifact without model-specific assumptions.
export function renderSemanticRegressionMarkdown({ trace, metadata, duplicateGroups = [], generatedAt = new Date(), expansion = null }) {
  const rows = Object.values(trace.articles || {});
  const events = eventRows(rows);
  const islands = islandRows(rows);
  const summary = summaryRows(rows, events, islands, duplicateGroups);
  const duplicateRows = duplicateGroups.map(group => [
    group.canonicalId,
    group.canonicalTitle,
    group.duplicates.length,
    group.duplicates.map(article => `${article.id}: ${article.title}`).join('; ')
  ]);

  return [
    '# Semantic Regression Report',
    '',
    `Generated: ${generatedAt.toISOString()}`,
    '',
    '## Run metadata',
    '',
    markdownTable(['Field', 'Value'], [
      ['Provider', metadata.provider || 'unknown'],
      ['Model', metadata.model || 'unknown'],
      ['Dimensions', metadata.dimensions || 'unknown'],
      ['Embedding task', metadata.task || 'unspecified'],
      ['Trace phase', trace.phase || 'unknown'],
      ['Trace run ID', trace.runId || 'unknown']
    ]),
    '',
    '## Management summary',
    '',
    markdownTable(['Metric', 'Value'], summary),
    '',
    ...(expansion ? [
      '## Expanded scenario corpus', '',
      'The legacy user keeps its own metrics above. Isolated expansion users preserve real calendar gaps and behavioral training/held-out boundaries. Controlled-vector checks reuse those Articles and are reported separately from frozen Qwen outcomes.', '',
      markdownTable(['Corpus', 'Articles'], [['Legacy main user', rows.length], ['Dedicated expansion', expansion.expansionCorpusCount], ['Combined', rows.length + expansion.expansionCorpusCount]]), '',
      markdownTable(['Expansion metric', 'Value'], Object.entries(expansion.metrics)), '',
      `Gold assertions: ${expansion.checks.filter(c => c.pass).length} passed; ${expansion.checks.filter(c => !c.pass).length} failed.`, '',
      '[Scenario PASS/FAIL and held-out outcomes](expansion-report.md) · [Structured outcomes](expansion-report.json) · [Event decisions](expansion-decisions.md)', ''
    ] : []),
    '## Island formation diagnostics',
    '',
    'Derived from current bounded behavioral support (nearest qualifying Island, not audit history). Publication-day breadth is a proxy, not measured interaction-day breadth. These classifications do not affect ranking.',
    '',
    markdownTable(['Metric', 'Value'], [
      ['Active Islands', trace.islandDiagnostics?.activeIslands ?? '-'],
      ['Singleton Islands', trace.islandDiagnostics?.islands.filter(row => row.singleton).length ?? '-'],
      ['Low-cohesion Islands', trace.islandDiagnostics?.islands.filter(row => row.lowCohesion).length ?? '-'],
      ['Unassigned behavioral profiles', trace.islandDiagnostics?.unassignedBehavioralProfiles ?? '-']
    ]),
    '',
    markdownTable(['Island', 'Preference', 'Confidence', 'Members', 'Distinct articles', 'Sources', 'Interaction days', 'Median similarity', 'Minimum similarity', 'Positive', 'Negative', 'Classification'],
      (trace.islandDiagnostics?.islands || []).map(row => [row.label, row.preferenceStrength?.toFixed(3), row.islandConfidence?.toFixed(3), row.memberCount, row.distinctBehavioralArticles,
        row.distinctSources, row.distinctInteractionDays, row.medianSimilarity?.toFixed(3), row.minimumSimilarity?.toFixed(3),
        row.positiveEvidenceCount, row.negativeEvidenceCount, row.classifications.join(', ')])),
    '',
    '## Interest contribution diagnostics',
    '',
    'Paths are deduplicated per Island and per sign. Seed/self evidence is not held-out generalization.',
    '',
    markdownTable(['Article', 'Evidence', 'Path', 'Island / behavior source', 'Similarity', 'Relationship confidence', 'Recency', 'Intent', 'Intent compatibility', 'Contribution'],
      rows.flatMap(row => (row.interestDiagnostics?.paths || []).map(path => [row.title,
        row.interestDiagnostics.seedSelf ? 'seed/self' : 'held-out', path.matchType,
        path.islandId ?? `article ${path.sourceArticleId} (${path.explicitType})`, path.semanticSimilarity?.toFixed(3),
        path.relationshipConfidence?.toFixed(3),
        path.recencyFactor?.toFixed(3), path.intentMatchType, path.intentCompatibility, path.contribution?.toFixed(4)]))),
    '',
    '## Event decision diagnostics',
    '',
    '[Baseline](baseline-decisions.md) · [Incremental](incremental-decisions.md) · [Unread](unread-decisions.md) · [Occurrence scenarios](occurrences-decisions.md)',
    '',
    'Companion JSON files contain machine-readable evidence and reasons. Candidate checks are separate from committed assignment outcomes; at most five candidates are shown per Article and stage.',
    '',
    '## Events',
    '',
    markdownTable(
      ['Event', 'Articles', 'Sources', 'Representative articles'],
      events.map(event => [event.name, event.articleCount, event.sourceCount, event.samples])
    ),
    '',
    '## Interest islands',
    '',
    markdownTable(
      ['Island', 'Fallback articles', 'Representative articles'],
      islands.map(island => [
        island.name,
        island.fallbackArticles,
        island.samples
      ])
    ),
    '',
    '## Duplicate detection',
    '',
    duplicateRows.length
      ? markdownTable(['Canonical ID', 'Canonical article', 'Duplicates', 'Duplicate articles'], duplicateRows)
      : 'No duplicate groups were present for this regression user.',
    '',
    '## Incremental processing',
    '',
    markdownTable(['Outcome', 'Articles'], [
      ['Joined an existing event', rows.filter(row => row.eventDecision === 'existing-event').length],
      ['Assigned to a new event', rows.filter(row => row.eventDecision === 'new-event').length],
      ['Remained eventless', rows.filter(row => row.source === 'incremental' && row.eventDecision === 'eventless').length]
    ]),
    '',
    '## Interpretation notes',
    '',
    '- Event and island tables include representative titles rather than every article.',
    '- Vector-fallback counts show direct Island matching.',
    '- This report records observed pipeline behavior; passing regression assertions does not by itself establish model quality.',
    '- Use the JSON trace in this directory for article-level investigation and cross-run comparison.',
    ''
  ].join('\n');
}

// This function loads duplicate groups for the regression user from canonical relationships.
async function loadDuplicateGroups(userIds) {
  const duplicates = await articleRecords.findAll({
    where: {
      userId: { [Op.in]: userIds },
      duplicateOfArticleId: { [Op.ne]: null }
    },
    attributes: ['id', 'title', 'duplicateOfArticleId'],
    order: [['duplicateOfArticleId', 'ASC'], ['id', 'ASC']],
    raw: true
  });
  const canonicalIds = [...new Set(duplicates.map(article => Number(article.duplicateOfArticleId)))];
  const canonicals = canonicalIds.length
    ? await articleRecords.findAll({
      where: { userId: { [Op.in]: userIds }, id: { [Op.in]: canonicalIds } },
      attributes: ['id', 'title'],
      raw: true
    })
    : [];
  const canonicalById = new Map(canonicals.map(article => [Number(article.id), article]));

  return canonicalIds.map(canonicalId => ({
    canonicalId,
    canonicalTitle: canonicalById.get(canonicalId)?.title || '-',
    duplicates: duplicates
      .filter(article => Number(article.duplicateOfArticleId) === canonicalId)
      .map(article => ({ id: Number(article.id), title: article.title || '-' }))
  }));
}

// This function writes one timestamped semantic regression report beside the existing JSON trace.
export async function writeSemanticRegressionMarkdownReport({
  userId,
  duplicateEvaluationUserIds = [],
  generatedAt = new Date()
}) {
  const vectorFixturePath = await resolveSemanticVectorFixturePath('semantic-regression');
  const [trace, vectorFixture, duplicateGroups] = await Promise.all([
    readFile(TRACE_PATH, 'utf8').then(JSON.parse),
    readFile(vectorFixturePath, 'utf8').then(JSON.parse),
    loadDuplicateGroups([...new Set([userId, ...duplicateEvaluationUserIds].filter(Boolean))])
  ]);
  trace.islandDiagnostics = await collectIslandDiagnostics(userId);
  await writeFile(TRACE_PATH, JSON.stringify(trace, null, 2));
  console.table(recommendationCoverage(Object.values(trace.articles || {})));
  console.table(interestPathMetrics(Object.values(trace.articles || {})));
  console.table({
    'Active Islands': trace.islandDiagnostics.activeIslands,
    'Singleton Islands': trace.islandDiagnostics.islands.filter(row => row.singleton).length,
    'Low-cohesion Islands': trace.islandDiagnostics.islands.filter(row => row.lowCohesion).length,
    'Unassigned behavioral profiles': trace.islandDiagnostics.unassignedBehavioralProfiles
  });
  console.table(trace.islandDiagnostics.islands.map(({ basis: _basis, ...row }) => row));
  const metadata = {
    provider: vectorFixture.embeddingProvider,
    model: vectorFixture.embeddingModel,
    dimensions: vectorFixture.embeddingDimensions || vectorFixture.articles?.[0]?.articleVector?.length,
    task: vectorFixture.embeddingTask
  };
  const filename = `${reportModelSlug(metadata.model)}-${reportTimestamp(generatedAt)}.md`;
  const reportPath = join(REPORT_DIR, filename);
  let expansion = null;
  try {
    const candidate = JSON.parse(await readFile(join(REPORT_DIR, 'expansion-report.json'), 'utf8'));
    const users = await db.User.findAll({ where: { username: { [Op.like]: 'semantic-expansion-%' } }, attributes: ['id'], raw: true });
    const count = users.length ? await articleRecords.count({ where: { userId: users.map(u => u.id) } }) : 0;
    if (count > 0 && count === candidate.expansionCorpusCount) expansion = candidate;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const markdown = renderSemanticRegressionMarkdown({ trace, metadata, duplicateGroups, generatedAt, expansion });

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(reportPath, markdown);
  console.log(`[SEMANTIC REPORT] wrote ${reportPath}`);

  return reportPath;
}
