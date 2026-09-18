import db from '../../models/index.js';
import { getCrawlOverrides, withCrawlConfiguration } from '../../config/crawlSettings.js';
import { resolveEffectiveSequelizeCrawlConfiguration } from '../../config/databaseRuntime.js';

const KEY = 'crawlConfiguration';
const TIMER_MAX = 2_147_483_647;
export const CRAWL_FIELDS = Object.freeze([
  { key: 'CRAWL_PARALLELPROCESSFLAG', label: 'Parallel feed processing', group: 'Scheduling', defaultValue: 0, min: 0, max: 1, help: '0 processes feeds sequentially; 1 enables parallel processing. SQLite always uses sequential processing.' },
  { key: 'CRAWL_WORKER_INTERVAL_MS', label: 'Worker interval', group: 'Scheduling', defaultValue: 60000, unit: 'ms', help: 'Delay between completed crawl-worker iterations. Changes apply after the current sleep or iteration.' },
  { key: 'CRAWL_RUN_MAX_RUNNING_MINUTES', label: 'Stale crawl threshold', group: 'Scheduling', defaultValue: 2, suggestedValue: 60, max: Math.floor(TIMER_MAX / 60000), unit: 'minutes', help: 'Recover runs that have not reported a heartbeat for this long. The minimum is three heartbeat intervals.' },
  { key: 'FEED_MAX_COUNT', label: 'Feeds per crawl', group: 'Scheduling', defaultValue: 100, help: 'Maximum feeds claimed by one crawl invocation.' },
  { key: 'FEED_TIMEOUT_MS', label: 'Feed processing deadline', group: 'Scheduling', defaultValue: 60000, suggestedValue: 300000, unit: 'ms', help: 'Overall deadline for fetching, parsing, and processing one feed.' },
  { key: 'FEED_LEASE_MS', label: 'Feed lease duration', group: 'Scheduling', defaultValue: 120000, unit: 'ms', help: 'Lease duration is raised to at least twice the feed processing deadline; active work renews it.' },
  { key: 'FEED_RESPONSE_MAX_BYTES', label: 'Maximum feed response', group: 'Requests', defaultValue: 10485760, unit: 'bytes', help: 'Maximum streamed and decoded response size.' },
  { key: 'FEED_ORIGIN_MAX_CONCURRENCY', label: 'Requests per origin', group: 'Requests', defaultValue: 2, help: 'Maximum concurrent requests to one publisher origin.' },
  { key: 'FEED_ORIGIN_MIN_SPACING_MS', label: 'Request spacing per origin', group: 'Requests', defaultValue: 250, min: 0, unit: 'ms', help: 'Minimum time between request starts to one publisher origin.' },
  { key: 'FEED_HTTP_TIMEOUT_MS', label: 'HTTP timeout fallback', group: 'Requests', defaultValue: 10000, unit: 'ms', help: 'Fallback when FEED_CONNECT_TIMEOUT_MS or FEED_BODY_TIMEOUT_MS is unset. Explicit phase-specific environment values still apply.' },
  { key: 'FEED_PARSER_TIMEOUT_MS', label: 'Parser time limit', group: 'Parser', defaultValue: 2000, unit: 'ms', help: 'Maximum runtime of an isolated feed parser.' },
  { key: 'FEED_PARSER_MEMORY_MB', label: 'Parser memory limit', group: 'Parser', defaultValue: 64, unit: 'MiB', help: 'Maximum old-generation heap for each parser worker.' },
  { key: 'FEED_MAX_ENTRIES', label: 'Maximum entries per feed', group: 'Parser', defaultValue: 1000, suggestedValue: 2000, help: 'Reject feeds exceeding this entry count before article processing.' },
  { key: 'FEED_MAX_GUID_BYTES', label: 'Maximum entry ID', group: 'Entry limits', defaultValue: 4096, unit: 'bytes' },
  { key: 'FEED_MAX_URL_BYTES', label: 'Maximum entry URL', group: 'Entry limits', defaultValue: 8192, unit: 'bytes' },
  { key: 'FEED_MAX_TITLE_BYTES', label: 'Maximum title', group: 'Entry limits', defaultValue: 4096, unit: 'bytes' },
  { key: 'FEED_MAX_AUTHOR_BYTES', label: 'Maximum author', group: 'Entry limits', defaultValue: 2048, unit: 'bytes' },
  { key: 'FEED_MAX_CONTENT_BYTES', label: 'Maximum entry content', group: 'Entry limits', defaultValue: 2097152, unit: 'bytes', help: 'Combined UTF-8 size of content and description.' }
].map(field => Object.freeze({ min: 1, max: TIMER_MAX, ...field })));

