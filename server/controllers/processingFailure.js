import db from '../models/index.js';

const { ProcessingFailure, Sequelize } = db;
const { Op } = Sequelize;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

const occurrenceAttributes = [
  'id', 'crawlRunId', 'executionId', 'stage', 'failureType', 'severity', 'code',
  'errorName', 'message', 'subjectType', 'subjectId', 'feedId', 'articleId',
  'retryable', 'attemptNumber', 'fingerprint', 'occurredAt'
];

const detailAttributes = [
  ...occurrenceAttributes,
  'stackTrace', 'context', 'createdAt', 'updatedAt'
];

// Parses a bounded positive integer query value.
const parseBoundedInteger = (value, fallback, maximum, allowZero = false) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;

  const parsed = Number(value);
  const minimum = allowZero ? 0 : 1;
  return parsed >= minimum && parsed <= maximum ? parsed : null;
};

// Builds the current user's bounded failure filter and validates optional dimensions.
const buildFailureQuery = (req) => {
  const days = parseBoundedInteger(req.query.days, DEFAULT_DAYS, MAX_DAYS);
  const limit = parseBoundedInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parseBoundedInteger(req.query.offset, 0, Number.MAX_SAFE_INTEGER, true);
  if (days === null || limit === null || offset === null) return null;

  const availableFailureTypes = ProcessingFailure.getAttributes().failureType.values || [];
  const failureType = req.query.failureType || null;
  if (failureType && !availableFailureTypes.includes(failureType)) return null;

  const stage = req.query.stage ? String(req.query.stage).trim() : null;
  if (stage && stage.length > 64) return null;

  const occurredAtFrom = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  const where = {
    userId: req.userData.userId,
    occurredAt: { [Op.gte]: occurredAtFrom }
  };
  if (stage) where.stage = stage;
  if (failureType) where.failureType = failureType;

  return { availableFailureTypes, days, failureType, limit, offset, stage, where };
};

// Converts grouped database values into the public aggregate contract.
const buildGroup = (row, latestFailure) => ({
  fingerprint: row.fingerprint,
  occurrenceCount: Number(row.occurrenceCount) || 0,
  firstOccurredAt: row.firstOccurredAt,
  lastOccurredAt: row.lastOccurredAt,
  latestFailureId: Number(row.latestFailureId),
  stage: latestFailure?.stage || null,
  failureType: latestFailure?.failureType || null,
  severity: latestFailure?.severity || null,
  code: latestFailure?.code || null,
  errorName: latestFailure?.errorName || null,
  message: latestFailure?.message || 'Unknown processing failure'
});

