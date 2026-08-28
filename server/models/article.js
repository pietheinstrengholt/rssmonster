import { DataTypes } from 'sequelize';
import { createHash } from 'node:crypto';
import normalizeUrl from '../services/crawl/content/normalizeUrl.js';
import { hashOriginalContent, hashVisibleText } from '../utils/articleContentHashes.js';
import { unsignedIntegerType } from './databaseTypes.js';

const TAU_HOURS = 48; // tune this globally
const NEUTRAL_FEED_TRUST = 0.75;
const MIN_FEED_CONFIDENCE_SAMPLES = 10;
const FULL_FEED_CONFIDENCE_SAMPLES = 100;
const MAX_FEED_TRUST_BOOST = 0.10;
const MAX_FEED_TRUST_PENALTY = 0.15;
const MAX_FEED_DUPLICATION_PENALTY = 0.10;

export const ARTICLE_AI_ANALYSIS_STATUSES = Object.freeze([
  'pending',
  'processing',
  'complete',
  'skipped',
  'failed'
]);

// This function returns the stable SHA-256 identity for text content.
const hashValue = value => createHash('sha256').update(value || '').digest('hex');

// This function derives stable database identities for article URLs and content.
const populateArticleHashes = article => {
  if (article.url && !article.urlHash) {
    article.urlHash = hashValue(article.url);
  }
  if (article.url && !article.normalizedUrl) {
    article.normalizedUrl = normalizeUrl(article.url);
  }
  if (article.normalizedUrl && !article.normalizedUrlHash) {
    article.normalizedUrlHash = hashValue(article.normalizedUrl);
  }
  if (!article.contentTextHash && article.contentText) {
    article.contentTextHash = hashVisibleText(article.contentText);
  }
  // Missing source content must remain null so description-only articles do not share an empty hash.
  if (!article.contentSourceHash && article.contentOriginal) {
    article.contentSourceHash = hashOriginalContent(article.contentOriginal);
  }
};

// This function clamps a numeric score into a bounded range.
const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

