// Discovers valid RSS or Atom feed URLs from website URLs, social profile URLs, or fallback feed paths.
// It validates candidates by content type and feed parsing, and can persist successful discoveries on feed models.
import { load } from 'cheerio';
import {
  getYoutubeRssFromHandle,
  isYoutubeUrl
} from './getYoutubeRssFromHandle.js';
import { parseFeedSourceIsolated } from './feedsmith/isolatedFeedParser.js';
import { detectFeedSourceKind } from './feedsmith/xmlCleanup.js';
import { logFeedDebug, warnFeedDebug } from './feedLogging.js';
import { acquireHttp } from './http/acquireHttp.js';
import {
  FETCH_OUTCOMES,
  isSuccessfulFetchOutcome
} from './http/contracts.js';
import {
  isFeedTimeoutError,
  resolveDeadlineAt,
  resolveFeedTimeoutMs,
  throwIfExecutionExpired
} from './executionDeadline.js';
import { assertFeedPersistenceUrl } from './feedPersistenceMetadata.js';
import { persistDiscoveredFeedUrl } from './feedUrlAliases.js';
import {
  persistPublisherSelfIdentity,
  validatePublisherSelfIdentity,
  verifyFeedRecoveryEvidence
} from './feedSelfIdentity.js';

// Checks whether a string looks like an absolute HTTP(S) URL.
const isURL = (str) => {
  var regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#:.?+=&%!\-\/]))?/;
  return regex.test(str);
}

// Resolves a possibly relative href against a base URL.
const resolveLink = (base, href) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

