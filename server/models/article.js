import { DataTypes } from 'sequelize';
import { createHash } from 'node:crypto';

const TAU_HOURS = 48; // tune this globally

// This function derives the stable database identity for an article URL.
const populateUrlHash = article => {
  if (article.url && !article.urlHash) {
    article.urlHash = createHash('sha256').update(article.url).digest('hex');
  }
};

export default (sequelize) => {
  const Article = sequelize.define(
    'articles',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      feedId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'unread'
      },
      starInd: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      negativeInd: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      positiveInd: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      clickedAmount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      hotInd: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      hotlinks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      media: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      url: {
        type: DataTypes.STRING(1024),
        allowNull: false
      },
      urlHash: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      imageUrl: DataTypes.STRING(1024),
      title: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      // Original author string from feed (not normalized or linked to an Author model, just stored for reference)
      author: DataTypes.TEXT,
      description: DataTypes.TEXT,
      // Full original content (HTML or text) from the feed, used for processing and vectorization but not sent to client
      contentOriginal: DataTypes.TEXT('medium'),
      // Stripped content with HTML removed, used for summarization and topic modeling
      contentStripped: DataTypes.TEXT,
      // AI-generated summary bullets (array of strings), stored as JSON
      contentSummaryBullets: {
        type: DataTypes.JSON,
        allowNull: true
      },
      contentHash: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      // Embedding vector for semantic search and topic modeling, stored as JSON array of floats
      embedding_model: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      // The actual embedding vector, stored as JSON array of floats. Nullable because not all articles may have embeddings (e.g. if processing failed or is pending).
      articleVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      // Denormalized event/cluster link for convenience/performance. Nullable because articles may exist before being assigned to a cluster.
      eventId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      topicId: {
        /**
         * Denormalized topic link for convenience/performance.
         * 
         * Article participates in two distinct relationships:
         * 1. Structural: Article -> Event -> Topic (primary grouping)
         * 2. Denormalized: Article -> Topic (direct link for queries)
         * 
         * When an article is assigned to an event, topicId is set from event.topicId
         * for efficient topic-level queries without JOIN traversal. This maintains
         * consistency: article.topicId always equals article.event.topicId (if event exists).
         * 
         * See: services/articles/assignArticleToEvent.js for assignment logic.
         */
        type: DataTypes.INTEGER,
        allowNull: true
      },
      language: DataTypes.TEXT('tiny'),
      advertisementScore: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      sentimentScore: {
        type: DataTypes.INTEGER,
        defaultValue: 50
      },
      qualityScore: {
        type: DataTypes.INTEGER,
        defaultValue: 50
      },
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
      attentionBucket: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
      },
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
      freshness: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          const published = this.getDataValue('published');
          if (!published) return 0;

          const ageMs = Date.now() - new Date(published).getTime();
          const ageHours = ageMs / (1000 * 60 * 60);

          return Math.exp(-ageHours / TAU_HOURS);
        }
      },
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
           * Feed trust adjustment:
           * - If Feed association is loaded, multiply by feed's trustScore
           * - This boosts quality for trusted feeds and reduces it for questionable ones
           */
          let overall =
            sentimentScore * 0.5 +
            qualityScore * 0.35 +
            advertisementScore * 0.15;

          overall = Math.max(0, Math.min(100, overall));
          let baseQuality = overall / 100;

          // Apply feed trust adjustment if Feed association is loaded
          const feed = this.get('Feed');
          if (feed && feed.feedTrust) {
            baseQuality = baseQuality * feed.feedTrust;
          }

          return baseQuality;
        }
      },
      uniqueness: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          /**
           * Uniqueness score: penalizes articles in larger clusters (duplicates/near-duplicates).
           *
           * Scoring semantics (0–1):
           * - 1.0 = standalone article or small cluster (highly unique)
           * - 0.6–0.8 = part of a small cluster (2–4 similar articles)
           * - 0.3–0.5 = part of a medium cluster (5–16 similar articles)
           * - <0.3 = part of a large cluster (17+ similar articles, very redundant)
           *
           * Used in importance ranking to suppress redundant articles.
           */
          const cluster = this.get('event') || this.get('cluster');

          if (!cluster || !cluster.articleCount || cluster.articleCount <= 1) {
            return 1.0;
          }

          const clusterSize = cluster.articleCount;
          const uniqueness = 1 / Math.log2(clusterSize + 1);

          return Math.max(0, Math.min(1, uniqueness));
        }
      },
      topicKey: {
        type: DataTypes.VIRTUAL(DataTypes.STRING),
        get() {
          const topic = this.get('topic');
          if (topic?.topicKey) return topic.topicKey;
          const cluster = this.get('cluster');
          return cluster?.topicKey ?? null;
        }
      },
      // Timestamp when the article was published (from feed data, used for freshness and sorting)
      published: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      // Timestamp when the article was first seen on the screen (used for freshness tracking and UI purposes)
      firstSeen: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      hooks: {
        beforeValidate: populateUrlHash,
        beforeBulkCreate: articles => articles.forEach(populateUrlHash)
      }
    }
  );

  return Article;
};
