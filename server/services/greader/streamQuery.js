import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import {
  getGreaderParameterValues,
  normalizeGreaderParameterValues
} from '../../utils/greaderParameters.js';

const { Article, Category, Feed, sequelize } = db;

export const LABEL_PREFIX = 'user/-/label/';
export const READING_LIST_STREAM = 'user/-/state/com.google/reading-list';
export const READ_STREAM = 'user/-/state/com.google/read';
export const STARRED_STREAM = 'user/-/state/com.google/starred';
export const UNREAD_STREAM = 'user/-/state/com.google/unread';
export const DEFAULT_STREAM_ITEM_COUNT = 20;
export const MAX_STREAM_ITEM_COUNT = 1000;
export const MAX_STREAM_ITEM_ID_COUNT = 10000;

// This class identifies invalid Google Reader stream requests.
export class GreaderStreamError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GreaderStreamError';
  }
}

// This function decodes a compatibility identifier without throwing on malformed escapes.
const safeDecodeURIComponent = value => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// This function converts Express wildcard values into one stream path.
export const normalizeStreamPath = value =>
  normalizeGreaderParameterValues(value).join('/');

// This function appends a predicate without replacing symbol-keyed canonical conditions.
const appendAndCondition = (where, condition) => {
  where[Op.and] ??= [];
  where[Op.and].push(condition);
};

// This function parses loose Google Reader second, millisecond, or microsecond timestamps.
export const parseReaderTimestamp = value => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  const date = parsed > 1e14
    ? new Date(parsed / 1000)
    : parsed > 1e11
      ? new Date(parsed)
      : new Date(parsed * 1000);

  return Number.isNaN(date.getTime()) ? null : date;
};

// This function parses and bounds the stream result count for one endpoint.
export const parseStreamCount = (
  values,
  maximum = MAX_STREAM_ITEM_COUNT
) => {
  if (values.length === 0) return DEFAULT_STREAM_ITEM_COUNT;
  if (values.length > 1 && new Set(values).size > 1) {
    throw new GreaderStreamError('Conflicting n parameters');
  }
  if (!/^\d+$/.test(values[0])) {
    throw new GreaderStreamError('Invalid n parameter');
  }

  return Math.min(Number(values[0]), maximum);
};

// This function parses one deterministic stream direction.
const parseStreamOrder = values => {
  if (values.length === 0) return 'd';
  if (values.some(value => !['d', 'n', 'o'].includes(value))) {
    throw new GreaderStreamError('Invalid r parameter');
  }
  const normalized = values.map(value => value === 'n' ? 'd' : value);
  if (new Set(normalized).size > 1) {
    throw new GreaderStreamError('Conflicting r parameters');
  }

  return normalized[0];
};

// This function reads one scalar parameter and rejects conflicting repetitions.
const scalarParameter = (req, name) => {
  const values = getGreaderParameterValues(req, name);
  if (values.length > 1 && new Set(values).size > 1) {
    throw new GreaderStreamError(`Conflicting ${name} parameters`);
  }

  return values[0] || '';
};

// This function resolves a feed reference only within the authenticated user.
const resolveFeedTarget = async (reference, userId) => {
  const decoded = safeDecodeURIComponent(reference);
  const where = /^\d+$/.test(decoded)
    ? { id: Number(decoded), userId }
    : { url: decoded, userId };
  const feed = await Feed.findOne({ where, attributes: ['id', 'url'] });

  return {
    id: feed
      ? `feed/${encodeURIComponent(feed.url)}`
      : `feed/${encodeURIComponent(decoded)}`,
    condition: feed
      ? { feedId: feed.id }
      : { id: { [Op.in]: [] } }
  };
};

// This function resolves a category through a relational feed predicate.
const resolveCategoryTarget = async (encodedName, userId) => {
  const name = safeDecodeURIComponent(encodedName);
  const category = await Category.findOne({
    where: { name, userId },
    attributes: ['id']
  });

  return {
    id: `${LABEL_PREFIX}${encodeURIComponent(name)}`,
    condition: category
      ? {
          feedId: {
            [Op.in]: sequelize.literal(
              `(SELECT id FROM feeds ` +
              `WHERE categoryId = ${Number(category.id)} ` +
              `AND userId = ${Number(userId)})`
            )
          }
        }
      : { id: { [Op.in]: [] } }
  };
};

// This function parses one supported Google Reader stream target.
export const parseStreamTarget = async (value, userId) => {
  const target = normalizeStreamPath(value);
  if (!target || target === 'reading-list' || target === READING_LIST_STREAM) {
    return { id: READING_LIST_STREAM, condition: null };
  }
  if (target === READ_STREAM) {
    return { id: READ_STREAM, condition: { status: 'read' } };
  }
  if (target === UNREAD_STREAM) {
    return { id: UNREAD_STREAM, condition: { status: 'unread' } };
  }
  if (target === STARRED_STREAM) {
    return { id: STARRED_STREAM, condition: { favoriteInd: 1 } };
  }
  if (target.startsWith('feed/')) {
    let reference = target;
    while (reference.startsWith('feed/')) reference = reference.substring(5);
    return resolveFeedTarget(reference, userId);
  }
  if (target.startsWith(LABEL_PREFIX)) {
    return resolveCategoryTarget(target.substring(LABEL_PREFIX.length), userId);
  }

  throw new GreaderStreamError(`Unknown stream target: ${target}`);
};

