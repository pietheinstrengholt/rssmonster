import { DataTypes } from 'sequelize';

const TAU_HOURS = 48; // tune this globally

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
      clickedAmount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      openedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      HotInd: {
        type: DataTypes.INTEGER,
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
      imageUrl: DataTypes.STRING(1024),
      title: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      author: DataTypes.TEXT,
      description: DataTypes.TEXT,
      contentOriginal: DataTypes.TEXT('medium'),
      contentStripped: DataTypes.TEXT,
      contentSummaryBullets: {
        type: DataTypes.JSON,
        allowNull: true
      },
      contentHash: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      vector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      embedding_model: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      clusterId: {
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
           * - openedCount (re-visits)
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
          const openedCount = this.getDataValue('openedCount') ?? 0;
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
          const openBoost = Math.min(Math.log2(openedCount + 1) / 5, 0.15);
          const clickBoost = Math.min(Math.log2(clickedAmount + 1) / 5, 0.15);

          return Math.min(
            Number((base + openBoost + clickBoost).toFixed(4)),
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
          const cluster = this.get('cluster');

          if (!cluster || !cluster.articleCount || cluster.articleCount <= 1) {
            return 1.0;
          }

          const clusterSize = cluster.articleCount;
          const uniqueness = 1 / Math.log2(clusterSize + 1);

          return Math.max(0, Math.min(1, uniqueness));
        }
      },
      published: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Article;
};