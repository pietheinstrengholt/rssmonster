import { DataTypes } from 'sequelize';

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

// Current per-owner state. Technical timestamps and interest caches are not behavior.
export default sequelize => sequelize.define('articleInteractions', {
  articleId: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  readState: { type: DataTypes.ENUM('unread', 'read'), allowNull: false, defaultValue: 'unread', validate: { isIn: [['unread', 'read']] } },
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
}, {
  hooks: {
    async afterSync() {
      const qi = sequelize.getQueryInterface();
      const constraints = await qi.showConstraint('articleInteractions');
      if (!constraints.some(constraint => constraint.constraintName === 'articleInteractions_article_owner_fk')) {
        await qi.addConstraint('articleInteractions', {
          fields: ['articleId', 'userId'], type: 'foreign key', name: 'articleInteractions_article_owner_fk',
          references: { table: 'articles', fields: ['id', 'userId'] }, onDelete: 'CASCADE', onUpdate: 'CASCADE'
        });
      }
    }
  },
  indexes: [
    { fields: ['userId', 'readState', 'articleId'] },
    { fields: ['userId', 'favoriteInd', 'articleId'] },
    { fields: ['userId', 'firstSeen', 'articleId'] }
  ],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