// Returns user-owned processing failures aggregated by their stable fingerprint.
export const getProcessingFailureGroups = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const query = buildFailureQuery(req);
    if (!query) {
      return res.status(400).json({
        error: `Invalid filters. days must be 1-${MAX_DAYS} and limit must be 1-${MAX_LIMIT}.`
      });
    }

    const timeWhere = {
      userId,
      occurredAt: { [Op.gte]: query.where.occurredAt[Op.gte] }
    };
    const [summaryRow, totalGroups, stageRows, groupRows] = await Promise.all([
      ProcessingFailure.findOne({
        attributes: [
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalOccurrences'],
          [Sequelize.literal("SUM(CASE WHEN `severity` = 'FATAL' THEN 1 ELSE 0 END)"), 'fatalOccurrences'],
          [Sequelize.literal("SUM(CASE WHEN `failureType` = 'TIMEOUT' THEN 1 ELSE 0 END)"), 'timeoutOccurrences'],
          [Sequelize.literal('SUM(CASE WHEN `retryable` = 1 THEN 1 ELSE 0 END)'), 'retryableOccurrences']
        ],
        where: query.where,
        raw: true
      }),
      ProcessingFailure.count({
        where: query.where,
        distinct: true,
        col: 'fingerprint'
      }),
      ProcessingFailure.findAll({
        attributes: ['stage'],
        where: timeWhere,
        group: ['stage'],
        order: [['stage', 'ASC']],
        raw: true
      }),
      ProcessingFailure.findAll({
        attributes: [
          'fingerprint',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'occurrenceCount'],
          [Sequelize.fn('MIN', Sequelize.col('occurredAt')), 'firstOccurredAt'],
          [Sequelize.fn('MAX', Sequelize.col('occurredAt')), 'lastOccurredAt'],
          [Sequelize.fn('MAX', Sequelize.col('id')), 'latestFailureId']
        ],
        where: query.where,
        group: ['fingerprint'],
        order: [[Sequelize.fn('MAX', Sequelize.col('occurredAt')), 'DESC']],
        limit: query.limit,
        offset: query.offset,
        raw: true
      })
    ]);

    const latestFailureIds = groupRows.map(row => Number(row.latestFailureId));
    const latestFailures = latestFailureIds.length
      ? await ProcessingFailure.findAll({
        attributes: occurrenceAttributes,
        where: { id: { [Op.in]: latestFailureIds }, userId },
        raw: true
      })
      : [];
    const latestById = new Map(latestFailures.map(failure => [Number(failure.id), failure]));

    return res.status(200).json({
      days: query.days,
      filters: { stage: query.stage, failureType: query.failureType },
      summary: {
        totalOccurrences: Number(summaryRow?.totalOccurrences) || 0,
        groupCount: Number(totalGroups) || 0,
        fatalOccurrences: Number(summaryRow?.fatalOccurrences) || 0,
        timeoutOccurrences: Number(summaryRow?.timeoutOccurrences) || 0,
        retryableOccurrences: Number(summaryRow?.retryableOccurrences) || 0
      },
      availableStages: stageRows.map(row => row.stage),
      availableFailureTypes: query.availableFailureTypes,
      pagination: { limit: query.limit, offset: query.offset, total: Number(totalGroups) || 0 },
      groups: groupRows.map(row => buildGroup(row, latestById.get(Number(row.latestFailureId))))
    });
  } catch (err) {
    console.error('Error in getProcessingFailureGroups:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Returns the bounded occurrences represented by one user-owned fingerprint.
export const getProcessingFailureOccurrences = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }
    if (!FINGERPRINT_PATTERN.test(req.params.fingerprint || '')) {
      return res.status(400).json({ error: 'Invalid processing failure fingerprint' });
    }

    const query = buildFailureQuery(req);
    if (!query) {
      return res.status(400).json({ error: 'Invalid processing failure query' });
    }
    const where = { ...query.where, fingerprint: req.params.fingerprint };
    const { count, rows } = await ProcessingFailure.findAndCountAll({
      attributes: occurrenceAttributes,
      where,
      order: [['occurredAt', 'DESC'], ['id', 'DESC']],
      limit: query.limit,
      offset: query.offset,
      raw: true
    });

    return res.status(200).json({
      fingerprint: req.params.fingerprint,
      pagination: { limit: query.limit, offset: query.offset, total: Number(count) || 0 },
      failures: rows
    });
  } catch (err) {
    console.error('Error in getProcessingFailureOccurrences:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Returns complete diagnostics for one processing failure owned by the current user.
export const getProcessingFailureDetail = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }
    if (!/^\d+$/.test(req.params.failureId || '') || Number(req.params.failureId) < 1) {
      return res.status(400).json({ error: 'Invalid processing failure id' });
    }

    const failure = await ProcessingFailure.findOne({
      attributes: detailAttributes,
      where: { id: req.params.failureId, userId },
      raw: true
    });
    if (!failure) return res.status(404).json({ message: 'Processing failure not found' });

    return res.status(200).json({ failure });
  } catch (err) {
    console.error('Error in getProcessingFailureDetail:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Permanently clears the current user's captured processing failures.
export const clearProcessingFailures = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const deletedCount = await ProcessingFailure.destroy({ where: { userId } });
    return res.status(200).json({ deletedCount: Number(deletedCount) || 0 });
  } catch (err) {
    console.error('Error in clearProcessingFailures:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  clearProcessingFailures,
  getProcessingFailureDetail,
  getProcessingFailureGroups,
  getProcessingFailureOccurrences
};
