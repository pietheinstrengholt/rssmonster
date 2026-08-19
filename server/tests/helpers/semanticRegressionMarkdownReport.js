import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';

const { Article } = db;
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
      topic: articles.find(row => row.topicName)?.topicName || '-',
      samples: sampleTitles(articles)
    }))
    .sort((left, right) => right.articleCount - left.articleCount || left.name.localeCompare(right.name));
}

// This function builds topic-level report rows from the persisted semantic trace.
function topicRows(rows) {
  return [...groupedRows(rows, 'topicId').entries()]
    .map(([topicId, articles]) => ({
      topicId,
      name: articles.find(row => row.topicName)?.topicName || '-',
      eventCount: new Set(articles.map(row => row.eventId).filter(Boolean)).size,
      articleCount: articles.length,
      island: articles.find(row => row.islandDecision === 'topic-island')?.islandName || '-',
      samples: sampleTitles(articles)
    }))
    .sort((left, right) => right.articleCount - left.articleCount || left.name.localeCompare(right.name));
}

// This function builds island-level report rows from topic and vector-fallback assignments.
function islandRows(rows) {
  return [...groupedRows(rows, 'islandId').entries()]
    .map(([islandId, articles]) => ({
      islandId,
      name: articles.find(row => row.islandName)?.islandName || '-',
      topicCount: new Set(
        articles
          .filter(row => row.islandDecision === 'topic-island')
          .map(row => row.topicId)
          .filter(Boolean)
      ).size,
      topicArticles: articles.filter(row => row.islandDecision === 'topic-island').length,
      fallbackArticles: articles.filter(row => row.islandDecision === 'vector-fallback').length,
      samples: sampleTitles(articles)
    }))
    .sort((left, right) => (
      right.topicArticles + right.fallbackArticles - left.topicArticles - left.fallbackArticles ||
      left.name.localeCompare(right.name)
    ));
}

// This function builds management-level statistics for one completed semantic run.
function summaryRows(rows, events, topics, islands, duplicates) {
  const incrementalRows = rows.filter(row => row.source === 'incremental');

  return [
    ['Articles evaluated', rows.length],
    ['Baseline articles', rows.filter(row => row.source === 'baseline').length],
    ['Incremental articles', incrementalRows.length],
    ['Articles assigned to events', rows.filter(row => row.eventId).length],
    ['Articles assigned to topics', rows.filter(row => row.topicId).length],
    ['Active events', events.length],
    ['Active topics', topics.length],
    ['Interest islands used', islands.length],
    ['Topic-island article paths', rows.filter(row => row.islandDecision === 'topic-island').length],
    ['Vector-fallback island paths', rows.filter(row => row.islandDecision === 'vector-fallback').length],
    ['Standalone articles', rows.filter(row => row.semanticPath === 'A').length],
    ['Incremental joins to existing events', rows.filter(row => row.eventDecision === 'existing-event').length],
    ['Incremental articles in new events', rows.filter(row => row.eventDecision === 'new-event').length],
    ['Duplicate groups', duplicates.length],
    ['Duplicate articles', duplicates.reduce((sum, group) => sum + group.duplicates.length, 0)]
  ];
}

// This function renders the reusable Markdown artifact without model-specific assumptions.
export function renderSemanticRegressionMarkdown({ trace, metadata, duplicateGroups = [], generatedAt = new Date() }) {
  const rows = Object.values(trace.articles || {});
  const events = eventRows(rows);
  const topics = topicRows(rows);
  const islands = islandRows(rows);
  const summary = summaryRows(rows, events, topics, islands, duplicateGroups);
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
    '## Events',
    '',
    markdownTable(
      ['Event', 'Articles', 'Sources', 'Topic', 'Representative articles'],
      events.map(event => [event.name, event.articleCount, event.sourceCount, event.topic, event.samples])
    ),
    '',
    '## Topics',
    '',
    markdownTable(
      ['Topic', 'Events', 'Articles', 'Interest island', 'Representative articles'],
      topics.map(topic => [topic.name, topic.eventCount, topic.articleCount, topic.island, topic.samples])
    ),
    '',
    '## Interest islands',
    '',
    markdownTable(
      ['Island', 'Topics', 'Topic-path articles', 'Fallback articles', 'Representative articles'],
      islands.map(island => [
        island.name,
        island.topicCount,
        island.topicArticles,
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
    '- Event, topic, and island tables include representative titles rather than every article.',
    '- Vector-fallback counts show island classification that did not travel through a topic membership.',
    '- This report records observed pipeline behavior; passing regression assertions does not by itself establish model quality.',
    '- Use the JSON trace in this directory for article-level investigation and cross-run comparison.',
    ''
  ].join('\n');
}

// This function loads duplicate groups for the regression user from canonical relationships.
async function loadDuplicateGroups(userIds) {
  const duplicates = await Article.findAll({
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
    ? await Article.findAll({
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
  const metadata = {
    provider: vectorFixture.embeddingProvider,
    model: vectorFixture.embeddingModel,
    dimensions: vectorFixture.embeddingDimensions || vectorFixture.articles?.[0]?.articleVector?.length,
    task: vectorFixture.embeddingTask
  };
  const filename = `${reportModelSlug(metadata.model)}-${reportTimestamp(generatedAt)}.md`;
  const reportPath = join(REPORT_DIR, filename);
  const markdown = renderSemanticRegressionMarkdown({ trace, metadata, duplicateGroups, generatedAt });

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(reportPath, markdown);
  console.log(`[SEMANTIC REPORT] wrote ${reportPath}`);

  return reportPath;
}
