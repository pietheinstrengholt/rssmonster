/**
 * Ranking Configuration
 *
 * Central configuration hub for all ranking, scoring, and interest island tuning parameters.
 * Adjust these values to fine-tune article ranking behavior without modifying service logic.
 *
 * Sections:
 * 1) Profile Management – User interest profiles (diversity, caching)
 * 2) Interest Island Thresholds – Promotion and matching criteria
 * 3) Affinity & Decay – Temporal weighting of user interactions
 * 4) Suppression Signals – Content the user explicitly dislikes
 * 5) Ranking Pipeline – Island attachment and article ranking
 * 6) Recommended Score Weights – Quality and relevance signal blending
 */

// ============================================================================
// 1) PROFILE MANAGEMENT
// ============================================================================

/**
 * Default maximum number of active interest profiles used at ranking time.
 * Increases dynamically based on user engagement (stars, clicks).
 *
 * - Lower (4-6): Faster ranking, narrower focus
 * - Higher (12-16): More diverse recommendations, higher compute cost
 * - Tradeoff: Latency vs. recommendation diversity
 *
 * @type {number}
 */
export const DEFAULT_MAX_ACTIVE_PROFILES = 8;

/**
 * Candidate pool size for profile diversity selection.
 * Profiles are ranked by weight, then a subset is selected for diversity
 * using semantic similarity filtering.
 *
 * Multiplication factor applied to DEFAULT_MAX_ACTIVE_PROFILES to determine
 * how many candidates are fetched before applying diversity filters.
 * Can be overridden via env var INTEREST_ISLAND_PROFILE_CANDIDATE_LIMIT.
 *
 * - Lower (4x): Faster but may skip good profiles due to early truncation
 * - Higher (12x): More thorough but higher DB load
 *
 * @type {number}
 */
export const ACTIVE_PROFILE_CANDIDATE_LIMIT_FACTOR = 8;

/**
 * How long (hours) before a user interest profile's weight is halved by decay.
 * Used for exponential decay: effectiveWeight = weight × 0.5^(ageHours / halfLife)
 *
 * Affects: How fast old interactions fade from relevance
 * - 168 hours (7 days): Forget about interests within a week (seasonal shift preference)
 * - 336 hours (14 days): Keep interests active for 2 weeks (typical article cycle)
 * - 672 hours (28 days): Very sticky interests (loyalty to topics)
 *
 * @type {number}
 */
export const PROFILE_HALF_LIFE_HOURS = 336;

/**
 * Time-to-live for the in-memory profile cache (milliseconds).
 * Profiles are fetched from DB only on cache miss or expiry; subsequent
 * calls within this window hit the fast in-memory cache.
 *
 * - Lower (5000ms): Fresher data but more DB queries per request
 * - Higher (60000ms): Better throughput but stale interactions take longer to surface
 *
 * @type {number}
 */
export const PROFILE_CACHE_TTL_MS = 30_000;

/**
 * Semantic similarity threshold for profile diversity selection.
 * When selecting profiles, no two selected profiles will have cosine similarity
 * higher than this value.
 *
 * Dynamic range based on maxProfiles:
 * - 4 profiles → 0.92 (very strict diversity)
 * - 8 profiles → 0.84 (moderate diversity)
 * - 12 profiles → 0.80 (loose diversity)
 *
 * Adjustment formula:
 * threshold = 0.92 - ((maxProfiles - 4) × 0.015)
 *
 * - Higher values (0.92): Allow very similar topics (all tech news)
 * - Lower values (0.75): Force very different topics (tech + politics + sports)
 *
 * @type {number}
 */
export const PROFILE_SIMILARITY_THRESHOLD_BASE = 0.92;
export const PROFILE_SIMILARITY_THRESHOLD_PER_PROFILE_DELTA = 0.015;