export class CrawlConfigurationError extends Error {
  constructor(message) { super(message); this.name = 'CrawlConfigurationError'; this.code = 'CRAWL_CONFIGURATION_INVALID'; }
}
const readOverrides = async () => (await db.ServerSetting.findByPk(KEY, { logging: false }))?.value || null;
export const withCrawlSettings = async operation => {
  if (getCrawlOverrides()) return operation();
  return withCrawlConfiguration(await readOverrides() || {}, operation);
};
export const getCrawlWorkerInterval = async () => (await readOverrides())?.CRAWL_WORKER_INTERVAL_MS ?? process.env.CRAWL_WORKER_INTERVAL_MS;

export const getCrawlSettings = async () => {
  const overrides = await readOverrides();
  const fields = CRAWL_FIELDS.map(field => {
    let raw = process.env[field.key];
    if (field.key === 'FEED_MAX_COUNT') raw ??= process.env.MAX_FEEDCOUNT;
    if (field.key === 'CRAWL_RUN_MAX_RUNNING_MINUTES' && !raw) {
      const heartbeatMs = Number.parseInt(process.env.CRAWL_RUN_HEARTBEAT_INTERVAL_MS, 10) || 30000;
      const staleMs = Number.parseInt(process.env.CRAWL_RUN_STALE_AFTER_MS, 10) || 120000;
      raw = Math.ceil(Math.max(staleMs, heartbeatMs * 3) / 60000);
    }
    const parsed = Number(raw);
    const environmentValue = raw !== undefined && raw !== '' && Number.isSafeInteger(parsed) && parsed >= field.min && parsed <= field.max ? parsed : field.defaultValue;
    return { ...field, value: overrides?.[field.key] ?? environmentValue, environmentValue };
  });
  const environment = { ...process.env, ...Object.fromEntries(fields.map(field => [field.key, field.value])) };
  return {
    overridden: Boolean(overrides), fields,
    effectiveParallel: resolveEffectiveSequelizeCrawlConfiguration(db.sequelize, environment).parallelProcessFlag,
    effectiveLeaseMs: Math.max(environment.FEED_LEASE_MS, environment.FEED_TIMEOUT_MS * 2)
  };
};
export const saveCrawlSettings = async input => {
  if (!input || typeof input.overridden !== 'boolean' || Object.keys(input).some(key => !['overridden', 'values'].includes(key))) throw new CrawlConfigurationError('Provide the crawl override and its values');
  if (!input.overridden) {
    if (Object.hasOwn(input, 'values')) throw new CrawlConfigurationError('Inherited crawl settings cannot include overrides');
    return clearCrawlSettings();
  }
  if (!input.values || typeof input.values !== 'object' || Array.isArray(input.values) || Object.keys(input.values).length !== CRAWL_FIELDS.length) throw new CrawlConfigurationError('Provide all crawl settings');
  for (const field of CRAWL_FIELDS) {
    const value = input.values[field.key];
    if (!Number.isSafeInteger(value) || value < field.min || value > field.max) throw new CrawlConfigurationError(`${field.key} must be an integer between ${field.min} and ${field.max}`);
  }
  if (input.values.FEED_TIMEOUT_MS > Math.floor(TIMER_MAX / 2)) throw new CrawlConfigurationError('FEED_TIMEOUT_MS is too large to maintain a safe feed lease');
  await db.ServerSetting.upsert({ key: KEY, value: input.values }, { logging: false });
  return getCrawlSettings();
};
export const clearCrawlSettings = async () => {
  await db.ServerSetting.destroy({ where: { key: KEY }, logging: false });
  return getCrawlSettings();
};
