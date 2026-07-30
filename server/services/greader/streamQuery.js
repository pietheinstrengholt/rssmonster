import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import {
  getGreaderParameterValues,
  normalizeGreaderParameterValues
} from '../../utils/greaderParameters.js';

// Provides the shared dependencies used by this service.
const { Article, Category, Feed, sequelize } = db;

// Defines the label prefix enforced by this service.
export const LABEL_PREFIX = 'user/-/label/';
// Defines the reading list stream enforced by this service.
export const READING_LIST_STREAM = 'user/-/state/com.google/reading-list';
// Defines the read stream enforced by this service.
export const READ_STREAM = 'user/-/state/com.google/read';
// Defines the starred stream enforced by this service.
export const STARRED_STREAM = 'user/-/state/com.google/starred';
// Defines the unread stream enforced by this service.
export const UNREAD_STREAM = 'user/-/state/com.google/unread';
// Defines the default stream item count enforced by this service.
export const DEFAULT_STREAM_ITEM_COUNT = 20;
// Defines the max stream item count enforced by this service.
export const MAX_STREAM_ITEM_COUNT = 1000;
// Defines the max stream item id count enforced by this service.
export const MAX_STREAM_ITEM_ID_COUNT = 10000;

// This class identifies invalid Google Reader stream requests.
export class GreaderStreamError extends Error {
  // Performs the constructor operation.
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
  // Coerces the parsed into the representation required while parsing reader timestamp.
  const parsed = Number(value);
  // Returns no result when parsed is not finite or parsed is at most value.
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  // Selects the date based on whether parsed exceeds 100000000000000.
  const date = parsed > 1e14
    ? new Date(parsed / 1000)
    : parsed > 1e11
      ? new Date(parsed)
      : new Date(parsed * 1000);

  // Selects the result based on whether get time is na n.
  return Number.isNaN(date.getTime()) ? null : date;
};

// This function parses and bounds the stream result count for one endpoint.
export const parseStreamCount = (
  values,
  maximum = MAX_STREAM_ITEM_COUNT
) => {
  // Returns early when values count is value.
  if (values.length === 0) return DEFAULT_STREAM_ITEM_COUNT;
  // Rejects processing when values count exceeds 1 and set size exceeds 1.
  if (values.length > 1 && new Set(values).size > 1) {
    throw new GreaderStreamError('Conflicting n parameters');
  }
  // Rejects processing when values 0 does not match the expected format.
  if (!/^\d+$/.test(values[0])) {
    throw new GreaderStreamError('Invalid n parameter');
  }

  return Math.min(Number(values[0]), maximum);
};

// This function parses one deterministic stream direction.
const parseStreamOrder = values => {
  // Returns early when values count is value.
  if (values.length === 0) return 'd';
  // Rejects sort directions outside the supported Google Reader values.
  if (values.some(value => !['d', 'n', 'o'].includes(value))) {
    throw new GreaderStreamError('Invalid r parameter');
  }
  // Selects the normalized based on whether value is n.
  const normalized = values.map(value => value === 'n' ? 'd' : value);
  // Rejects processing when set size exceeds 1.
  if (new Set(normalized).size > 1) {
    throw new GreaderStreamError('Conflicting r parameters');
  }

  return normalized[0];
};

// This function reads one scalar parameter and rejects conflicting repetitions.
const scalarParameter = (req, name) => {
  // Derives the values through get greader parameter values while performing scalar parameter.
  const values = getGreaderParameterValues(req, name);
  // Rejects processing when values count exceeds 1 and set size exceeds 1.
  if (values.length > 1 && new Set(values).size > 1) {
    throw new GreaderStreamError(`Conflicting ${name} parameters`);
  }

  return values[0] || '';
};

// This function resolves a feed reference only within the authenticated user.
const resolveFeedTarget = async (reference, userId) => {
  // Derives the decoded through safe decode uricomponent while resolving feed target.
  const decoded = safeDecodeURIComponent(reference);
  // Selects the where based on whether decoded matches the expected format.
  const where = /^\d+$/.test(decoded)
    ? { id: Number(decoded), userId }
    : { url: decoded, userId };
  // Loads the feed needed while resolving feed target.
  const feed = await Feed.findOne({ where, attributes: ['id', 'url'] });

  // Selects the result based on whether feed is available.
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
  // Derives the name through safe decode uricomponent while resolving category target.
  const name = safeDecodeURIComponent(encodedName);
  // Loads the category needed while resolving category target.
  const category = await Category.findOne({
    where: { name, userId },
    attributes: ['id']
  });

  // Selects the result based on whether category is available.
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
  // Normalizes the target before parsing stream target.
  const target = normalizeStreamPath(value);
  // Returns early when target is unavailable or target is reading list or target is reading list stream.
  if (!target || target === 'reading-list' || target === READING_LIST_STREAM) {
    return { id: READING_LIST_STREAM, condition: null };
  }
  // Returns early when target is read stream.
  if (target === READ_STREAM) {
    return { id: READ_STREAM, condition: { status: 'read' } };
  }
  // Returns early when target is unread stream.
  if (target === UNREAD_STREAM) {
    return { id: UNREAD_STREAM, condition: { status: 'unread' } };
  }
  // Returns early when target is starred stream.
  if (target === STARRED_STREAM) {
    return { id: STARRED_STREAM, condition: { favoriteInd: 1 } };
  }
  // Handles the case where starts with succeeds.
  if (target.startsWith('feed/')) {
    let reference = target;
    // Repeats this processing step while eligible work remains.
    while (reference.startsWith('feed/')) reference = reference.substring(5);
    return resolveFeedTarget(reference, userId);
  }
  // Returns early when starts with succeeds.
  if (target.startsWith(LABEL_PREFIX)) {
    return resolveCategoryTarget(target.substring(LABEL_PREFIX.length), userId);
  }

  throw new GreaderStreamError(`Unknown stream target: ${target}`);
};