/**
 * Engagement score calculation when determining max active profiles.
 * Higher engagement = more profiles activated.
 *
 * Formula: engagementScore = starCount + min(clickCount / 10, 50)
 * maxProfiles = clamp(4 + log2(engagementScore + 1), 4, 12)
 *
 * - 0 engagement → 4 profiles
 * - 10 stars → ~5 profiles
 * - 50 clicks (5 stars × 10) → ~5 profiles
 * - 100+ clicks → 12 profiles (max)
 *
 * @type {number}
 */
export const MIN_ACTIVE_PROFILES = 4;
export const MAX_ACTIVE_PROFILES = 12;
export const ENGAGEMENT_CLICK_DIVISOR = 10;
export const MAX_CLICK_WEIGHT = 50;

// ============================================================================
// 2) INTEREST ISLAND THRESHOLDS
// ============================================================================

/**
 * Minimum cluster affinity required to promote a cluster to an interest "island".
 * Islands are semantic interest profiles that actively influence article rankings.
 *
 * Accumulated via interactions:
 * - 1 star = 3 points
 * - 1 click = 1 point
 * - 1 negative = -2 points
 *
 * - 5 points: 1 star + 2 clicks, or ~5 clicks → promotes to island
 *
 * Adjustment:
 * - Lower (2-3): Aggressive island creation (more recommendations)
 * - Higher (8-10): Conservative island creation (only proven interests)
 *
 * @type {number}
 */
export const ISLAND_PROMOTION_THRESHOLD = 5;

/**
 * Minimum cosine similarity between an article's vector and a profile vector
 * to consider the article a match for that profile.
 *
 * Only articles above this threshold are reinforced into matching profiles.
 *
 * - 0.50: Very permissive matching (may dilute profile semantics)
 * - 0.72: Moderate matching (good default, semantic alignment required)
 * - 0.90: Very strict matching (only high-confidence semantic matches)
 *
 * @type {number}
 */
export const PROFILE_MATCH_THRESHOLD = 0.72;

/**
 * Bonus when article's topicKey matches profile's topicKey.
 * Added to cosine similarity before thresholding.
 *
 * Higher values: Prefer articles that match the exact cluster topic
 * Lower values: Ignore cluster alignment, rely only on semantics
 *
 * @type {number}
 */
export const TOPIC_KEY_BONUS = 0.08;

/**
 * Island weight below which the island is considered "dead" and deleted.
 * Prevents accumulation of profiles with near-zero influence.
 *
 * - 0.01: Very aggressive cleanup (thin out quickly)
 * - 0.05: Moderate cleanup (default)
 * - 0.20: Conservative cleanup (preserve weak signals)
 *
 * @type {number}
 */
export const ISLAND_VIABILITY_THRESHOLD = 0.05;

/**
 * Semantic similarity threshold for interest island merging.
 *
 * Background maintenance process consolidates near-duplicate islands
 * (e.g., "Windows tweaks" + "PowerToys workflows" → "Windows customization").
 *
 * Only profiles with cosine similarity >= this threshold are merged.
 * The higher-weight island survives and absorbs the lower-weight one.
 *
 * Why merging matters:
 * - Users develop overlapping interests over time (organic semantic drift)
 * - Without consolidation, recommendations become fragmented across near-duplicates
 * - Merging reduces noise, improves ranking confidence, strengthens long-term personalization
 *
 * Why vector similarity:
 * - Labels/names are unstable (user may retitle islands)
 * - Keywords are subjective
 * - Vector embeddings capture true semantic content across language variance
 *
 * - 0.85: Aggressive merging (fewer islands, broader topics)
 * - 0.90: Moderate merging (default, well-tested balance)
 * - 0.95: Conservative merging (only merge very similar islands)
 *
 * Can be overridden via PROFILE_MERGE_THRESHOLD env var.
 *
 * @type {number}
 */
export const PROFILE_MERGE_THRESHOLD = 0.90;

// ============================================================================
// 3) AFFINITY & DECAY
// ============================================================================

