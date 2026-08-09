// Exposes parsed feed acquisition through the closed neutral outcome contract.

import discoverRssLink from './discoverRssLink.js';
import parseFeed from './parser.js';
import {
  FETCH_OUTCOMES,
  createConditionalHeaders,
  createFetchOutcome,
  isSuccessfulFetchOutcome
} from './http/contracts.js';
import { throwIfExecutionExpired } from './executionDeadline.js';

// Converts one parser diagnostic into the terminal malformed outcome contract.
const malformedOutcome = diagnostic => createFetchOutcome(FETCH_OUTCOMES.MALFORMED, {
  error: {
    type: FETCH_OUTCOMES.MALFORMED,
    code: diagnostic?.code || 'INVALID_FEED',
    message: diagnostic?.message || 'Unable to discover RSS/Atom/JSON Feed URL'
  }
});

// Selects the primary endpoint result unless a proven recovery has already succeeded.
const selectTerminalFailure = ({
  primaryOutcome,
  primaryParseFailure,
  recovery
}) => {
  if (primaryOutcome && !isSuccessfulFetchOutcome(primaryOutcome)) {
    return primaryOutcome;
  }
  if (primaryParseFailure) return malformedOutcome(primaryParseFailure);
  if (recovery) {
    return malformedOutcome({
      code: recovery.code,
      message: recovery.diagnostic
    });
  }
  return malformedOutcome();
};

// Reduces one candidate event to stable diagnostic fields without affecting scheduling.
const candidateDiagnostic = ({ outcome, parserFailure, provenance }) => ({
  kind: provenance.kind,
  speculative: Boolean(provenance.speculative),
  requestedUrl: provenance.requestedUrl || null,
  resolvedUrl: provenance.resolvedUrl || null,
  ...(outcome ? {
    outcomeType: outcome.type,
    httpStatus: outcome.response?.status ?? outcome.error?.status ?? null,
    error: outcome.error || null
  } : {}),
  ...(parserFailure ? { parserFailure } : {})
});

// Maps an unexpected feed-layer exception into a deterministic neutral outcome.
const outcomeFromUnexpectedError = error => {
  let type = FETCH_OUTCOMES.TRANSIENT_FAILURE;
  if (error?.code === 'RESPONSE_TOO_LARGE') type = FETCH_OUTCOMES.TOO_LARGE;
  if (error?.code === 'FEED_INPUT_LIMIT_EXCEEDED') {
    type = FETCH_OUTCOMES.TOO_LARGE;
  }
  if (error?.code === 'FEED_PERSISTENCE_URL_TOO_LONG') {
    type = FETCH_OUTCOMES.TOO_LARGE;
  }
  if (error?.code === 'SSRF_BLOCKED') type = FETCH_OUTCOMES.SECURITY_REJECTED;
  if (error?.code === 'UNSAFE_FEED_XML') type = FETCH_OUTCOMES.MALFORMED;
  if (error?.name === 'TimeoutError') type = FETCH_OUTCOMES.TIMED_OUT;

  return createFetchOutcome(type, {
    error: {
      type,
      message: error?.message || 'Feed acquisition failed',
      code: error?.code || null
    }
  });
};

// Adds aggregate attempt and recovery metadata without changing the neutral fetch type.
const withDiscoveryMetadata = ({
  outcome,
  inputUrl,
  resolvedUrl = null,
  attempts,
  candidateCount,
  recovery = null,
  primaryOutcome = null,
  primaryParseFailure = null,
  candidateDiagnostics = []
}) => createFetchOutcome(outcome.type, {
  ...outcome,
  discovery: {
    attempts: Math.max(0, attempts),
    candidateCount: Math.max(0, candidateCount),
    inputUrl,
    resolvedUrl,
    recovered: Boolean(
      resolvedUrl && resolvedUrl !== inputUrl && candidateCount > 1
    ),
    ...(recovery ? { recovery } : {}),
    primary: {
      outcomeType: primaryOutcome?.type || null,
      httpStatus: primaryOutcome?.response?.status ??
        primaryOutcome?.error?.status ?? null,
      ...(primaryParseFailure ? { parserFailure: primaryParseFailure } : {})
    },
    candidates: candidateDiagnostics
  }
});

