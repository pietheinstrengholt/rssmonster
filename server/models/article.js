import { DataTypes } from 'sequelize';
import { createHash } from 'node:crypto';
import normalizeUrl from '../services/crawl/content/normalizeUrl.js';
import { computeArticleQuality } from '../services/articles/articleQuality.js';
import { hashOriginalContent, hashVisibleText } from '../utils/articleContentHashes.js';
import { unsignedIntegerType } from './databaseTypes.js';

const TAU_HOURS = 48; // tune this globally

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
      /**
       * Reading evidence contract (distinct from read/unread state):
       * - firstSeen: first actual exposure; preserve the existing value.
       * - attentionBucket: estimate from eligible time with readable article content.
       * - lastMeaningfulReadAt: latest qualifying deep-reading observation.
       * - lastClickedAt: existing click actions, not opening content internally.
       * - readAt: automatic or explicit read-state transitions, not proof of reading.
       * - favoritedAt: favorite actions only.
       *
       * First/last observation timestamps and accumulated duration belong to the
       * current frontend reading session. There is no persisted generic "last
       * observed" field; never repurpose a behavioral timestamp for that purpose.
       *
       * This defines the intended capture contract, not a guarantee about legacy
       * data. The frontend enforces visibility/idle eligibility; the seen endpoint
       * separates observation recording from explicit read-state changes.
       */
      // Latest signal times; null retains unknown interaction time for legacy state.
      // Updated by existing click actions; an internal list/Reader opening is not an outbound click.
      lastClickedAt: { type: DataTypes.DATE, allowNull: true },
      // Updated only by favorite actions; clearing the favorite clears its active signal clock.
      favoritedAt: { type: DataTypes.DATE, allowNull: true },
      positiveFeedbackAt: { type: DataTypes.DATE, allowNull: true },
      negativeFeedbackAt: { type: DataTypes.DATE, allowNull: true },
      // Updated by a qualifying deep-reading observation (bucket >= 3), never read-state changes alone.
      lastMeaningfulReadAt: { type: DataTypes.DATE, allowNull: true },
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
      // Ordered canonical byline; null means only legacy author text is available.
      authors: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
      // Publisher-declared provenance; separate from this entry's identity and subscription.
      originalSource: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
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
      // Records completion of the retained analysis, which may predate publisher revisions.
      aiAnalysisCompletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Immutable input identity of the retained analysis; null for untracked legacy results.
      aiAnalysisProvenance: {
        type: DataTypes.JSON,
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
      // Stores the publisher language hint, falling back to content detection when absent.
      language: DataTypes.TEXT('tiny'),
      // Scores the absence of promotional content from 0 to 100, defaulting to zero.
      advertisementScore: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Marks advertisementScore as deterministic action output rather than unresolved inference.
      advertisementScoreActionOverrideInd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
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
      // Marks qualityScore as deterministic action output rather than unresolved inference.
      qualityScoreActionOverrideInd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Stores the predicted user-interest affinity, with zero representing no match.
      interestScore: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Last successful interest evaluation, including neutral and unchanged results.
      // Null means no recorded evaluation; legacy history is unknown.
      interestScoredAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      // Attention estimate from eligible time with readable article content (0–4).
      // Eligibility requires a visible document, active content in the reading viewport,
      // and an unexpired inactivity grace period; stationary reading can qualify.
      // 0 = no sufficient recorded attention; exposure may be unknown, not necessarily skipped
      // 1 = skimmed
      // 2 = read
      // 3 = deep read
      // 4 = highly engaged
      // These are estimates, not proof of completion or dislike. Read-state changes add no attention.
      // The current writer only increases the bucket; this does not repair older inflated values.
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
           * 0 = no sufficient recorded attention (not an inferred skip or dislike)
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
            default: return 0.0; // bucket 0 → no recorded attention contribution
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
      // Derives normalized article-only quality from the persisted content scores.
      quality: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          /**
           * Article-only quality score (0–1).
           *
           * Scoring semantics:
           * - All component scores range from 0–100
           * - Higher scores always indicate better quality
           *
           * Weighting:
           * - qualityScore:        50%  (writing clarity, structure, substance)
           * - sentimentScore:      25%  (tone, neutrality, emotional quality)
           * - advertisementScore:  25%  (absence of promotion or marketing)
           *
           * Default behavior:
           * - Null scores use a neutral-good baseline (70)
           *   to avoid unfair penalization during ingestion or reprocessing.
           */
          return computeArticleQuality(this);
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
      // First actual exposure on screen; preserve once set, including after marking unread.
      // Legacy mark-read calls can also populate this field, so existing values do not prove exposure.
      firstSeen: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Records automatic or explicit transitions to read, including bulk/grouped read actions.
      // Null while unread or when no read time is known; never evidence of attended duration.
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      indexes: [
        {
          name: 'articles_user_status_visible_event_idx',
          fields: ['userId', 'status', 'filteredInd', 'duplicateOfArticleId', 'eventId', 'id']
        },
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
        },
        // Keep existing indexes first: InnoDB can use their order when choosing foreign-key support.
        {
          name: 'articles_user_visible_created_idx',
          fields: ['userId', 'filteredInd', 'duplicateOfArticleId', 'createdAt']
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
    delete values.advertisementScoreActionOverrideInd;
    delete values.qualityScoreActionOverrideInd;
    return values;
  };

  return Article;
};