/**
 * How long (hours) before a cluster affinity's weight is halved by decay.
 * Shorter half-life = faster fade; longer half-life = stickier engagement.
 *
 * User<->cluster affinity measures latent engagement (stars, clicks, negatives).
 * Independent from interest profiles (which have their own PROFILE_HALF_LIFE_HOURS).
 *
 * - 168 hours (7 days): Forget clusters within a week (volatile interests)
 * - 336 hours (14 days): Sticky engagement over 2 weeks (default)
 * - 672 hours (28 days): Very long-term loyalty (career interests)
 *
 * @type {number}
 */
export const AFFINITY_HALF_LIFE_HOURS = 168;

/**
 * Weights for converting user interactions into affinity deltas.
 * Applied when tracking engagement: stars, clicks, and negative signals.
 *
 * - star: +3 points (very strong positive signal)
 * - click: +1 point (weak positive signal, noise resistance)
 * - negative: -2 points (penalize disliked clusters)
 *
 * Adjust to emphasize or de-emphasize interaction types:
 * - Increase star weight to make stars matter more vs. clicks
 * - Increase negative weight to quickly suppress disliked topics
 *
 * @type {Object}
 */
export const INTERACTION_WEIGHTS = {
  star: 3,
  click: 1,
  negative: -2
};

/**
 * Affinity deltas applied when user clicks "More" / "Less" / "Ignore" actions.
 * These steer the ranking algorithm without explicit profile edits.
 *
 * Structure: { action: { cluster: delta, profile: delta } }
 *
 * "more": Boost this cluster in rankings
 * "less": Demote this cluster in rankings
 * "ignore": Hide this cluster strongly
 *
 * Adjustment:
 * - More extreme deltas: Steering has stronger immediate effect
 * - Smaller deltas: Steering integrates more gradually with organic signals
 *
 * @type {Object}
 */
export const RECOMMENDATION_STEERING_WEIGHTS = {
  more: { cluster: 2, profile: 1.5 },
  less: { cluster: -1.5, profile: -1.25 },
  ignore: { cluster: -3, profile: -2.5 }
};

/**
 * Exponent for profile strength calculation.
 * Converts weight into a normalized 0–1 "strength" that scales affinityScore.
 *
 * Formula: profileStrength = 1 - exp(-max(weight, 0) / PROFILE_STRENGTH_SCALE)
 *
 * - weight=1 → strength ≈ 0.28
 * - weight=3 → strength ≈ 0.63
 * - weight=10 → strength ≈ 0.87
 *
 * Larger scale = weights matter less (strength grows slower with weight)
 *
 * @type {number}
 */
export const PROFILE_STRENGTH_SCALE = 3;

// ============================================================================
// 4) SUPPRESSION SIGNALS
// ============================================================================

/**
 * Cluster affinity threshold below which a cluster is marked as "suppressed".
 * The user actively dislikes clusters below this threshold.
 *
 * - Affinity < -1.5: User has negatively marked this cluster
 * - Used to compute suppression penalties in ranking
 *
 * More negative = more tolerant of slightly-disliked clusters
 *
 * @type {number}
 */
export const SUPPRESSED_CLUSTER_AFFINITY_THRESHOLD = -1.5;

/**
 * Minimum number of negative marks on a feed before it's flagged as suppressed.
 * Feeds with fewer negative marks are not suppressed.
 *
 * - 1: Suppress on first negative mark (aggressive suppression)
 * - 2: Suppress after 2 negatives (default, balanced)
 * - 3+: Very lenient (only suppress actively disliked feeds)
 *
 * @type {number}
 */
export const SUPPRESSED_FEED_MIN_NEGATIVE_COUNT = 2;

/**
 * Weight applied to feed's negative count when computing suppression penalty.
 * Lower weight = feed negatives matter less than cluster negatives.
 *
 * Formula: feedNegativeSignal = feedNegativeCount × WEIGHT × decayMultiplier
 *
 * - 0.15: Feed negatives are weak signals (default)
 * - 0.30: Feed negatives matter significantly
 * - 0.50: Feed negatives are as important as cluster negatives
 *
 * @type {number}
 */
export const SUPPRESSION_FEED_NEGATIVE_DECAY_WEIGHT = 0.15;

