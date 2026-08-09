// Validates publisher-declared feed endpoints as conservative identity evidence.

import db from '../../models/index.js';
import {
  assertExecutionLeaseOwnership,
  isFeedTimeoutError,
  throwIfExecutionExpired
} from './executionDeadline.js';
import parseFeed from './parser.js';
import {
  findFeedByUrlAlias,
  registerFeedUrlAliases
} from './feedUrlAliases.js';
import {
  normalizeFeedIdentityUrl
} from './feedUrlIdentity.js';
import {
  FEED_PERSISTENCE_LIMITS,
  boundedOptionalMetadata
} from './feedPersistenceMetadata.js';
import { reconcileDuplicateFeeds } from './feedReconciliation.js';
import {
  FETCH_OUTCOMES,
  isSuccessfulFetchOutcome
} from './http/contracts.js';

const { Article, Feed, User, sequelize } = db;
const REJECTED_SELF_RECHECK_MS = 24 * 60 * 60 * 1000;
const MAX_IDENTITY_ENTRIES = 20;
const MAX_DIAGNOSTIC_LENGTH = 4096;

// Loads recent durable article identities without treating mutable article content as proof.
const loadPersistedEntryIdentities = async (feed, execution) => {
  throwIfExecutionExpired(execution);
  if (!feed?.id || !feed?.userId) return [];
  const articles = await Article.findAll({
    attributes: ['externalId', 'externalIdType', 'url'],
    where: { feedId: feed.id, userId: feed.userId },
    order: [['publishedAt', 'DESC'], ['id', 'DESC']],
    limit: MAX_IDENTITY_ENTRIES,
    raw: true
  });
  throwIfExecutionExpired(execution);
  return articles;
};

// Normalizes text only for supporting evidence and never as a standalone identity signal.
const normalizeEvidenceText = value => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('en-US');