// This function combines primary stream targets as a union.
const applyPrimaryTargets = async (where, values, userId) => {
  const targets = await Promise.all(values.map(value =>
    parseStreamTarget(value, userId)
  ));
  if (targets.some(target => target.condition === null)) {
    return targets[0]?.id || READING_LIST_STREAM;
  }

  const conditions = targets.map(target => target.condition);
  appendAndCondition(where, conditions.length === 1
    ? conditions[0]
    : { [Op.or]: conditions });
  return targets[0]?.id || READING_LIST_STREAM;
};

// This function composes repeated inclusion or exclusion target filters.
const applyTargetFilters = async (where, values, userId, include) => {
  for (const value of values) {
    const target = await parseStreamTarget(value, userId);
    if (include) {
      if (target.condition) appendAndCondition(where, target.condition);
    } else if (!target.condition) {
      appendAndCondition(where, { id: { [Op.in]: [] } });
    } else {
      appendAndCondition(where, { [Op.not]: target.condition });
    }
  }
};

// This function parses a strict continuation token tied to publication ordering.
const parseContinuation = value => {
  if (!value) return null;

  const match = /^(\d+):(\d+)$/.exec(value);
  if (!match) {
    throw new GreaderStreamError('Invalid continuation token');
  }

  const publishedMs = Number(match[1]);
  const id = Number(match[2]);
  const publishedAt = new Date(publishedMs);
  if (
    !Number.isSafeInteger(publishedMs) ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    Number.isNaN(publishedAt.getTime())
  ) {
    throw new GreaderStreamError('Invalid continuation token');
  }

  return { publishedAt, id };
};

// This function applies the keyset predicate using the exact stream sort columns.
const applyContinuation = (where, continuation, order) => {
  if (!continuation) return;

  const comparison = order === 'o' ? Op.gt : Op.lt;
  appendAndCondition(where, {
    [Op.or]: [
      { publishedAt: { [comparison]: continuation.publishedAt } },
      {
        [Op.and]: [
          { publishedAt: continuation.publishedAt },
          { id: { [comparison]: continuation.id } }
        ]
      }
    ]
  });
};

// This function builds user-scoped Feed and Category joins for stream filtering.
const streamInclude = (userId, includeMetadata) => [{
  model: Feed,
  attributes: includeMetadata
    ? ['id', 'feedName', 'url', 'categoryId']
    : [],
  required: true,
  where: { userId },
  include: [{
    model: Category,
    attributes: includeMetadata ? ['id', 'name'] : [],
    required: false,
    where: { userId }
  }]
}];

// This function resolves path/query target precedence without silently changing streams.
const primaryStreamValues = req => {
  const pathTarget = normalizeStreamPath(
    req.params?.streamPath || req.params?.[0]
  );
  const queryTargets = getGreaderParameterValues(req, 's');
  if (!pathTarget) return queryTargets.length ? queryTargets : [READING_LIST_STREAM];
  if (
    queryTargets.length &&
    queryTargets.some(target => normalizeStreamPath(target) !== pathTarget)
  ) {
    throw new GreaderStreamError('Conflicting path and s stream targets');
  }

  return [pathTarget, ...queryTargets];
};

// This function builds the shared user-safe population for reads and bulk mutations.
export const buildGreaderStreamScope = async ({ req, userId }) => {
  const startTime = parseReaderTimestamp(scalarParameter(req, 'ot'));
  const stopTime = parseReaderTimestamp(scalarParameter(req, 'nt'));
  const where = { userId, ...canonicalArticleWhere() };
  const streamId = await applyPrimaryTargets(
    where,
    primaryStreamValues(req),
    userId
  );

  await applyTargetFilters(
    where,
    getGreaderParameterValues(req, 'it'),
    userId,
    true
  );
  await applyTargetFilters(
    where,
    getGreaderParameterValues(req, 'xt'),
    userId,
    false
  );

  // createdAt is RSSMonster's immutable crawl/insert time; publishedAt is publisher time.
  if (startTime) appendAndCondition(where, { createdAt: { [Op.gte]: startTime } });
  if (stopTime) appendAndCondition(where, { createdAt: { [Op.lte]: stopTime } });

  return { streamId, where };
};

// This function builds the one query contract shared by stream contents and item IDs.
export const buildGreaderStreamQuery = async ({
  req,
  userId,
  includeMetadata = false,
  maxCount = MAX_STREAM_ITEM_COUNT
}) => {
  const count = parseStreamCount(
    getGreaderParameterValues(req, 'n'),
    maxCount
  );
  const order = parseStreamOrder(getGreaderParameterValues(req, 'r'));
  const continuation = parseContinuation(scalarParameter(req, 'c'));
  const { streamId, where } = await buildGreaderStreamScope({ req, userId });
  applyContinuation(where, continuation, order);

  return {
    streamId,
    count,
    findOptions: {
      where,
      attributes: includeMetadata ? undefined : ['id', 'publishedAt'],
      include: streamInclude(userId, includeMetadata),
      order: [
        ['publishedAt', order === 'o' ? 'ASC' : 'DESC'],
        ['id', order === 'o' ? 'ASC' : 'DESC']
      ],
      limit: count + 1,
      subQuery: false
    }
  };
};

// This function executes one deterministic stream page.
export const queryGreaderStream = async options => {
  const { streamId, count, findOptions } =
    await buildGreaderStreamQuery(options);
  const articles = await Article.findAll(findOptions);
  const hasMore = articles.length > count;

  return {
    streamId,
    articles: articles.slice(0, count),
    hasMore
  };
};

// This function creates an opaque keyset token from the final emitted row.
export const createStreamContinuation = article =>
  `${new Date(article.publishedAt).getTime()}:${article.id}`;