/**
 * Balance between topic suppression and feed suppression in final penalty.
 * Higher topic weight = focus suppression on clusters the user dislikes.
 * Higher feed weight = focus suppression on feeds the user dislikes.
 *
 * - 0.7 topic / 0.3 feed: Topic matters more (default, recommended)
 * - 0.5 / 0.5: Equal weight
 * - 0.3 / 0.7: Feed matters more
 *
 * Note: Must sum to 1.0 for proper normalization.
 *
 * @type {number}
 */
export const TOPIC_SUPPRESSION_WEIGHT = 0.7;
export const FEED_SUPPRESSION_WEIGHT = 0.3;

/**
 * Maximum suppression penalty (0–1 scale).
 * Even heavily disliked articles won't score below (1 - MAX_PENALTY).
 *
 * - 0.9: Disliked articles can drop to 10% score (strongly suppressed)
 * - 0.5: Disliked articles drop to 50% score (moderately suppressed)
 * - 0.2: Disliked articles only drop to 80% score (weakly suppressed)
 *
 * @type {number}
 */
export const MAX_SUPPRESSION_PENALTY = 0.9;

/**
 * Time-to-live for the in-memory suppression signal cache (milliseconds).
 * Suppression signals are fetched from DB only on cache miss or expiry.
 *
 * @type {number}
 */
export const SUPPRESSION_CACHE_TTL_MS = 30_000;

// ============================================================================
// 5) RANKING PIPELINE
// ============================================================================

/**
 * Minimum affinityScore required for an article to be attached to a profile.
 * Only articles with affinityScore >= this threshold are "island articles".
 *
 * Lower = more articles attached to islands (richer recommendations)
 * Higher = fewer articles attached (cleaner ranking, less noise)
 *
 * - 0.10: Permissive (most articles get matched)
 * - 0.18: Moderate (default, balanced matching)
 * - 0.30: Strict (only high-confidence matches)
 *
 * @type {number}
 */
export const RANKING_AFFINITY_THRESHOLD = 0.18;

/**
 * Constraints on the proportion of island-attached articles in final rankings.
 *
 * When ranking by RECOMMENDED:
 * - At least MIN_ISLAND_ATTACH_RATIO of results must be island articles
 * - Ideally TARGET_ISLAND_ATTACH_RATIO
 * - Never exceed MAX_ISLAND_ATTACH_RATIO
 *
 * This ensures:
 * - Minimum personalization (MIN)
 * - Balanced diversity between islands and general feed (TARGET)
 * - No excessive personalization drowning out broad coverage (MAX)
 *
 * - MIN = 0.10: At least 10% personalized
 * - TARGET = 0.15: Aim for 15% personalized
 * - MAX = 0.20: Never more than 20% personalized
 *
 * @type {number}
 */
export const MIN_ISLAND_ATTACH_RATIO = 0.10;
export const TARGET_ISLAND_ATTACH_RATIO = 0.15;
export const MAX_ISLAND_ATTACH_RATIO = 0.20;

// ============================================================================
// 6) RECOMMENDED SCORE WEIGHTS
// ============================================================================

/**
 * Weights for the recommended score formula.
 * Balances multiple signals into a final 0–1 score.
 *
 * Signals:
 * - coverage: How many sources reported the same story (cluster size relevance)
 * - crossSource: Diversity of publishers confirming the story
 * - corroboration: Combined cluster coverage + publisher diversity
 *
 * Formula:
 * recommended = (coverage × 0.35) + (crossSource × 0.25) + (corroboration × 0.40) + ruleBoost
 *
 * Adjustment:
 * - Increase coverage weight: Prefer articles in large clusters
 * - Increase crossSource weight: Prefer multi-publisher corroboration
 * - Increase corroboration weight: Combined signal of both
 *
 * Note: Weights should sum to ~0.85–1.0 (leaving room for rule boost).
 *
 * @type {number}
 */
export const COVERAGE_WEIGHT = 0.35;
export const CROSS_SOURCE_WEIGHT = 0.25;
export const CORROBORATION_WEIGHT = 0.40;

