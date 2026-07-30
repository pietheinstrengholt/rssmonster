import db from '../../models/index.js';
import { Op } from 'sequelize';
import {
  EVENT_MAX_GAP_HOURS,
  MAX_CANDIDATES
} from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { articleEventTimestamp, HOUR_MS } from './articleEventTime.js';

// Provides the shared dependencies used by this service.
const { Article } = db;
// Defines the cache buffer hours enforced by this service.
const CACHE_BUFFER_HOURS = Number.parseInt(process.env.EVENT_CACHE_BUFFER_HOURS || '2', 10);
// Defines the stopwords enforced by this service.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for',
  'from', 'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or',
  'that', 'the', 'their', 'this', 'to', 'was', 'were', 'will', 'with'
]);

// This function builds the same headline token set used during event matching.
function tokenSet(text = '') {
  // Maps source values into the result produced while performing token set.
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(token => token.trim())
      .filter(token => token.length > 2 && !STOPWORDS.has(token))
  );
}

// This function extracts lightweight entity hints once when a record enters the cache.
function entitySet(article = {}) {
  // Derives the text required while performing entity set.
  const text = `${article.title || ''} ${article.description || ''}`;
  // Collects matches for the selection made while performing entity set.
  const matches = text.match(/\b([A-Z][a-z]{2,}|[A-Z]{2,})\b/g) || [];
  // Maps source values into the result produced while performing entity set.
  return new Set(matches.map(value => value.toLowerCase()));
}

// This function normalizes a vector once before it enters the candidate cache.
function normalizeVector(vector) {
  // Returns no result when vector is not an array or vector is empty.
  if (!Array.isArray(vector) || !vector.length) return null;

  let norm = 0;
  // Processes each vector entry in turn.
  for (const value of vector) {
    norm += value * value;
  }

  // Returns no result when norm is unavailable.
  if (!norm) return null;

  // Derives the divisor through sqrt while normalizing vector.
  const divisor = Math.sqrt(norm);
  // Maps source values into the result produced while normalizing vector.
  return vector.map(value => value / divisor);
}

// This function maps a date-like article timestamp into an hourly bucket key.
function hourBucketForArticle(article) {
  // Derives the timestamp through article event timestamp while performing hour bucket for article.
  const timestamp = articleEventTimestamp(article);
  // Returns no result when timestamp is not finite.
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor(timestamp / HOUR_MS);
}

// This cache stores recent article candidates for one clustering run.
export default class ArticleEventCandidateCache {
  // Performs the constructor operation.
  constructor({ userId, windowHours = EVENT_MAX_GAP_HOURS + CACHE_BUFFER_HOURS } = {}) {
    this.userId = userId;
    this.windowHours = windowHours;
    this.buckets = new Map();
    this.articleIndex = new Map();
  }

  // This function loads candidate articles from the rolling event window.
  static async forUser(userId, options = {}) {
    // Derives the cache required while performing for user.
    const cache = new ArticleEventCandidateCache({ userId });
    const windowHours = cache.windowHours;
    // Selects the reference date based on whether options reference date is available.
    const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
    // Normalizes the cutoff used while performing for user.
    const cutoff = new Date(referenceDate.getTime() - windowHours * HOUR_MS);
    // Selects the exclude article id based on whether options exclude article id is an array.
    const excludeArticleIds = Array.isArray(options.excludeArticleIds)
      ? options.excludeArticleIds.map(Number).filter(Boolean)
      : [];
    // Builds the where assembled while performing for user.
    const where = {
      userId,
      ...canonicalArticleWhere(),
      publishedAt: { [Op.gte]: cutoff },
      articleVector: { [Op.ne]: null }
    };

    // Handles the case where exclude article id is non-empty.
    if (excludeArticleIds.length) {
      where.id = { [Op.notIn]: excludeArticleIds };
    }

    // Loads the articles needed while performing for user.
    const articles = await Article.findAll({
      where,
      attributes: [
        'id',
        'userId',
        'feedId',
        'eventId',
        'title',
        'description',
        'publishedAt',
        'createdAt',
        'articleVector'
      ],
      order: [
        ['publishedAt', 'DESC'],
        ['id', 'DESC']
      ],
      limit: options.limit || MAX_CANDIDATES * 4
    });

    // Processes each articles entry in turn.
    for (const article of articles) {
      cache.insert(article);
    }

    return cache;
  }

  // This function converts a Sequelize article or plain record into the cache shape.
  toRecord(article, options = {}) {
    // Selects the event vector based on whether event vector is an array.
    const eventVector = Array.isArray(article?.eventVector)
      ? article.eventVector
      : article?.articleVector;
    // Derives the normalized event vector required while performing to record.
    const normalizedEventVector = article?.normalizedEventVector || normalizeVector(eventVector);
    // Derives the hour bucket through hour bucket for article while performing to record.
    const hourBucket = hourBucketForArticle(article);

    // Returns no result when normalized event vector is unavailable or hour bucket is value.
    if (!normalizedEventVector || hourBucket == null) return null;

    // Selects the result based on whether article is available.
    return {
      id: article.id,
      userId: article.userId,
      feedId: article.feedId,
      eventId: article.eventId ?? null,
      title: article.title,
      description: article.description,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      eventVector,
      normalizedEventVector,
      tokenSet: article.tokenSet instanceof Set ? article.tokenSet : tokenSet(article.title),
      entitySet: article.entitySet instanceof Set ? article.entitySet : entitySet(article),
      currentRun: Boolean(options.currentRun),
      hourBucket
    };
  }