// This function reads a numeric value from a Sequelize model or plain object.
const numericValue = (source, key, fallback = 0) => {
  const value = typeof source?.getDataValue === 'function'
    ? source.getDataValue(key)
    : source?.[key];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

// This function returns how much feed-level metrics should influence article quality.
const feedQualityConfidence = feed => {
  const sampleSize = Math.max(numericValue(feed, 'feedAttentionSampleSize', 0), 0);
  return clamp(
    (sampleSize - MIN_FEED_CONFIDENCE_SAMPLES) /
      (FULL_FEED_CONFIDENCE_SAMPLES - MIN_FEED_CONFIDENCE_SAMPLES)
  );
};

// This function gently adjusts article quality using feed trust and duplication history.
const applyFeedQualityAdjustment = (baseQuality, feed) => {
  if (!feed) return baseQuality;

  const confidence = feedQualityConfidence(feed);
  if (confidence <= 0) return baseQuality;

  const feedTrust = clamp(numericValue(feed, 'feedTrust', NEUTRAL_FEED_TRUST));
  const duplicationRate = clamp(numericValue(feed, 'feedDuplicationRate', 0));
  const trustAdjustment = feedTrust >= NEUTRAL_FEED_TRUST
    ? ((feedTrust - NEUTRAL_FEED_TRUST) / (1 - NEUTRAL_FEED_TRUST)) * MAX_FEED_TRUST_BOOST
    : -((NEUTRAL_FEED_TRUST - feedTrust) / NEUTRAL_FEED_TRUST) * MAX_FEED_TRUST_PENALTY;
  const duplicationPenalty = duplicationRate * MAX_FEED_DUPLICATION_PENALTY;
  const multiplier = clamp(
    1 + confidence * (trustAdjustment - duplicationPenalty),
    1 - MAX_FEED_TRUST_PENALTY,
    1 + MAX_FEED_TRUST_BOOST
  );

  return clamp(baseQuality * multiplier);
};

export default (sequelize) => {
  const Article = sequelize.define(
    'articles',
    {
      // Provides the stable identifier for this stored feed article.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Stores the publisher-provided article identity; null when the feed supplies none.
      externalId: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        defaultValue: null
      },
      // Records the publisher identity source, such as a GUID or URL; null with no external identity.
      externalIdType: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: null
      },
      // Identifies the user who owns this article and its derived data.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Identifies the subscribed feed from which this article was ingested.
      feedId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Tracks the reading state, defaulting to unread and also supporting duplicate suppression.
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'unread'
      },
      // Marks articles discarded by an action so they remain stored but are excluded from user and semantic queries.
      filteredInd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Links a duplicate to its canonical article; null when this article is canonical.
      duplicateOfArticleId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Counts duplicate articles consolidated under this canonical article.
      duplicateCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Marks whether the user has saved the article as a favorite.
      favoriteInd: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Marks explicit negative-interest feedback for behavioral learning.
      negativeInd: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Marks explicit positive-interest feedback for behavioral learning.
      positiveInd: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Counts the user's outbound link clicks from this article.
      clickedAmount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Marks whether the article contains at least one collected outbound hotlink.
      hotInd: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Counts outbound hotlinks collected from the article content.
      hotlinks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Stores normalized media attachments; null when the article has no supported media.
      media: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null
      },
      // Stores the safe publisher URL used to open the article; null for linkless feed entries.
      url: {
        type: DataTypes.STRING(1024),
        allowNull: true
      },
      // Stores the SHA-256 publisher URL identity; null when no external URL exists.
      urlHash: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      // Stores the canonicalized article URL; null for linkless feed entries.
      normalizedUrl: {
        type: DataTypes.STRING(1024),
        allowNull: true
      },
      // Stores the canonical URL identity; null when no external URL exists.
      normalizedUrlHash: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      // Stores the selected lead-image URL; null when no suitable image is found.
      imageUrl: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Stores the selected lead image's pixel width; null when unknown.
      imageWidth: {
        type: unsignedIntegerType(sequelize),
        allowNull: true
      },
      // Stores the selected lead image's pixel height; null when unknown.
      imageHeight: {
        type: unsignedIntegerType(sequelize),
        allowNull: true
      },
      // Stores the selected lead image's media type; null when unknown.
      imageMimeType: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      // Records where the lead image was discovered; null when no source is selected.
      imageSource: {
        type: DataTypes.ENUM(
          'media-content',
          'media-thumbnail',
          'enclosure',
          'cleaned-content',
          'content',
          'description',
          'publisher'
        ),
        allowNull: true
      },
      // Stores the article headline displayed to the user.
      title: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      // Stores the publisher-provided author text; null when the feed omits it.
      author: DataTypes.TEXT,
      // Stores the publisher-provided article description; null when the feed omits it.
      description: DataTypes.TEXT('medium'),
      // Stores sanitized display HTML derived from the raw publisher description.
      descriptionHtml: {
        type: DataTypes.TEXT('medium'),
        allowNull: true,
        defaultValue: null
      },
      // Stores visible text derived from the raw publisher description.
      descriptionText: {
        type: DataTypes.TEXT('medium'),
        allowNull: true,
        defaultValue: null
      },
      // Preserves the raw feed content for processing; null when no source body is available.
      contentOriginal: {
        type: DataTypes.TEXT('medium'),
        allowNull: true,
        defaultValue: null
      },
      // Stores sanitized display HTML derived from source content; null when unavailable.
      contentHtml: {
        type: DataTypes.TEXT('medium'),
        allowNull: true,
        defaultValue: null
      },
      // Stores visible plain text used for analysis and embeddings; null when unavailable.
      contentText: {
        type: DataTypes.TEXT('medium'),
        allowNull: true,
        defaultValue: null
      },
      // Exposes sanitized HTML through the legacy content property without storing another copy.
      content: {
        type: DataTypes.VIRTUAL(DataTypes.TEXT),
        get() {
          return this.getDataValue('contentHtml');
        }
      },
      // Stores the SHA-256 identity of normalized visible text; null when no text is available.
      contentTextHash: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      // Stores AI-generated factual summary bullets; null when analysis has not produced them.
      contentSummaryBullets: {
        type: DataTypes.JSON,
        allowNull: true
      },
      // Tracks whether optional article classification is queued, running, complete, skipped, or failed.
      aiAnalysisStatus: {
        type: DataTypes.ENUM(...ARTICLE_AI_ANALYSIS_STATUSES),
        allowNull: false,
        defaultValue: 'complete'
      },
      // Records when the current article version last completed optional AI analysis.
      aiAnalysisCompletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Stores the SHA-256 identity of normalized source content; null when no source body exists.
      contentSourceHash: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      // Marks whether the article URL matches an enabled official-source domain for its user.
      isOfficialSource: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Names the matched official organization; null when no official source matches.
      officialOrganization: {
        type: DataTypes.STRING(128),
        allowNull: true,
        defaultValue: null
      },
      // Records which embedding model produced the article vector; null before embedding.
      embedding_model: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      // Stores the article embedding for semantic processing; null when pending, disabled, or failed.
      articleVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      // Links to the article's semantic event; null before assignment or for standalone articles.
      eventId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Indicates whether this unread article is its event's non-representative developing-story selection.
      isDevelopingStory: {
        type: DataTypes.VIRTUAL(DataTypes.BOOLEAN),
        get() {
          const event = this.get('event');
          if (!event) return false;

          const articleId = Number(this.getDataValue('id'));
          const representativeArticleId = Number(event.representativeArticleId);
          const developingArticleId = event.developingArticleId == null
            ? null
            : Number(event.developingArticleId);

          return (
            this.getDataValue('status') === 'unread' &&
            developingArticleId != null &&
            developingArticleId !== representativeArticleId &&
            articleId === developingArticleId
          );
        }
      },
      // Caches the article's primary event topic for direct queries; null before topic assignment.
      topicId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Stores the feed-provided article language; null when unspecified.
      language: DataTypes.TEXT('tiny'),
      // Scores the absence of promotional content from 0 to 100, defaulting to zero.
      advertisementScore: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Scores emotional neutrality and tone quality from 0 to 100, defaulting to 50.
      sentimentScore: {
        type: DataTypes.INTEGER,
        defaultValue: 50
      },
      // Scores writing and informational quality from 0 to 100, defaulting to 50.
      qualityScore: {
        type: DataTypes.INTEGER,
        defaultValue: 50
      },
      // Stores the predicted user-interest affinity, with zero representing no match.
      interestScore: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Attention bucket (0–4)
      // 0 = not read / passed
      // 1 = skimmed
      // 2 = read
      // 3 = deep read
      // 4 = highly engaged
      // Classifies engagement from zero for passed through four for highly engaged.
      attentionBucket: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
      },
      // Derives normalized engagement from the attention bucket with a bounded click boost.
      attentionScore: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          /**
           * Attention score (0–1)
           *
           * Derived from:
           * - attentionBucket (primary signal)
           * - clickedAmount (outbound engagement)
           *
           * Bucket semantics:
           * 0 = passed
           * 1 = skimmed
           * 2 = read
           * 3 = deep read
           * 4 = highly engaged
           */

          const bucket = this.getDataValue('attentionBucket') ?? 0;
          const clickedAmount = this.getDataValue('clickedAmount') ?? 0;

          // Base score from bucket (dominant signal)
          let base;
          switch (bucket) {
            case 1: base = 0.25; break;
            case 2: base = 0.5;  break;
            case 3: base = 0.75; break;
            case 4: base = 1.0;  break;
            default: return 0.0; // bucket 0 → no attention
          }

          // Logarithmic reinforcement (bounded, non-dominant)
          const clickBoost = Math.min(Math.log2(clickedAmount + 1) / 5, 0.15);

          return Math.min(
            Number((base + clickBoost).toFixed(4)),
            1
          );
        }
      },
      // Freshness score: >0.7 = today, 0.3–0.7 = recent (1–2 days), 0.1–0.3 = aging, <0.1 = stale
      // Derives time-decayed freshness from publication time, returning zero when unavailable.
      freshness: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          const publishedAt = this.getDataValue('publishedAt');
          if (!publishedAt) return 0;

          const ageMs = Date.now() - new Date(publishedAt).getTime();
          const ageHours = ageMs / (1000 * 60 * 60);

          return Math.exp(-ageHours / TAU_HOURS);
        }
      },
      // Derives normalized overall quality from content scores and loaded feed-quality evidence.
      quality: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          // Default to a neutral-good baseline when no scoring is available
          const DEFAULT_SCORE = 70;

          const advertisementScore =
            this.getDataValue('advertisementScore') ?? DEFAULT_SCORE;

          const sentimentScore =
            this.getDataValue('sentimentScore') ?? DEFAULT_SCORE;

          const qualityScore =
            this.getDataValue('qualityScore') ?? DEFAULT_SCORE;

          /**
           * Overall article quality score (0–1).
           *
           * Scoring semantics:
           * - All component scores range from 0–100
           * - Higher scores always indicate better quality
           *
           * Weighting:
           * - sentimentScore:      50%  (tone, neutrality, emotional quality)
           * - qualityScore:        35%  (writing clarity, structure, substance)
           * - advertisementScore:  15%  (absence of promotion or marketing)
           *
           * Default behavior:
           * - Articles without scores start at a neutral-good baseline (70)
           *   to avoid unfair penalization during ingestion or reprocessing.
           *
           * Feed adjustment:
           * - If Feed association is loaded, gently adjust by trust and duplication history
           * - Low-sample feeds stay close to the article-only score
           */
          let overall =
            sentimentScore * 0.5 +
            qualityScore * 0.35 +
            advertisementScore * 0.15;

          overall = Math.max(0, Math.min(100, overall));
          const baseQuality = overall / 100;

          return applyFeedQualityAdjustment(baseQuality, this.get('Feed'));
        }
      },
      // Derives a uniqueness score that decreases as the associated event grows.
      uniqueness: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          /**
           * Uniqueness score: penalizes articles covered by larger events.
           *
           * Scoring semantics (0–1):
           * - 1.0 = standalone article or small event (highly unique)
           * - 0.6–0.8 = part of a small event (2–4 related articles)
           * - 0.3–0.5 = part of a medium event (5–16 related articles)
           * - <0.3 = part of a large event (17+ related articles, very redundant)
           *
           * Used in importance ranking to suppress redundant articles.
           */
          const event = this.get('event');

          if (!event || !event.articleCount || event.articleCount <= 1) {
            return 1.0;
          }

          const eventArticleCount = event.articleCount;
          const uniqueness = 1 / Math.log2(eventArticleCount + 1);

          return Math.max(0, Math.min(1, uniqueness));
        }
      },
      // Exposes the loaded primary topic's semantic key; null when no key is available.
      topicKey: {
        type: DataTypes.VIRTUAL(DataTypes.STRING),
        get() {
          const topic = this.get('topic');
          if (topic?.topicKey) return topic.topicKey;
          const event = this.get('event');
          return event?.topicKey ?? null;
        }
      },
      // Timestamp when the article was published (from feed data, used for freshness and sorting)
      // Stores the effective publication time used for sorting and freshness, defaulting to ingestion time.
      publishedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      // Best-known timestamp for the article's latest confirmed content revision.
      // This is intentionally hybrid metadata: it stores the publisher-provided modification
      // timestamp when available, or the time RSSMonster detects a confirmed content revision otherwise.
      // It remains null when neither raw metadata nor a confirmed content revision exists.
      // Incoming modification timestamps are informational and never drive revision comparison.
      // Stores the best-known confirmed content-revision time; null before a revision is known.
      modifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Source publication timestamp before any fallback or inference is applied.
      // Preserves the publication timestamp selected from source signals; null when none was available.
      publishedSource: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Whether the stored publication timestamp was inferred from fallback signals.
      // Marks whether the effective publication time came from fallback rather than explicit publication metadata.
      publishInferred: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Timestamp when the article was first seen on the screen (used for freshness tracking and UI purposes)
      // Records when the article was first displayed to the user; null until first presentation.
      firstSeen: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Timestamp when the article was explicitly marked as read.
      // Records when the article was explicitly marked read; null while unread or when no read time is known.
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      indexes: [
        ...(sequelize.getDialect() === 'mysql' ? [{
          name: 'articles_title_contentText_fulltext_idx',
          fields: ['title', 'contentText'],
          type: 'FULLTEXT'
        }] : []),
        {
          unique: true,
          name: 'articles_feedId_urlHash_unique',
          fields: ['feedId', 'urlHash']
        },
        {
          unique: true,
          name: 'articles_feedId_normalizedUrlHash_unique',
          fields: ['feedId', 'normalizedUrlHash']
        },
        {
          name: 'articles_userId_contentSourceHash_idx',
          fields: ['userId', 'contentSourceHash']
        },
        {
          name: 'articles_userId_aiAnalysisStatus_idx',
          fields: ['userId', 'aiAnalysisStatus']
        }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      hooks: {
        beforeValidate: populateArticleHashes,
        beforeBulkCreate: articles => articles.forEach(populateArticleHashes)
      }
    }
  );

  const sequelizeToJSON = Article.prototype.toJSON;

  // This function keeps raw publisher HTML available internally but out of serialized articles.
  Article.prototype.toJSON = function toJSON() {
    const values = sequelizeToJSON.call(this);
    delete values.contentOriginal;
    return values;
  };

  return Article;
};