// Extracts the origin portion of a URL for fallback feed-path probing.
const getBaseUrl = (url) => {
  try {
    // Derives the u required while performing get base url.
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
};

// Builds the canonical Bluesky RSS URL for supported profile URLs.
const getBlueskyRssCandidate = (url) => {
  try {
    // Derives the u required while performing get bluesky rss candidate.
    const u = new URL(url);
    // Returns no result when u host is not bsky.app.
    if (u.host !== 'bsky.app') return null;
    // Returns no result when starts with is unavailable.
    if (!u.pathname.startsWith('/profile/')) return null;
    // Returns early when ends with succeeds.
    if (u.pathname.endsWith('/rss')) return u.toString();

    // Derives the trimmed through replace while performing get bluesky rss candidate.
    const trimmed = u.pathname.replace(/\/+$/, '');
    u.pathname = `${trimmed}/rss`;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
};

// Builds the canonical Mastodon RSS URL for supported profile URLs.
const getMastodonRssCandidate = (url) => {
  try {
    // Derives the u required while performing get mastodon rss candidate.
    const u = new URL(url);
    // Returns no result when starts with is unavailable.
    if (!u.pathname.startsWith('/@')) return null;
    // Returns early when ends with succeeds.
    if (u.pathname.endsWith('.rss')) return u.toString();

    // Derives the trimmed through replace while performing get mastodon rss candidate.
    const trimmed = u.pathname.replace(/\/+$/, '');
    u.pathname = `${trimmed}.rss`;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
};

// Checks whether a response content type is likely to contain feed XML.
const isLikelyFeedContentType = (ct = "") => /xml|rss|atom/i.test(ct);

// Reports whether two URL spellings identify the same parsed HTTP endpoint.
const isSameUrl = (first, second) => {
  try {
    return new URL(first).href === new URL(second).href;
  } catch {
    return first === second;
  }
};

// Allows endpoint recovery only when the requested resource is genuinely absent.
const isRecoverableMissingEndpoint = outcome =>
  outcome?.type === FETCH_OUTCOMES.PERMANENT_FAILURE &&
  [404, 410].includes(Number(outcome.response?.status ?? outcome.error?.status));

// Extracts declared feed endpoints and meta refreshes with their recovery authority.
const extractHtmlDiscoveryCandidates = (body, responseUrl) => {
  if (!body) return [];
  const $ = load(String(body));
  const candidates = [];
  $('head link[href]').each((_index, element) => {
    const link = $(element);
    const type = String(link.attr('type') || '').toLowerCase();
    const rel = String(link.attr('rel') || '').toLowerCase().split(/\s+/);
    const supportedType = [
      'application/rss+xml',
      'application/atom+xml',
      'application/feed+json'
    ].includes(type);
    if (!supportedType || (rel[0] && !rel.includes('alternate'))) return;
    candidates.push({
      url: resolveLink(responseUrl, link.attr('href')),
      kind: 'html_alternate'
    });
  });

  const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
  const urlMatch = metaRefresh?.match(/url=(.+)/i);
  if (urlMatch) {
    const metaUrl = urlMatch[1].trim().replace(/['"]/g, '');
    candidates.push({
      url: resolveLink(responseUrl, metaUrl),
      kind: 'html_meta_refresh'
    });
  }
  return candidates.filter(candidate => candidate.url);
};

// Normalizes one redirect endpoint while rejecting malformed transport metadata.
const normalizeRedirectEndpoint = value => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
};

// Requires one continuous all-permanent chain from the stored URL to the final URL.
const isPermanentHttpRedirect = (outcome, requestedUrl, finalUrl) => {
  const requestedEndpoint = normalizeRedirectEndpoint(requestedUrl);
  const finalEndpoint = normalizeRedirectEndpoint(finalUrl);
  const redirects = outcome?.response?.redirects;
  if (
    !requestedEndpoint ||
    !finalEndpoint ||
    requestedEndpoint === finalEndpoint ||
    !Array.isArray(redirects) ||
    redirects.length === 0
  ) return false;

  let expectedFrom = requestedEndpoint;
  for (const redirect of redirects) {
    const fromEndpoint = normalizeRedirectEndpoint(redirect?.fromUrl);
    const toEndpoint = normalizeRedirectEndpoint(redirect?.toUrl);
    if (
      !fromEndpoint ||
      !toEndpoint ||
      fromEndpoint !== expectedFrom ||
      fromEndpoint === toEndpoint ||
      ![301, 308].includes(Number(redirect?.status))
    ) return false;
    expectedFrom = toEndpoint;
  }
  return expectedFrom === finalEndpoint;
};

// Builds a stable diagnostic for a parsed recovery candidate that lacked identity proof.
const buildRecoveryRejection = ({ kind, candidateUrl, evidence }) => ({
  accepted: false,
  code: 'FEED_RECOVERY_IDENTITY_UNVERIFIED',
  kind,
  candidateUrl,
  diagnostic: `Rejected ${kind} recovery because it lacked same-feed evidence`,
  evidence
});

// Parses a response body once and returns null when it is not a valid feed.
const parseFeedBody = async (
  body,
  execution,
  onParseFailure,
  provenance = null
) => {
  throwIfExecutionExpired(execution);
  try {
    const parsedFeed = await parseFeedSourceIsolated(body, {
      ...execution,
      feedUrl: provenance?.resolvedUrl || provenance?.requestedUrl || null
    });
    throwIfExecutionExpired(execution);
    if (!parsedFeed) {
      onParseFailure?.({
        code: detectFeedSourceKind(body) === 'unknown'
          ? 'INVALID_FEED'
          : 'MALFORMED_FEED_BODY',
        message: 'Response body is not a valid feed'
      }, provenance);
    }
    return parsedFeed;
  } catch (error) {
    if (
      isFeedTimeoutError(error) ||
      error?.code === 'UNSAFE_FEED_XML' ||
      error?.code === 'FEED_INPUT_LIMIT_EXCEEDED'
    ) {
      throw error;
    }
    onParseFailure?.({
      code: detectFeedSourceKind(body) === 'unknown'
        ? 'INVALID_FEED'
        : 'MALFORMED_FEED_BODY',
      message: error?.message || 'Response body is not a valid feed'
    }, provenance);
    return null;
  }
};

// Returns either the legacy URL string or the URL with its already-parsed feed.
const formatDiscoveryResult = (
  url,
  parsedFeed,
  options,
  fetchOutcome,
  resolvedFeed,
  publisherSelf = null,
  recovery = null
) => {
  // Returns early when include parsed feed is available.
  if (options?.includeParsedFeed) {
    return {
      url,
      parsedFeed,
      fetchOutcome,
      feed: resolvedFeed || null,
      publisherSelf,
      recovery
    };
  }

  return url;
};

// Collects both endpoints of every accepted HTTP redirect hop as aliases.
const redirectAliasCandidates = outcome => (
  outcome?.response?.redirects || []
).flatMap(redirect => [
  redirect.fromUrl
    ? { originalUrl: redirect.fromUrl, aliasType: 'redirect' }
    : null,
  redirect.toUrl
    ? { originalUrl: redirect.toUrl, aliasType: 'redirect' }
    : null
]).filter(Boolean);

// Completes one parsed discovery with non-fatal publisher-self identity evidence.
const completeParsedDiscovery = async ({
  feed,
  userId,
  finalUrl,
  parsedFeed,
  options,
  fetchOutcome,
  execution,
  recoveryKind = 'direct'
}) => {
  let publisherSelf = null;
  try {
    publisherSelf = await validatePublisherSelfIdentity({
      userId: userId || feed?.userId || null,
      feed,
      parsedFeed,
      finalFeedUrl: finalUrl,
      sourceBodyHash: fetchOutcome?.bodyHash,
      execution,
      deadlineAt: execution.deadlineAt,
      signal: execution.signal
    });
  } catch (error) {
    if (
      isFeedTimeoutError(error) ||
      execution.signal?.aborted ||
      error?.code === 'FEED_LEASE_LOST' ||
      error?.code === 'FEED_EXECUTION_CONTEXT_INVALID'
    ) throw error;
    warnFeedDebug(
      `[Feed self] Ignoring publisher self validation failure for ${finalUrl}: ` +
      `${error?.message || error}`
    );
  }

  let recovery = null;
  const establishedFeed = Boolean(feed?.id && feed?.userId);
  if (establishedFeed && !isSameUrl(feed.url, finalUrl)) {
    const permanentRedirect = recoveryKind === 'http_redirect' &&
      isPermanentHttpRedirect(fetchOutcome, feed.url, finalUrl);
    const evidence = await verifyFeedRecoveryEvidence({
      feed,
      candidateFeed: parsedFeed,
      candidateFinalUrl: finalUrl,
      candidateBodyHash: fetchOutcome?.bodyHash,
      publisherSelf,
      execution
    });
    if (!permanentRedirect && !evidence.accepted) {
      return {
        recoveryRejected: true,
        recovery: buildRecoveryRejection({
          kind: recoveryKind,
          candidateUrl: finalUrl,
          evidence
        })
      };
    }
    recovery = {
      accepted: true,
      kind: permanentRedirect ? 'http_redirect' : recoveryKind,
      candidateUrl: finalUrl,
      evidence
    };
  }

  let resolvedFeed = await persistDiscoveredUrl(
    feed,
    finalUrl,
    execution,
    fetchOutcome
  );
  if (resolvedFeed && publisherSelf) {
    resolvedFeed = await persistPublisherSelfIdentity({
      feed: resolvedFeed,
      validation: publisherSelf,
      execution
    });
  }
  throwIfExecutionExpired(execution);
  return formatDiscoveryResult(
    finalUrl,
    parsedFeed,
    options,
    fetchOutcome,
    resolvedFeed,
    publisherSelf,
    recovery
  );
};

// Persists a newly discovered feed URL when it differs from the current one.
const persistDiscoveredUrl = async (
  feed,
  discoveredUrl,
  execution,
  fetchOutcome = null
) => {
  // Returns early when feed is unavailable.
  if (!feed) return null;
  // Returns early when discovered url is unavailable.
  if (!discoveredUrl) return feed;
  const persistedUrl = assertFeedPersistenceUrl(discoveredUrl);
  throwIfExecutionExpired(execution);
  if (feed.id && feed.userId) {
    try {
      const resolvedFeed = await persistDiscoveredFeedUrl({
        feed,
        discoveredUrl: persistedUrl,
        aliases: redirectAliasCandidates(fetchOutcome),
        execution
      });
      throwIfExecutionExpired(execution);
      return resolvedFeed;
    } catch (error) {
      error.code ||= 'FEED_RECONCILIATION_FAILED';
      throw error;
    }
  }
  if (isSameUrl(feed.url, persistedUrl)) return feed;
  await feed.update({ url: persistedUrl });
  throwIfExecutionExpired(execution);
  return feed;
};

// Removes duplicate candidate URLs while preserving discovery order.
const unique = (arr) => {
  // Tracks distinct seen while performing unique.
  const seen = new Set();
  // Collects the out while performing unique.
  const out = [];
  // Processes each arr entry in turn.
  for (const item of arr) {
    // Skips the current entry when item is unavailable.
    if (!item) continue;
    let key = item.url;
    try {
      key = new URL(item.url).href;
    } catch {
      // Invalid candidates are retained for the existing guarded fetch validation.
    }
    // Skips the current entry when seen contains item.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

// Defines the direct fetch retries enforced by this service.
const DIRECT_FETCH_RETRIES = 1;
// Defines the fallback fetch retries enforced by this service.
const FALLBACK_FETCH_RETRIES = 0;

// Creates an error when RSS discovery has exhausted its overall time budget.
const createDiscoveryTimeoutError = timeoutMs => {
  // Derives the error required while creating discovery timeout error.
  const error = new Error(
    `RSS discovery timed out after ${timeoutMs}ms`
  );
  error.name = 'TimeoutError';
  return error;
};

// Reports parser and execution failures that fallback probing cannot repair safely.
const isFatalDiscoveryError = error =>
  isFeedTimeoutError(error) ||
  error?.code === 'FEED_LEASE_LOST' ||
  error?.code === 'FEED_EXECUTION_CONTEXT_INVALID' ||
  error?.code === 'UNSAFE_FEED_XML' ||
  error?.code === 'FEED_INPUT_LIMIT_EXCEEDED' ||
  error?.code === 'FEED_RECONCILIATION_FAILED';

// Attempts RSS discovery from direct feeds, HTML link tags, social URL conventions, and common fallback paths.
export const discoverRssLink = async (url, feed, options = {}) => {
  try {
    // Handles the case where url is not url.
    if (!isURL(url)) {
      return undefined;
    }

    // Derives the discovery deadline required while performing discover rss link.
    const discoveryTimeoutMs = resolveFeedTimeoutMs();
    const discoveryDeadline = resolveDeadlineAt(
      options.execution?.deadlineAt ?? options.deadlineAt,
      discoveryTimeoutMs
    );
    const execution = options.execution || {
      deadlineAt: discoveryDeadline,
      signal: options.signal
    };
    const establishedFeed = Boolean(feed?.id && feed?.userId);
    const recoveryRejections = [];
    // Returns the first parsed rejection so candidate ordering determines diagnostics.
    const rejectedRecoveryResult = () => (
      recoveryRejections.length > 0 && options.includeParsedFeed
        ? {
            url: null,
            parsedFeed: null,
            feed: feed || null,
            recovery: recoveryRejections[0]
          }
        : undefined
    );
    throwIfExecutionExpired(execution);

    let youtubeRssCandidate = null;
    // YouTube short-circuit
    if (isYoutubeUrl(url)) {
      // Derives the yt rss through get youtube rss from handle while performing discover rss link.
      const ytRss = await getYoutubeRssFromHandle(url, execution);

      // Handles the case where yt rss is available.
      if (ytRss) {
        logFeedDebug(`Discovered YouTube RSS feed: ${ytRss}`);
        if (!establishedFeed) {
          const resolvedFeed = await persistDiscoveredUrl(feed, ytRss, execution);
          return options?.includeParsedFeed
            ? { url: ytRss, feed: resolvedFeed }
            : ytRss;
        }
        youtubeRssCandidate = ytRss;
      }

      // If YouTube resolution fails, continue with normal discovery
    }

    // Build candidate list, and validate each candidate by fetching + parsing.
    // This ensures that if one "looks" like a feed but fails to parse, we keep trying.

    // Fetches without allowing one candidate to exceed the remaining discovery budget.
    const fetchCandidate = async (
      candidate,
      retries,
      requestState = {},
      provenance = { role: 'candidate', kind: 'speculative' }
    ) => {
      // Derives the remaining ms required while performing fetch candidate.
      const remainingMs = discoveryDeadline - Date.now();
      // Rejects processing when remaining ms is at most value.
      if (remainingMs <= 0) throw createDiscoveryTimeoutError(discoveryTimeoutMs);

      const outcome = await acquireHttp({
        url: candidate,
        retries,
        deadlineAt: discoveryDeadline,
        signal: execution.signal,
        ...requestState
      });
      options.onFetchOutcome?.(outcome, {
        ...provenance,
        requestedUrl: candidate,
        resolvedUrl: outcome.response?.url || null
      });
      throwIfExecutionExpired(execution);
      return outcome;
    };

    const initialOutcome = await fetchCandidate(
      url,
      DIRECT_FETCH_RETRIES,
      options.conditionalRequest,
      { role: 'primary', kind: 'primary' }
    );
    const initialResponse = initialOutcome.response;
    if (
      initialOutcome.type === FETCH_OUTCOMES.NOT_MODIFIED ||
      initialOutcome.type === FETCH_OUTCOMES.UNCHANGED
    ) {
      const resolvedUrl = initialResponse?.url || url;
      const permanentRedirect = isPermanentHttpRedirect(
        initialOutcome,
        establishedFeed ? feed.url : url,
        resolvedUrl
      );
      let recovery = null;
      let shouldPromote = !establishedFeed ||
        isSameUrl(feed.url, resolvedUrl) ||
        permanentRedirect;
      if (establishedFeed && !shouldPromote) {
        const evidence = await verifyFeedRecoveryEvidence({
          feed,
          candidateFeed: null,
          candidateFinalUrl: resolvedUrl,
          candidateBodyHash: initialOutcome.bodyHash,
          execution
        });
        shouldPromote = evidence.accepted;
        recovery = shouldPromote
          ? {
              accepted: true,
              kind: 'http_redirect',
              candidateUrl: resolvedUrl,
              evidence
            }
          : buildRecoveryRejection({
              kind: 'http_redirect',
              candidateUrl: resolvedUrl,
              evidence
            });
      } else if (establishedFeed && permanentRedirect) {
        recovery = {
          accepted: true,
          kind: 'http_redirect',
          candidateUrl: resolvedUrl,
          evidence: null
        };
      }
      const resolvedFeed = shouldPromote
        ? await persistDiscoveredUrl(
            feed,
            resolvedUrl,
            execution,
            initialOutcome
          )
        : feed;
      return formatDiscoveryResult(
        shouldPromote ? resolvedUrl : feed.url,
        null,
        options,
        initialOutcome,
        resolvedFeed,
        null,
        recovery
      );
    }
    if (!isSuccessfulFetchOutcome(initialOutcome)) {
      logFeedDebug(
        `[Error] Initial fetch failed for ${url}: ` +
        `${initialOutcome.error?.message || initialOutcome.type}`
      );
    }

    // Detect Cloudflare bot protection early (check headers + status only, no body read)
    if (initialResponse && !isSuccessfulFetchOutcome(initialOutcome)) {
      // Normalizes the server before performing discover rss link.
      const server = (initialResponse.headers.server || '').toLowerCase();
      // Handles the case where server contains cloudflare and initial response status is 403 or initial response status is 503.
      if (server.includes('cloudflare') && (initialResponse.status === 403 || initialResponse.status === 503)) {
        logFeedDebug(`[Cloudflare] Bot protection detected for ${url} (status ${initialResponse.status})`);
        return { cloudflare: true, url };
      }
    }

    if (
      !isSuccessfulFetchOutcome(initialOutcome) &&
      !isRecoverableMissingEndpoint(initialOutcome)
    ) {
      return undefined;
    }

    // Use the final redirected URL if available
    const responseUrl = initialResponse?.url || url;

    // Collects bluesky rss candidate for the selection made while performing discover rss link.
    const blueskyRssCandidate =
      getBlueskyRssCandidate(responseUrl) || getBlueskyRssCandidate(url);
    // Collects mastodon rss candidate for the selection made while performing discover rss link.
    const mastodonRssCandidate =
      getMastodonRssCandidate(responseUrl) || getMastodonRssCandidate(url);

    // Collects the html candidates while performing discover rss link.
    const htmlCandidates = [];
    // Handles the case where ok is available.
    if (isSuccessfulFetchOutcome(initialOutcome)) {
      // Derives the ct required while performing discover rss link.
      const ct = initialResponse.headers['content-type'] || '';
      const body = initialOutcome.bodyText;

      // Parse before inspecting HTML because some feeds are served with a generic content type.
      const parsedFeed = body
        ? await parseFeedBody(
            body,
            execution,
            options.onParseFailure,
            {
              role: 'primary',
              kind: 'primary',
              requestedUrl: url,
              resolvedUrl: responseUrl
            }
          )
        : null;
      // Handles the case where parsed feed is available.
      if (parsedFeed) {
        const completion = await completeParsedDiscovery({
          feed,
          userId: options.userId,
          finalUrl: responseUrl,
          parsedFeed,
          options,
          fetchOutcome: initialOutcome,
          execution,
          recoveryKind: isSameUrl(url, responseUrl)
            ? 'direct'
            : 'http_redirect'
        });
        if (!completion?.recoveryRejected) return completion;
        recoveryRejections.push(completion.recovery);
      }

      // Handles the case where ct is not likely feed content type.
      if (!isLikelyFeedContentType(ct)) {
        throwIfExecutionExpired(execution);
        htmlCandidates.push(...extractHtmlDiscoveryCandidates(body, responseUrl));
      }
    }

    // Derives the base url through get base url while performing discover rss link.
    const baseUrl = getBaseUrl(responseUrl);

    if (
      (feed || !isSuccessfulFetchOutcome(initialOutcome)) &&
      baseUrl &&
      !isSameUrl(baseUrl, responseUrl)
    ) {
      const homepageOutcome = await fetchCandidate(
        baseUrl,
        FALLBACK_FETCH_RETRIES,
        {},
        { role: 'candidate', kind: 'homepage', speculative: true }
      );
      if (isSuccessfulFetchOutcome(homepageOutcome)) {
        const homepageResponse = homepageOutcome.response;
        const homepageBody = homepageOutcome.bodyText;
        const homepageFeed = await parseFeedBody(
          homepageBody,
          execution,
          options.onParseFailure,
          {
            role: 'candidate',
            kind: 'homepage',
            requestedUrl: baseUrl,
            resolvedUrl: homepageResponse.url || baseUrl,
            speculative: true
          }
        );
        if (homepageFeed) {
          const completion = await completeParsedDiscovery({
            feed,
            userId: options.userId,
            finalUrl: homepageResponse.url || baseUrl,
            parsedFeed: homepageFeed,
            options,
            fetchOutcome: homepageOutcome,
            execution,
            recoveryKind: 'homepage'
          });
          if (!completion?.recoveryRejected) return completion;
          recoveryRejections.push(completion.recovery);
        }
        htmlCandidates.push(...extractHtmlDiscoveryCandidates(
          homepageBody,
          homepageResponse.url || baseUrl
        ));
      } else if (!isRecoverableMissingEndpoint(homepageOutcome)) {
        return undefined;
      }
    }

    // Collects the common paths while performing discover rss link.
    const commonPaths = [
      '/feed',
      '/feed.xml',
      '/rss',
      '/rss.xml',
      '/atom.xml'
    ];

    // The original and redirected URLs were already checked by the initial fetch.
    const fallbackCandidates = unique([
      ...(youtubeRssCandidate
        ? [{ url: youtubeRssCandidate, kind: 'platform_convention' }]
        : []),
      ...(blueskyRssCandidate
        ? [{ url: blueskyRssCandidate, kind: 'platform_convention' }]
        : []),
      ...(mastodonRssCandidate
        ? [{ url: mastodonRssCandidate, kind: 'platform_convention' }]
        : []),
      ...htmlCandidates,
      ...(baseUrl ? commonPaths.map(path => ({
        url: resolveLink(baseUrl, path),
        kind: 'conventional_path'
      })) : [])
    ]);

    // Processes each fallback candidates entry in turn.
    for (const candidate of fallbackCandidates) {
      try {
        logFeedDebug(`Trying RSS candidate: ${candidate.url}`);
        // Fetches the candidate while performing discover rss link.
        const candidateOutcome = await fetchCandidate(
          candidate.url,
          FALLBACK_FETCH_RETRIES,
          {},
          {
            role: 'candidate',
            kind: candidate.kind,
            speculative: candidate.kind !== 'html_alternate'
          }
        );
        const candidateResponse = candidateOutcome.response;
        
        // Skips the current entry when acquisition is unavailable.
        if (!isSuccessfulFetchOutcome(candidateOutcome)) {
          if (
            candidateOutcome.type === FETCH_OUTCOMES.TIMED_OUT &&
            Date.now() >= discoveryDeadline
          ) {
            break;
          }
          if (!isRecoverableMissingEndpoint(candidateOutcome)) {
            return rejectedRecoveryResult();
          }
          continue;
        }
        
        const body = candidateOutcome.bodyText;
        
        // Parse the candidate here so callers do not need to fetch a valid feed again.
        const parsedFeed = await parseFeedBody(
          body,
          execution,
          options.onParseFailure,
          {
            role: 'candidate',
            kind: candidate.kind,
            requestedUrl: candidate.url,
            resolvedUrl: candidateResponse.url || candidate.url,
            speculative: candidate.kind !== 'html_alternate'
          }
        );
        // Handles the case where parsed feed is available.
        if (parsedFeed) {
          // Derives the discovered url required while performing discover rss link.
          const discoveredUrl = candidateResponse.url || candidate.url;
          const completion = await completeParsedDiscovery({
            feed,
            userId: options.userId,
            finalUrl: discoveredUrl,
            parsedFeed,
            options,
            fetchOutcome: candidateOutcome,
            execution,
            recoveryKind: candidate.kind
          });
          if (!completion?.recoveryRejected) return completion;
          recoveryRejections.push(completion.recovery);
        }
        
        // If not a feed, check for meta refresh redirect
        if (body) {
          throwIfExecutionExpired(execution);
          // Performs the load operation while performing discover rss link.
          const $ = load(String(body));
          // Derives the meta refresh through attr while performing discover rss link.
          const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
          // Handles the case where meta refresh is available.
          if (metaRefresh) {
            // Derives the url match through match while performing discover rss link.
            const urlMatch = metaRefresh.match(/url=(.+)/i);
            // Handles the case where url match is available.
            if (urlMatch) {
              // Derives the meta url through replace while performing discover rss link.
              const metaUrl = urlMatch[1].trim().replace(/['"]/g, '');
              // Resolves the link while performing discover rss link.
              const resolvedMetaUrl = resolveLink(
                candidateResponse.url || candidate.url,
                metaUrl
              );
              // Handles the case where resolved meta url is available.
              if (resolvedMetaUrl) {
                logFeedDebug(
                  `Found meta refresh from ${candidate.url} → ${resolvedMetaUrl}`
                );
                // Try the meta refresh URL immediately
                try {
                  // Fetches the candidate while performing discover rss link.
                  const metaOutcome = await fetchCandidate(
                    resolvedMetaUrl,
                    FALLBACK_FETCH_RETRIES,
                    {},
                    {
                      role: 'candidate',
                      kind: 'html_meta_refresh',
                      speculative: true
                    }
                  );
                  const metaResponse = metaOutcome.response;
                  // Handles the case where ok is available.
                  if (isSuccessfulFetchOutcome(metaOutcome)) {
                    const metaBody = metaOutcome.bodyText;
                    // Parses the feed body while performing discover rss link.
                    const parsedFeed = await parseFeedBody(
                      metaBody,
                      execution,
                      options.onParseFailure,
                      {
                        role: 'candidate',
                        kind: 'html_meta_refresh',
                        requestedUrl: resolvedMetaUrl,
                        resolvedUrl: metaResponse.url || resolvedMetaUrl,
                        speculative: true
                      }
                    );
                    // Handles the case where parsed feed is available.
                    if (parsedFeed) {
                      // Derives the discovered url required while performing discover rss link.
                      const discoveredUrl = metaResponse.url || resolvedMetaUrl;
                      const completion = await completeParsedDiscovery({
                        feed,
                        userId: options.userId,
                        finalUrl: discoveredUrl,
                        parsedFeed,
                        options,
                        fetchOutcome: metaOutcome,
                        execution,
                        recoveryKind: 'html_meta_refresh'
                      });
                      if (!completion?.recoveryRejected) return completion;
                      recoveryRejections.push(completion.recovery);
                    }
                  }
                } catch {
                  // Meta refresh target failed, continue to next candidate
                }
              }
            }
          }
        }
      } catch (e) {
        if (isFatalDiscoveryError(e)) throw e;
        // Candidate failed (fetch or parse). Continue to next candidate.
        logFeedDebug(
          `[Error] Candidate failed: ${candidate.url} - ${e.message}`
        );
        // Handles the case where e name is timeout error and now reaches discovery deadline.
        if (e.name === 'TimeoutError' && Date.now() >= discoveryDeadline) {
          break;
        }
      }
    }

    return rejectedRecoveryResult();

  } catch (e) {
    logFeedDebug(
      `[Error] Error discovering RSS link for ${url} ${e.message}`
    );

    if (isFatalDiscoveryError(e)) throw e;
    return undefined;
  }
};

export default {
  discoverRssLink
}