// This function combines primary stream targets as a union.
const applyPrimaryTargets = async (where, values, userId) => {
  // Derives the targets through all while applying primary targets.
  const targets = await Promise.all(values.map(value =>
    parseStreamTarget(value, userId)
  ));
  // Falls back to the reading-list stream when a target has no query condition.
  if (targets.some(target => target.condition === null)) {
    return targets[0]?.id || READING_LIST_STREAM;
  }

  // Transforms source values into the conditions required while applying primary targets.
  const conditions = targets.map(target => target.condition);
  // Selects the result based on whether conditions count is 1.
  appendAndCondition(where, conditions.length === 1
    ? conditions[0]
    : { [Op.or]: conditions });
  return targets[0]?.id || READING_LIST_STREAM;
};

// This function composes repeated inclusion or exclusion target filters.
const applyTargetFilters = async (where, values, userId, include) => {
  // Processes each values entry in turn.
  for (const value of values) {
    // Parses the stream target while applying target filters.
    const target = await parseStreamTarget(value, userId);
    // Handles the case where include is available.
    if (include) {
      // Handles the case where target condition is available.
      if (target.condition) appendAndCondition(where, target.condition);
    // Handles the case where target condition is unavailable.
    } else if (!target.condition) {
      appendAndCondition(where, { id: { [Op.in]: [] } });
    } else {
      appendAndCondition(where, { [Op.not]: target.condition });
    }
  }
};

// This function parses a strict continuation token tied to publication ordering.
const parseContinuation = value => {
  // Returns no result when value is unavailable.
  if (!value) return null;

  // Derives the match through exec while parsing continuation.
  const match = /^(\d+):(\d+)$/.exec(value);
  // Rejects processing when match is unavailable.
  if (!match) {
    throw new GreaderStreamError('Invalid continuation token');
  }

  // Coerces the published ms into the representation required while parsing continuation.
  const publishedMs = Number(match[1]);
  // Coerces the id into the representation required while parsing continuation.
  const id = Number(match[2]);
  // Normalizes the published at used while parsing continuation.
  const publishedAt = new Date(publishedMs);
  // Rejects processing when published ms is not safe integer or id is not safe integer or id is at most value or get time is na n.
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
  // Returns early when continuation is unavailable.
  if (!continuation) return;

  // Selects the comparison based on whether order is o.
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
  // Normalizes the path target before performing primary stream values.
  const pathTarget = normalizeStreamPath(
    req.params?.streamPath || req.params?.[0]
  );
  // Derives the query targets through get greader parameter values while performing primary stream values.
  const queryTargets = getGreaderParameterValues(req, 's');
  // Returns early when path target is unavailable.
  if (!pathTarget) return queryTargets.length ? queryTargets : [READING_LIST_STREAM];
  // Rejects conflicting path and query stream targets.
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
  // Parses the reader timestamp while building greader stream scope.
  const startTime = parseReaderTimestamp(scalarParameter(req, 'ot'));
  // Parses the reader timestamp while building greader stream scope.
  const stopTime = parseReaderTimestamp(scalarParameter(req, 'nt'));
  // Builds the where assembled while building greader stream scope.
  const where = { userId, ...canonicalArticleWhere() };
  // Derives the stream id through apply primary targets while building greader stream scope.
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
  // Handles the case where stop time is available.
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
  // Parses the stream count while building greader stream query.
  const count = parseStreamCount(
    getGreaderParameterValues(req, 'n'),
    maxCount
  );
  // Parses the stream order while building greader stream query.
  const order = parseStreamOrder(getGreaderParameterValues(req, 'r'));
  // Parses the continuation while building greader stream query.
  const continuation = parseContinuation(scalarParameter(req, 'c'));
  // Builds the greader stream scope while building greader stream query.
  const { streamId, where } = await buildGreaderStreamScope({ req, userId });
  applyContinuation(where, continuation, order);

  // Selects the result based on whether include metadata is available.
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
  // Builds the greader stream query while performing query greader stream.
  const { streamId, count, findOptions } =
    await buildGreaderStreamQuery(options);
  // Loads the articles needed while performing query greader stream.
  const articles = await Article.findAll(findOptions);
  // Derives the has more required while performing query greader stream.
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