// Discovers, downloads, and parses a feed without exposing transport exceptions.
export const acquireFeed = async ({
  url: inputUrl,
  feed,
  deadlineAt = null,
  signal = null,
  execution: suppliedExecution = null
}) => {
  const execution = suppliedExecution || { deadlineAt, signal };
  throwIfExecutionExpired(execution);
  let primaryOutcome = null;
  let primaryParseFailure = null;
  let attempts = 0;
  let candidateCount = 0;
  const candidateDiagnostics = [];
  const conditionalRequest = {
    headers: createConditionalHeaders(feed),
    previousContentHash: feed?.contentHash || null,
    ...(execution.deadlineAt ? { deadlineAt: execution.deadlineAt } : {}),
    ...(execution.signal ? { signal: execution.signal } : {})
  };

  try {
    const discoveryResult = await discoverRssLink.discoverRssLink(
      inputUrl,
      feed,
      {
        includeParsedFeed: true,
        conditionalRequest,
        execution,
        deadlineAt: execution.deadlineAt,
        signal: execution.signal,
        // Records the primary request separately from ordered candidate diagnostics.
        onFetchOutcome: (outcome, provenance = null) => {
          attempts += Number(outcome?.attempts ?? 1);
          candidateCount += 1;
          const requestProvenance = provenance || (
            primaryOutcome
              ? { role: 'candidate', kind: 'unknown', speculative: true }
              : { role: 'primary', kind: 'primary' }
          );
          if (requestProvenance.role === 'primary' && !primaryOutcome) {
            primaryOutcome = outcome;
            return;
          }
          candidateDiagnostics.push(candidateDiagnostic({
            outcome,
            provenance: requestProvenance
          }));
        },
        // Keeps primary parser attribution while retaining candidate parser diagnostics.
        onParseFailure: (diagnostic, provenance = null) => {
          const parseProvenance = provenance || {
            role: primaryParseFailure ? 'candidate' : 'primary',
            kind: primaryParseFailure ? 'unknown' : 'primary',
            speculative: Boolean(primaryParseFailure)
          };
          if (parseProvenance.role === 'primary') {
            if (
              !primaryParseFailure ||
              diagnostic?.code === 'MALFORMED_FEED_BODY'
            ) {
              primaryParseFailure = diagnostic;
            }
            return;
          }
          candidateDiagnostics.push(candidateDiagnostic({
            parserFailure: diagnostic,
            provenance: parseProvenance
          }));
        }
      }
    );

    if (discoveryResult?.cloudflare) {
      return withDiscoveryMetadata({
        inputUrl,
        resolvedUrl: discoveryResult.url,
        attempts,
        candidateCount,
        outcome: primaryOutcome || createFetchOutcome(FETCH_OUTCOMES.PERMANENT_FAILURE, {
          error: {
            type: FETCH_OUTCOMES.PERMANENT_FAILURE,
            message: 'Cloudflare bot protection detected'
          }
        }),
        primaryOutcome,
        primaryParseFailure,
        candidateDiagnostics
      });
    }

    const url = typeof discoveryResult === 'string'
      ? discoveryResult
      : discoveryResult?.url;
    const resolvedFeed = discoveryResult?.feed || feed;
    if (!url) {
      const recovery = discoveryResult?.recovery || null;
      const outcome = selectTerminalFailure({
        primaryOutcome,
        primaryParseFailure,
        recovery
      });
      return withDiscoveryMetadata({
        outcome,
        inputUrl,
        attempts,
        candidateCount,
        recovery,
        primaryOutcome,
        primaryParseFailure,
        candidateDiagnostics
      });
    }

    if (discoveryResult?.fetchOutcome) {
      const outcome = createFetchOutcome(discoveryResult.fetchOutcome.type, {
        ...discoveryResult.fetchOutcome,
        url,
        feed: resolvedFeed,
        publisherSelf: discoveryResult.publisherSelf,
        recovery: discoveryResult.recovery,
        parsedFeed: discoveryResult.parsedFeed
      });
      return withDiscoveryMetadata({
        outcome,
        inputUrl,
        resolvedUrl: url,
        attempts: attempts || Number(outcome.attempts ?? 1),
        candidateCount: candidateCount || 1,
        recovery: discoveryResult.recovery,
        primaryOutcome,
        primaryParseFailure,
        candidateDiagnostics
      });
    }

    if (discoveryResult?.parsedFeed) {
      const outcome = createFetchOutcome(FETCH_OUTCOMES.CHANGED, {
        url,
        feed: resolvedFeed,
        publisherSelf: discoveryResult.publisherSelf,
        recovery: discoveryResult.recovery,
        parsedFeed: discoveryResult.parsedFeed
      });
      return withDiscoveryMetadata({
        outcome,
        inputUrl,
        resolvedUrl: url,
        attempts: attempts || 1,
        candidateCount: candidateCount || 1,
        recovery: discoveryResult.recovery,
        primaryOutcome,
        primaryParseFailure,
        candidateDiagnostics
      });
    }

    const parsedOutcome = await parseFeed.acquireFeedSource(
      url,
      conditionalRequest
    );
    attempts += Number(parsedOutcome?.attempts ?? 1);
    candidateCount += 1;
    if (!isSuccessfulFetchOutcome(parsedOutcome)) {
      return withDiscoveryMetadata({
        outcome: parsedOutcome,
        inputUrl,
        resolvedUrl: url,
        attempts,
        candidateCount,
        primaryOutcome,
        primaryParseFailure,
        candidateDiagnostics
      });
    }

    const outcome = createFetchOutcome(parsedOutcome.type, {
      ...parsedOutcome,
      url,
      feed: resolvedFeed,
      parsedFeed: parsedOutcome.parsedFeed
    });
    return withDiscoveryMetadata({
      outcome,
      inputUrl,
      resolvedUrl: url,
      attempts,
      candidateCount,
      primaryOutcome,
      primaryParseFailure,
      candidateDiagnostics
    });
  } catch (error) {
    if (error?.code === 'FEED_LEASE_LOST' || error?.code === 'FEED_EXECUTION_CONTEXT_INVALID') {
      throw error;
    }
    const attributablePrimaryFailure = Boolean(
      primaryParseFailure ||
      primaryOutcome && !isSuccessfulFetchOutcome(primaryOutcome)
    );
    return withDiscoveryMetadata({
      outcome: attributablePrimaryFailure
        ? selectTerminalFailure({ primaryOutcome, primaryParseFailure })
        : outcomeFromUnexpectedError(error),
      inputUrl,
      attempts,
      candidateCount,
      primaryOutcome,
      primaryParseFailure,
      candidateDiagnostics
    });
  }
};

export default { acquireFeed };