  // This function inserts or replaces one article candidate in the cache.
  insert(article, options = {}) {
    // Derives the record through to record while performing insert.
    const record = this.toRecord(article, options);
    // Returns no result when record is unavailable.
    if (!record) return null;

    this.remove(record.id);

    // Derives the bucket required while performing insert.
    const bucket = this.buckets.get(record.hourBucket) || [];
    bucket.push(record);
    this.buckets.set(record.hourBucket, bucket);
    this.articleIndex.set(record.id, record.hourBucket);

    return record;
  }

  // This function updates one cached article and keeps its bucket placement valid.
  update(article) {
    return this.insert(article, { currentRun: true });
  }

  // This function patches only the event assignment for cached articles.
  updateEventId(articleIds, eventId) {
    // Processes each article id entry in turn.
    for (const articleId of articleIds) {
      // Derives the bucket key through get while updating event id.
      const bucketKey = this.articleIndex.get(articleId);
      // Skips the current entry when bucket key is value.
      if (bucketKey == null) continue;

      // Derives the bucket required while updating event id.
      const bucket = this.buckets.get(bucketKey) || [];
      // Loads the record needed while updating event id.
      const record = bucket.find(candidate => Number(candidate.id) === Number(articleId));
      // Handles the case where record is available.
      if (record) {
        record.eventId = eventId ?? null;
      }
    }
  }

  // This function removes one cached article by id.
  remove(articleId) {
    // Derives the bucket key through get while performing remove.
    const bucketKey = this.articleIndex.get(articleId);
    // Returns early when bucket key is value.
    if (bucketKey == null) return;

    // Derives the bucket required while performing remove.
    const bucket = this.buckets.get(bucketKey) || [];
    // Keeps the next bucket entries eligible while performing remove.
    const nextBucket = bucket.filter(record => Number(record.id) !== Number(articleId));

    // Handles the case where next bucket is non-empty.
    if (nextBucket.length) {
      this.buckets.set(bucketKey, nextBucket);
    } else {
      this.buckets.delete(bucketKey);
    }

    this.articleIndex.delete(articleId);
  }

  // This function finds cached candidates within the hard event matching window.
  findNearby(article) {
    // Derives the article ts through article event timestamp while finding nearby.
    const articleTs = articleEventTimestamp(article);
    // Returns an empty result when article ts is not finite.
    if (!Number.isFinite(articleTs)) return [];

    // Derives the article bucket through floor while finding nearby.
    const articleBucket = Math.floor(articleTs / HOUR_MS);
    // Derives the window buckets through ceil while finding nearby.
    const windowBuckets = Math.ceil(EVENT_MAX_GAP_HOURS);
    // Collects the candidates while finding nearby.
    const candidates = [];

    // Repeats this processing step while eligible work remains.
    for (let bucketKey = articleBucket - windowBuckets; bucketKey <= articleBucket + windowBuckets; bucketKey++) {
      // Processes each entry entry in turn.
      for (const candidate of this.buckets.get(bucketKey) || []) {
        // Skips the current entry when number is number.
        if (Number(candidate.id) === Number(article.id)) continue;
        // Skips the current entry when number is not number.
        if (Number(candidate.userId) !== Number(article.userId)) continue;

        // Derives the candidate ts through article event timestamp while finding nearby.
        const candidateTs = articleEventTimestamp(candidate);
        // Skips the current entry when candidate ts is not finite.
        if (!Number.isFinite(candidateTs)) continue;
        // Skips the current entry when abs exceeds event max gap hours.
        if (Math.abs(articleTs - candidateTs) > EVENT_MAX_GAP_HOURS * HOUR_MS) continue;

        candidates.push(candidate);
      }
    }

    // Orders values deterministically while finding nearby.
    candidates.sort((left, right) => {
      // Derives the left distance through abs while finding nearby.
      const leftDistance = Math.abs(articleTs - articleEventTimestamp(left));
      // Derives the right distance through abs while finding nearby.
      const rightDistance = Math.abs(articleTs - articleEventTimestamp(right));

      return leftDistance - rightDistance ||
        Number(right.currentRun) - Number(left.currentRun) ||
        Number(right.id) - Number(left.id);
    });

    return candidates.slice(0, MAX_CANDIDATES);
  }

  // This function drops buckets that are outside the rolling cache window.
  removeExpired(referenceDate = new Date()) {
    // Derives the cutoff bucket through floor while performing remove expired.
    const cutoffBucket = Math.floor(
      (new Date(referenceDate).getTime() - this.windowHours * HOUR_MS) / HOUR_MS
    );

    // Processes each keys entry in turn.
    for (const bucketKey of this.buckets.keys()) {
      // Skips the current entry when bucket key reaches cutoff bucket.
      if (bucketKey >= cutoffBucket) continue;

      // Processes each entry entry in turn.
      for (const record of this.buckets.get(bucketKey) || []) {
        this.articleIndex.delete(record.id);
      }

      this.buckets.delete(bucketKey);
    }
  }
}
