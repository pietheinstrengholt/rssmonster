import db from '../../models/index.js';
import { Op } from 'sequelize';
import {
  EVENT_MAX_GAP_HOURS,
  MAX_CANDIDATES
} from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { articleEventTimestamp, HOUR_MS } from './articleEventTime.js';

const { Article } = db;
const CACHE_BUFFER_HOURS = Number.parseInt(process.env.EVENT_CACHE_BUFFER_HOURS || '2', 10);
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for',
  'from', 'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or',
  'that', 'the', 'their', 'this', 'to', 'was', 'were', 'will', 'with'
]);

// This function builds the same headline token set used during event matching.
function tokenSet(text = '') {
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
  const text = `${article.title || ''} ${article.description || ''}`;
  const matches = text.match(/\b([A-Z][a-z]{2,}|[A-Z]{2,})\b/g) || [];
  return new Set(matches.map(value => value.toLowerCase()));
}

// This function normalizes a vector once before it enters the candidate cache.
function normalizeVector(vector) {
  if (!Array.isArray(vector) || !vector.length) return null;

  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }

  if (!norm) return null;

  const divisor = Math.sqrt(norm);
  return vector.map(value => value / divisor);
}

// This function maps a date-like article timestamp into an hourly bucket key.
function hourBucketForArticle(article) {
  const timestamp = articleEventTimestamp(article);
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor(timestamp / HOUR_MS);
}

// This cache stores recent article candidates for one clustering run.
export default class ArticleEventCandidateCache {
  constructor({ userId, windowHours = EVENT_MAX_GAP_HOURS + CACHE_BUFFER_HOURS } = {}) {
    this.userId = userId;
    this.windowHours = windowHours;
    this.buckets = new Map();
    this.articleIndex = new Map();
  }

  // This function loads candidate articles from the rolling event window.
  static async forUser(userId, options = {}) {
    const cache = new ArticleEventCandidateCache({ userId });
    const windowHours = cache.windowHours;
    const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
    const cutoff = new Date(referenceDate.getTime() - windowHours * HOUR_MS);
    const excludeArticleIds = Array.isArray(options.excludeArticleIds)
      ? options.excludeArticleIds.map(Number).filter(Boolean)
      : [];
    const where = {
      userId,
      ...canonicalArticleWhere(),
      published: { [Op.gte]: cutoff },
      articleVector: { [Op.ne]: null }
    };

    if (excludeArticleIds.length) {
      where.id = { [Op.notIn]: excludeArticleIds };
    }

    const articles = await Article.findAll({
      where,
      attributes: [
        'id',
        'userId',
        'feedId',
        'eventId',
        'title',
        'description',
        'published',
        'createdAt',
        'articleVector'
      ],
      order: [
        ['published', 'ASC'],
        ['id', 'ASC']
      ],
      limit: options.limit || MAX_CANDIDATES * 4
    });

    for (const article of articles) {
      cache.insert(article);
    }

    return cache;
  }

  // This function converts a Sequelize article or plain record into the cache shape.
  toRecord(article) {
    const eventVector = Array.isArray(article?.eventVector)
      ? article.eventVector
      : article?.articleVector;
    const normalizedEventVector = article?.normalizedEventVector || normalizeVector(eventVector);
    const hourBucket = hourBucketForArticle(article);

    if (!normalizedEventVector || hourBucket == null) return null;

    return {
      id: article.id,
      userId: article.userId,
      feedId: article.feedId,
      eventId: article.eventId ?? null,
      title: article.title,
      description: article.description,
      published: article.published,
      createdAt: article.createdAt,
      eventVector,
      normalizedEventVector,
      tokenSet: article.tokenSet instanceof Set ? article.tokenSet : tokenSet(article.title),
      entitySet: article.entitySet instanceof Set ? article.entitySet : entitySet(article),
      hourBucket
    };
  }

  // This function inserts or replaces one article candidate in the cache.
  insert(article) {
    const record = this.toRecord(article);
    if (!record) return null;

    this.remove(record.id);

    const bucket = this.buckets.get(record.hourBucket) || [];
    bucket.push(record);
    this.buckets.set(record.hourBucket, bucket);
    this.articleIndex.set(record.id, record.hourBucket);

    return record;
  }

  // This function updates one cached article and keeps its bucket placement valid.
  update(article) {
    return this.insert(article);
  }

  // This function patches only the event assignment for cached articles.
  updateEventId(articleIds, eventId) {
    for (const articleId of articleIds) {
      const bucketKey = this.articleIndex.get(articleId);
      if (bucketKey == null) continue;

      const bucket = this.buckets.get(bucketKey) || [];
      const record = bucket.find(candidate => Number(candidate.id) === Number(articleId));
      if (record) {
        record.eventId = eventId ?? null;
      }
    }
  }

  // This function removes one cached article by id.
  remove(articleId) {
    const bucketKey = this.articleIndex.get(articleId);
    if (bucketKey == null) return;

    const bucket = this.buckets.get(bucketKey) || [];
    const nextBucket = bucket.filter(record => Number(record.id) !== Number(articleId));

    if (nextBucket.length) {
      this.buckets.set(bucketKey, nextBucket);
    } else {
      this.buckets.delete(bucketKey);
    }

    this.articleIndex.delete(articleId);
  }

  // This function finds cached candidates within the hard event matching window.
  findNearby(article) {
    const articleTs = articleEventTimestamp(article);
    if (!Number.isFinite(articleTs)) return [];

    const articleBucket = Math.floor(articleTs / HOUR_MS);
    const windowBuckets = Math.ceil(EVENT_MAX_GAP_HOURS);
    const candidates = [];

    for (let bucketKey = articleBucket - windowBuckets; bucketKey <= articleBucket + windowBuckets; bucketKey++) {
      for (const candidate of this.buckets.get(bucketKey) || []) {
        if (Number(candidate.id) === Number(article.id)) continue;
        if (Number(candidate.userId) !== Number(article.userId)) continue;

        const candidateTs = articleEventTimestamp(candidate);
        if (!Number.isFinite(candidateTs)) continue;
        if (Math.abs(articleTs - candidateTs) > EVENT_MAX_GAP_HOURS * HOUR_MS) continue;

        candidates.push(candidate);
      }
    }

    return candidates.slice(0, MAX_CANDIDATES);
  }

  // This function drops buckets that are outside the rolling cache window.
  removeExpired(referenceDate = new Date()) {
    const cutoffBucket = Math.floor(
      (new Date(referenceDate).getTime() - this.windowHours * HOUR_MS) / HOUR_MS
    );

    for (const bucketKey of this.buckets.keys()) {
      if (bucketKey >= cutoffBucket) continue;

      for (const record of this.buckets.get(bucketKey) || []) {
        this.articleIndex.delete(record.id);
      }

      this.buckets.delete(bucketKey);
    }
  }
}