// Resolves one publisher declaration against the accepted response URL.
export const resolvePublisherSelfUrl = (declaration, finalFeedUrl) => {
  let url;
  try {
    url = new URL(String(declaration || '').trim(), finalFeedUrl);
  } catch {
    throw new TypeError('Publisher self URL is malformed');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('Publisher self URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new TypeError('Publisher self URL credentials are not allowed');
  }
  url.hash = '';
  return url.toString();
};

// Builds bounded stable entry identities from publisher IDs and canonical entry URLs.
const stableEntryIdentities = parsedFeed => {
  const entries = [];
  for (const entry of (parsedFeed?.entries || []).slice(0, MAX_IDENTITY_ENTRIES)) {
    const identities = new Set();
    if (entry.externalId && entry.externalIdType) {
      identities.add(`external:${entry.externalIdType}:${entry.externalId}`);
    }
    if (entry.url) {
      try {
        identities.add(`url:${normalizeFeedIdentityUrl(entry.url)}`);
      } catch {
        // Invalid article URLs do not contribute feed identity evidence.
      }
    }
    if (identities.size > 0) entries.push(identities);
  }
  return entries;
};

// Counts stable recent entry identities shared by the source and declared endpoint.
const sharedEntryIdentityCount = (sourceFeed, candidateFeed) => {
  const source = stableEntryIdentities(sourceFeed);
  const candidate = stableEntryIdentities(candidateFeed);
  let count = 0;
  for (const sourceIdentities of source) {
    // Counts one source entry at most once even when both its ID and URL match.
    const matched = candidate.some(candidateIdentities =>
      [...sourceIdentities].some(identity => candidateIdentities.has(identity))
    );
    if (matched) count += 1;
  }
  return count;
};

// Resolves a candidate feed's own declaration without treating malformed values as evidence.
const resolvedCandidateSelfUrl = (candidateFeed, candidateFinalUrl) => {
  if (!candidateFeed?.selfUrl) return null;
  try {
    return resolvePublisherSelfUrl(candidateFeed.selfUrl, candidateFinalUrl);
  } catch {
    return null;
  }
};

// Evaluates multiple independent signals and requires stronger proof across origins.
export const verifySameFeedEvidence = ({
  sourceFeed,
  sourceFinalUrl,
  sourceBodyHash = null,
  candidateFeed,
  candidateFinalUrl,
  candidateBodyHash = null
}) => {
  const sourceIdentity = normalizeFeedIdentityUrl(sourceFinalUrl);
  const candidateIdentity = normalizeFeedIdentityUrl(candidateFinalUrl);
  const sourceOrigin = new URL(sourceIdentity).origin;
  const candidateOrigin = new URL(candidateIdentity).origin;
  const sameOrigin = sourceOrigin === candidateOrigin;
  const endpointMatch = sourceIdentity === candidateIdentity;
  const reciprocalSelf = resolvedCandidateSelfUrl(candidateFeed, candidateFinalUrl);
  const reciprocalMatch = reciprocalSelf
    ? normalizeFeedIdentityUrl(reciprocalSelf) === sourceIdentity
    : false;
  const sharedEntries = sharedEntryIdentityCount(sourceFeed, candidateFeed);
  const formatMatch = Boolean(
    sourceFeed?.format && sourceFeed.format === candidateFeed?.format
  );
  const titleMatch = Boolean(
    normalizeEvidenceText(sourceFeed?.title) &&
    normalizeEvidenceText(sourceFeed?.title) === normalizeEvidenceText(candidateFeed?.title)
  );
  const bodyHashMatch = Boolean(
    sourceBodyHash && candidateBodyHash && sourceBodyHash === candidateBodyHash
  );

  const accepted = endpointMatch || bodyHashMatch || (
    sameOrigin
      ? formatMatch && sharedEntries >= 1 && (titleMatch || reciprocalMatch)
      : formatMatch && (
        sharedEntries >= 2 && titleMatch ||
        sharedEntries >= 1 && reciprocalMatch
      )
  );

  return {
    accepted,
    sameOrigin,
    endpointMatch,
    reciprocalMatch,
    sharedEntries,
    formatMatch,
    titleMatch,
    bodyHashMatch
  };
};

// Verifies that a recovery candidate still identifies an established subscription.
export const verifyFeedRecoveryEvidence = async ({
  feed,
  candidateFeed,
  candidateFinalUrl,
  candidateBodyHash = null,
  publisherSelf = null,
  execution = {}
}) => {
  throwIfExecutionExpired(execution);
  const knownAlias = await findFeedByUrlAlias({
    userId: feed.userId,
    url: candidateFinalUrl,
    execution
  });
  const sourceFeed = {
    format: feed.feedType,
    entries: await loadPersistedEntryIdentities(feed, execution)
  };
  const evidence = verifySameFeedEvidence({
    sourceFeed,
    sourceFinalUrl: feed.url,
    sourceBodyHash: feed.contentHash,
    candidateFeed,
    candidateFinalUrl,
    candidateBodyHash
  });
  let persistedSelfMatch = false;
  if (
    ['validated', 'known_alias'].includes(feed.publisherSelfStatus) &&
    feed.publisherSelfUrl
  ) {
    try {
      persistedSelfMatch = normalizeFeedIdentityUrl(feed.publisherSelfUrl) ===
        normalizeFeedIdentityUrl(candidateFinalUrl);
    } catch {
      persistedSelfMatch = false;
    }
  }
  const knownAliasMatch = knownAlias?.feed.id === feed.id;
  const acceptedSelfIdentity = Boolean(
    publisherSelf?.accepted && publisherSelf.ownerFeedId === feed.id
  );
  const overlapMatch = evidence.sameOrigin
    ? evidence.sharedEntries >= 1
    : evidence.sharedEntries >= 2;

  return {
    ...evidence,
    accepted: Boolean(
      knownAliasMatch ||
      persistedSelfMatch ||
      acceptedSelfIdentity ||
      evidence.reciprocalMatch ||
      evidence.bodyHashMatch ||
      overlapMatch
    ),
    knownAliasMatch,
    persistedSelfMatch,
    acceptedSelfIdentity,
    overlapMatch
  };
};

// Maps a guarded candidate failure into non-fatal publisher-self diagnostics.
const rejectedStatusForOutcome = outcome => {
  if (outcome?.type === FETCH_OUTCOMES.SECURITY_REJECTED) {
    return 'security_rejected';
  }
  if (outcome?.type === FETCH_OUTCOMES.MALFORMED) return 'malformed';
  return 'unreachable';
};

// Builds the alias observations proven by one successful self validation fetch.
const validationAliasCandidates = (declaredUrl, outcome) => {
  const candidates = [{ originalUrl: declaredUrl, aliasType: 'publisher_self' }];
  for (const redirect of outcome.response?.redirects || []) {
    if (redirect.fromUrl) {
      candidates.push({ originalUrl: redirect.fromUrl, aliasType: 'redirect' });
    }
    if (redirect.toUrl) {
      candidates.push({ originalUrl: redirect.toUrl, aliasType: 'redirect' });
    }
  }
  if (outcome.response?.url && outcome.response.url !== declaredUrl) {
    candidates.push({
      originalUrl: outcome.response.url,
      aliasType: 'publisher_self'
    });
  }
  return candidates;
};

// Reports whether a prior rejection can suppress a repeated validation request briefly.
const hasFreshRejectedCache = (feed, resolvedUrl, now) => {
  if (!feed?.publisherSelfCheckedAt || !feed.publisherSelfUrl) return false;
  if (['validated', 'known_alias'].includes(feed.publisherSelfStatus)) return false;
  let sameDeclaration = false;
  try {
    sameDeclaration = normalizeFeedIdentityUrl(feed.publisherSelfUrl) ===
      normalizeFeedIdentityUrl(resolvedUrl);
  } catch {
    return false;
  }
  return sameDeclaration &&
    now.getTime() - new Date(feed.publisherSelfCheckedAt).getTime() <
      REJECTED_SELF_RECHECK_MS;
};

// Validates a publisher declaration without invalidating the already accepted source feed.
export const validatePublisherSelfIdentity = async ({
  userId = null,
  feed = null,
  parsedFeed,
  finalFeedUrl,
  sourceBodyHash = null,
  deadlineAt = null,
  signal = null,
  execution: suppliedExecution = null,
  clock = () => new Date(),
  acquireCandidate = parseFeed.acquireFeedSource
}) => {
  const execution = suppliedExecution || { deadlineAt, signal };
  throwIfExecutionExpired(execution);
  if (!parsedFeed?.selfUrl) return null;

  let resolvedUrl;
  try {
    resolvedUrl = resolvePublisherSelfUrl(parsedFeed.selfUrl, finalFeedUrl);
  } catch (error) {
    return {
      accepted: false,
      declaredUrl: String(parsedFeed.selfUrl),
      resolvedUrl: null,
      status: 'invalid',
      diagnostic: error.message,
      aliases: []
    };
  }

  const knownAlias = userId
    ? await findFeedByUrlAlias({ userId, url: resolvedUrl, execution })
    : null;
  throwIfExecutionExpired(execution);
  if (knownAlias && feed?.id === knownAlias.feed.id) {
    return {
      accepted: true,
      declaredUrl: String(parsedFeed.selfUrl),
      resolvedUrl,
      status: 'known_alias',
      diagnostic: 'Publisher self URL matches a known user-scoped feed alias',
      aliases: [{ originalUrl: resolvedUrl, aliasType: 'publisher_self' }],
      ownerFeedId: knownAlias.feed.id,
      fetched: false
    };
  }

  const finalIdentity = normalizeFeedIdentityUrl(finalFeedUrl);
  const selfIdentity = normalizeFeedIdentityUrl(resolvedUrl);
  if (finalIdentity === selfIdentity) {
    return {
      accepted: true,
      declaredUrl: String(parsedFeed.selfUrl),
      resolvedUrl,
      status: 'validated',
      diagnostic: 'Publisher self URL matches the accepted feed endpoint',
      aliases: [{ originalUrl: resolvedUrl, aliasType: 'publisher_self' }],
      fetched: false
    };
  }

  const now = clock();
  if (hasFreshRejectedCache(feed, resolvedUrl, now)) {
    return {
      accepted: false,
      declaredUrl: String(parsedFeed.selfUrl),
      resolvedUrl,
      status: feed.publisherSelfStatus,
      diagnostic: feed.publisherSelfDiagnostic,
      aliases: [],
      fetched: false,
      cached: true
    };
  }

  let candidateOutcome;
  try {
    candidateOutcome = await acquireCandidate(resolvedUrl, {
      retries: 0,
      ...(execution.deadlineAt ? { deadlineAt: execution.deadlineAt } : {}),
      ...(execution.signal ? { signal: execution.signal } : {})
    });
  } catch (error) {
    if (isFeedTimeoutError(error) || execution.signal?.aborted) throw error;
    return {
      accepted: false,
      declaredUrl: String(parsedFeed.selfUrl),
      resolvedUrl,
      status: error?.code === 'SSRF_BLOCKED'
        ? 'security_rejected'
        : 'unreachable',
      diagnostic: error?.message || 'Publisher self URL could not be validated',
      aliases: [],
      fetched: true
    };
  }
  throwIfExecutionExpired(execution);
  if (!isSuccessfulFetchOutcome(candidateOutcome) || !candidateOutcome.parsedFeed) {
    return {
      accepted: false,
      declaredUrl: String(parsedFeed.selfUrl),
      resolvedUrl,
      status: rejectedStatusForOutcome(candidateOutcome),
      diagnostic: candidateOutcome.error?.message ||
        'Publisher self URL could not be validated',
      aliases: [],
      fetched: true
    };
  }

  const candidateFinalUrl = candidateOutcome.response?.url || resolvedUrl;
  const evidence = verifySameFeedEvidence({
    sourceFeed: parsedFeed,
    sourceFinalUrl: finalFeedUrl,
    sourceBodyHash,
    candidateFeed: candidateOutcome.parsedFeed,
    candidateFinalUrl,
    candidateBodyHash: candidateOutcome.bodyHash
  });
  if (!evidence.accepted) {
    return {
      accepted: false,
      declaredUrl: String(parsedFeed.selfUrl),
      resolvedUrl,
      status: 'unrelated',
      diagnostic: `Publisher self URL lacked sufficient same-feed evidence ` +
        `(sharedEntries=${evidence.sharedEntries}, sameOrigin=${evidence.sameOrigin})`,
      aliases: [],
      fetched: true,
      evidence
    };
  }

  return {
    accepted: true,
    declaredUrl: String(parsedFeed.selfUrl),
    resolvedUrl,
    status: 'validated',
    diagnostic: `Publisher self URL validated ` +
      `(sharedEntries=${evidence.sharedEntries}, sameOrigin=${evidence.sameOrigin})`,
    aliases: validationAliasCandidates(resolvedUrl, candidateOutcome),
    ownerFeedId: knownAlias?.feed.id || null,
    fetched: true,
    evidence
  };
};

// Truncates diagnostics before persistence without changing the validation decision.
const boundedDiagnostic = diagnostic => diagnostic
  ? String(diagnostic).slice(0, MAX_DIAGNOSTIC_LENGTH)
  : null;

// Bounds publisher URL diagnostics to the model's generous persistence capacity.
const boundedSelfUrl = validation => {
  const value = validation.resolvedUrl || validation.declaredUrl;
  return boundedOptionalMetadata(value, {
    maxCharacters: FEED_PERSISTENCE_LIMITS.selfUrlCharacters
  });
};

// Persists validation state and reconciles any proven same-user alias owner atomically.
export const persistPublisherSelfIdentity = async ({
  feed,
  validation,
  execution = {}
}) => {
  if (!feed?.id || !feed?.userId || !validation) return feed;

  throwIfExecutionExpired(execution);
  const resolvedFeed = await sequelize.transaction(async transaction => {
    await User.findByPk(feed.userId, {
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    await assertExecutionLeaseOwnership(execution, { transaction });
    let current = await Feed.findOne({
      where: { id: feed.id, userId: feed.userId },
      transaction
    });
    if (!current) {
      current = (await findFeedByUrlAlias({
        userId: feed.userId,
        url: feed.url,
        transaction,
        execution
      }))?.feed;
    }
    if (!current) throw new Error('Feed was removed before self validation completed');
    throwIfExecutionExpired(execution);

    if (validation.accepted) {
      const ownerIds = [];
      for (const candidate of validation.aliases) {
        const aliasOwner = await findFeedByUrlAlias({
          userId: current.userId,
          url: candidate.originalUrl,
          transaction,
          execution
        });
        const exactOwner = await Feed.findOne({
          where: { userId: current.userId, url: candidate.originalUrl },
          transaction
        });
        if (aliasOwner?.feed.id && aliasOwner.feed.id !== current.id) {
          ownerIds.push(aliasOwner.feed.id);
        }
        if (exactOwner?.id && exactOwner.id !== current.id) {
          ownerIds.push(exactOwner.id);
        }
      }
      if (ownerIds.length > 0) {
        const reconciliation = await reconcileDuplicateFeeds({
          userId: current.userId,
          feedIds: [current.id, ...ownerIds],
          transaction,
          preferredSurvivorId: validation.ownerFeedId || ownerIds[0],
          execution
        });
        current = reconciliation.survivor;
      }
      throwIfExecutionExpired(execution);
      await registerFeedUrlAliases({
        userId: current.userId,
        feedId: current.id,
        candidates: validation.aliases,
        transaction,
        execution
      });
    }

    throwIfExecutionExpired(execution);
    await current.update({
      publisherSelfUrl: boundedSelfUrl(validation),
      publisherSelfStatus: validation.status,
      publisherSelfCheckedAt: new Date(),
      publisherSelfDiagnostic: boundedDiagnostic(validation.diagnostic)
    }, { transaction });
    await assertExecutionLeaseOwnership(execution, { transaction });
    return current;
  });
  execution.retargetLease?.(resolvedFeed);
  throwIfExecutionExpired(execution);
  return resolvedFeed;
};

export default {
  persistPublisherSelfIdentity,
  resolvePublisherSelfUrl,
  validatePublisherSelfIdentity,
  verifyFeedRecoveryEvidence,
  verifySameFeedEvidence
};