/**
 * Flat boost applied to articles matching user-defined tag rules.
 * Rule-tagged articles jump in score regardless of other signals.
 *
 * - 0.00: No boost (ignore user rules)
 * - 0.15: Moderate boost (rules influence ranking)
 * - 0.30: Strong boost (rules dominate ranking)
 *
 * @type {number}
 */
export const RULE_TAG_BOOST = 0.15;

/**
 * Normalization cap for cluster size contribution to coverage score.
 * Articles in clusters larger than this are capped at max coverage.
 *
 * Formula: coverage = min(log2(clusterSize) / log2(MAX_SIZE), 1)
 *
 * - 16: clusters of 16+ articles max out coverage
 * - 64: clusters of 64+ articles max out coverage (default, generous)
 * - 256: very large clusters needed for max coverage
 *
 * @type {number}
 */
export const MAX_COVERAGE_CLUSTER_SIZE = 64;

/**
 * Normalization cap for source diversity contribution.
 * sourceDiversityScore (log-based) is divided by this to get 0–1 range.
 *
 * Formula: sourceDiversity = min(diversityScore / MAX_DIVERSITY, 1)
 *
 * sourceDiversityScore on cluster = log(sourceCount + 1)
 * Examples:
 * - 1 source → log(2) ≈ 0.69 → score = 0.27
 * - 5 sources → log(6) ≈ 1.79 → score = 0.70
 * - 10 sources → log(11) ≈ 2.40 → score = 0.94
 * - 13+ sources → capped at 1.0
 *
 * @type {number}
 */
export const MAX_SOURCE_DIVERSITY_SCORE = 2.56;

/**
 * Normalization cap for source count spread (when diversity score unavailable).
 * Used as fallback when sourceDiversityScore not computed.
 *
 * Formula: sourceSpread = min(log2(sourceCount) / log2(MAX_LOG_BASE), 1)
 *
 * - 8: clusters of 8+ distinct publishers reach max spread
 *
 * @type {number}
 */
export const MAX_SOURCE_SPREAD_LOG_BASE = 8;

/**
 * Coefficients for blending sourceDiversity and sourceSpread into crossSource.
 * Applied when both signals are available.
 *
 * Formula: crossSource = (DIVERSITY_COEF × sourceDiversity) + (SPREAD_COEF × sourceSpread)
 *
 * Note: Coefficients should sum to 1.0.
 *
 * - 0.60 diversity / 0.40 spread: Prefer explicit diversity score (default)
 * - 0.50 / 0.50: Equal weight
 *
 * @type {number}
 */
export const CROSS_SOURCE_DIVERSITY_COEFF = 0.6;
export const CROSS_SOURCE_SPREAD_COEFF = 0.4;

/**
 * Coefficients for blending coverage and crossSource into corroboration.
 * Higher coverage weight = prefer large clusters.
 * Higher crossSource weight = prefer multi-publisher corroboration.
 *
 * Formula: corroboration = (COVERAGE × coverage) + (CROSS_SOURCE × crossSource)
 *
 * Note: Coefficients should sum to 1.0.
 *
 * @type {number}
 */
export const CORROBORATION_COVERAGE_COEFF = 0.6;
export const CORROBORATION_CROSS_SOURCE_COEFF = 0.4;

// ============================================================================
// Utility: Compute effective profile limit from environment or config
// ============================================================================

/**
 * Resolves the actual profile candidate limit, considering environment overrides.
 * Can be overridden by INTEREST_ISLAND_PROFILE_CANDIDATE_LIMIT env var.
 *
 * @returns {number} The profile candidate limit
 */
export function resolveActiveProfileCandidateLimit() {
  const envOverride = Number(process.env.INTEREST_ISLAND_PROFILE_CANDIDATE_LIMIT);
  if (Number.isFinite(envOverride) && envOverride > 0) {
    return envOverride;
  }
  return Math.max(DEFAULT_MAX_ACTIVE_PROFILES, DEFAULT_MAX_ACTIVE_PROFILES * ACTIVE_PROFILE_CANDIDATE_LIMIT_FACTOR);
}
