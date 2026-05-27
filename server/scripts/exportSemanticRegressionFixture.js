import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Op } from 'sequelize';

import db from '../models/index.js';

const { sequelize, Feed, Article } = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = join(__dirname, '..', 'tests', 'fixtures', 'semantic-regression.json');
const FIXTURE_FEED_URL_PREFIX = 'https://fixtures.rssmonster.test/';
const PLACEHOLDER_FEED_URLS = new Set(['https://example.com/rss.xml']);

function readOption(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find(value => value.startsWith(prefix));

  return arg ? arg.slice(prefix.length) : null;
}

function parseIntegerOption(name) {
  const value = readOption(name);
  if (!value) return null;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid --${name} value: ${value}`);
  }

  return parsed;
}

function articleContent(article) {
  return (
    article.contentStripped ||
    article.contentOriginal ||
    article.description ||
    article.title ||
    ''
  ).trim();
}

function isExportableFeed(feed) {
  return (
    !feed.url.startsWith(FIXTURE_FEED_URL_PREFIX) &&
    !PLACEHOLDER_FEED_URLS.has(feed.url)
  );
}

async function main() {
  const outputPath = resolve(readOption('output') || process.env.SEMANTIC_REGRESSION_OUTPUT || DEFAULT_OUTPUT_PATH);
  const userId = parseIntegerOption('user-id') || Number.parseInt(process.env.SEMANTIC_REGRESSION_USER_ID || '', 10);
  const limit = parseIntegerOption('limit') || Number.parseInt(process.env.SEMANTIC_REGRESSION_LIMIT || '', 10);
  const userFilter = Number.isInteger(userId) ? { userId } : {};

  await sequelize.authenticate();

  const feeds = await Feed.findAll({
    where: userFilter,
    attributes: ['id', 'feedName', 'feedDesc', 'feedType', 'url', 'status'],
    order: [
      ['feedName', 'ASC'],
      ['id', 'ASC']
    ]
  });

  const feedIdMap = new Map(
    feeds
      .filter(isExportableFeed)
      .map((feed, index) => [feed.id, index + 1])
  );

  const articleWhere = {
    ...userFilter,
    feedId: { [Op.in]: [...feedIdMap.keys()] }
  };

  const articles = feedIdMap.size
    ? await Article.findAll({
      where: articleWhere,
      attributes: [
        'id',
        'feedId',
        'status',
        'starInd',
        'negativeInd',
        'openedCount',
        'clickedAmount',
        'title',
        'description',
        'contentOriginal',
        'contentStripped',
        'published'
      ],
      order: [
        ['published', 'ASC'],
        ['id', 'ASC']
      ],
      limit: Number.isInteger(limit) ? limit : undefined
    })
    : [];

  const fixture = {
    feeds: feeds
      .filter(feed => feedIdMap.has(feed.id))
      .map(feed => ({
      id: feedIdMap.get(feed.id),
      feedName: feed.feedName,
      description: feed.feedDesc || '',
      feedDesc: feed.feedDesc || '',
      feedType: feed.feedType || 'rss',
      url: feed.url,
      status: feed.status || 'active'
    })),
    articles: articles
      .map(article => ({
        content: articleContent(article),
        feedId: feedIdMap.get(article.feedId),
        status: article.status || 'unread',
        starInd: article.starInd || 0,
        negativeInd: article.negativeInd || 0,
        openedCount: article.openedCount || 0,
        clickedAmount: article.clickedAmount || 0
      }))
      .filter(article => article.content && article.feedId)
  };

  await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

  console.log(
    `[SEMANTIC FIXTURE] wrote ${fixture.feeds.length} feeds and ` +
    `${fixture.articles.length} articles to ${outputPath}`
  );
}

main()
  .catch(err => {
    console.error('[SEMANTIC FIXTURE] export failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
