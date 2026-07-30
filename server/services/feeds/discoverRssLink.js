// Discovers valid RSS or Atom feed URLs from website URLs, social profile URLs, or fallback feed paths.
// It validates candidates by content type and feed parsing, and can persist successful discoveries on feed models.
import { load } from 'cheerio';
import { fetchURL as fetchURLInternal } from '../../utils/fetchURL.js';
import {
  getYoutubeRssFromHandle,
  isYoutubeUrl
} from './getYoutubeRssFromHandle.js';
import { parseFeedSource } from './feedsmith/parseFeed.js';

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

// Records a discovery failure on the feed without letting discovery errors escape.
const registerDiscoveryError = async (feed, message) => {
  // Returns early when feed is unavailable.
  if (!feed) return;

  // Tracks new error count for the processing summary.
  const newErrorCount = (feed.errorCount || 0) + 1;

  // Builds the update data assembled while performing register discovery error.
  const updateData = {
    errorCount: newErrorCount,
    errorMessage: message
  };

  // Handles the case where new error count exceeds 25.
  if (newErrorCount > 25) {
    updateData.status = 'error';
  }

  try {
    await feed.update(updateData);
  } catch {
    // fail silently – discovery should never crash crawl
  }
};

// Checks whether a response content type is likely to contain feed XML.
const isLikelyFeedContentType = (ct = "") => /xml|rss|atom/i.test(ct);

// Parses a response body once and returns null when it is not a valid feed.
const parseFeedBody = (body) => {
  try {
    return parseFeedSource(body);
  } catch {
    return null;
  }
};

// Returns either the legacy URL string or the URL with its already-parsed feed.
const formatDiscoveryResult = (url, parsedFeed, options) => {
  // Returns early when include parsed feed is available.
  if (options?.includeParsedFeed) {
    return { url, parsedFeed };
  }

  return url;
};

// Persists a newly discovered feed URL when it differs from the current one.
const persistDiscoveredUrl = async (feed, discoveredUrl) => {
  // Returns early when feed is unavailable.
  if (!feed) return;
  // Returns early when discovered url is unavailable.
  if (!discoveredUrl) return;
  // Returns early when feed url is discovered url.
  if (feed.url === discoveredUrl) return;

  try {
    await feed.update({ url: discoveredUrl });
  } catch {
    // Ignore (e.g. unique constraint). Discovery should not crash crawling.
  }
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
    // Skips the current entry when seen contains item.
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
};

// Re-exports centralized URL fetching for callers that import it from this module.
export const fetchURL = async (url, retries = 1, timeoutMs = 5000) =>
  // Backwards-compatible export: throw on failure so callers can handle
  fetchURLInternal(url, retries, timeoutMs);

// Defines the direct fetch retries enforced by this service.
const DIRECT_FETCH_RETRIES = 1;
// Defines the direct fetch timeout ms enforced by this service.
const DIRECT_FETCH_TIMEOUT_MS = 5000;
// Defines the fallback fetch retries enforced by this service.
const FALLBACK_FETCH_RETRIES = 0;
// Defines the fallback fetch timeout ms enforced by this service.
const FALLBACK_FETCH_TIMEOUT_MS = 3000;
// Defines the discovery timeout ms enforced by this service.
const DISCOVERY_TIMEOUT_MS = 15000;

// Creates an error when RSS discovery has exhausted its overall time budget.
const createDiscoveryTimeoutError = () => {
  // Derives the error required while creating discovery timeout error.
  const error = new Error(
    `RSS discovery timed out after ${DISCOVERY_TIMEOUT_MS}ms`
  );
  error.name = 'TimeoutError';
  return error;
};

// Attempts RSS discovery from direct feeds, HTML link tags, social URL conventions, and common fallback paths.
export const discoverRssLink = async (url, feed, options = {}) => {
  try {
    // Handles the case where url is not url.
    if (!isURL(url)) {
      await registerDiscoveryError(feed, 'Invalid URL');
      return undefined;
    }

    // Derives the discovery deadline required while performing discover rss link.
    const discoveryDeadline = Date.now() + DISCOVERY_TIMEOUT_MS;

    // YouTube short-circuit
    if (isYoutubeUrl(url)) {
      // Derives the yt rss through get youtube rss from handle while performing discover rss link.
      const ytRss = await getYoutubeRssFromHandle(url);

      // Handles the case where yt rss is available.
      if (ytRss) {
        console.log(`Discovered YouTube RSS feed: ${ytRss}`);
        await persistDiscoveredUrl(feed, ytRss);
        return ytRss;
      }

      // If YouTube resolution fails, continue with normal discovery
    }

    // Build candidate list, and validate each candidate by fetching + parsing.
    // This ensures that if one "looks" like a feed but fails to parse, we keep trying.

    // Fetches without allowing one candidate to exceed the remaining discovery budget.
    const fetchCandidate = async (candidate, retries, timeoutMs) => {
      // Derives the remaining ms required while performing fetch candidate.
      const remainingMs = discoveryDeadline - Date.now();
      // Rejects processing when remaining ms is at most value.
      if (remainingMs <= 0) throw createDiscoveryTimeoutError();

      return fetchURL(candidate, retries, Math.min(timeoutMs, remainingMs));
    };

    let initialResponse;
    try {
      initialResponse = await fetchCandidate(
        url,
        DIRECT_FETCH_RETRIES,
        DIRECT_FETCH_TIMEOUT_MS
      );
    } catch (e) {
      // Still try fallbacks based on the URL we were given.
      console.log(`[Error] Initial fetch failed for ${url}: ${e.message}`);
    }

    // Detect Cloudflare bot protection early (check headers + status only, no body read)
    if (initialResponse && !initialResponse.ok) {
      // Normalizes the server before performing discover rss link.
      const server = (initialResponse.headers?.get?.('server') || '').toLowerCase();
      // Handles the case where server contains cloudflare and initial response status is 403 or initial response status is 503.
      if (server.includes('cloudflare') && (initialResponse.status === 403 || initialResponse.status === 503)) {
        console.log(`[Cloudflare] Bot protection detected for ${url} (status ${initialResponse.status})`);
        await registerDiscoveryError(feed, 'Cloudflare bot protection detected');
        return { cloudflare: true, url };
      }
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
    if (initialResponse?.ok) {
      // Derives the ct required while performing discover rss link.
      const ct = initialResponse.headers.get('content-type') || '';
      // Derives the body through text while performing discover rss link.
      const body = await initialResponse.text();

      // Parse before inspecting HTML because some feeds are served with a generic content type.
      const parsedFeed = body ? parseFeedBody(body) : null;
      // Handles the case where parsed feed is available.
      if (parsedFeed) {
        await persistDiscoveredUrl(feed, responseUrl);
        return formatDiscoveryResult(responseUrl, parsedFeed, options);
      }

      // Handles the case where ct is not likely feed content type.
      if (!isLikelyFeedContentType(ct)) {
        // Handles the case where body is available.
        if (body) {
          // Performs the load operation while performing discover rss link.
          const $ = load(String(body));
          
          // Check for RSS/Atom links in HTML head
          const legacy =
            $('head link[type="application/rss+xml"]').attr('href') ||
            $('head link[type="application/atom+xml"]').attr('href');

          // Selects the rss link based on whether legacy is available.
          const rssLink = legacy ? resolveLink(responseUrl, legacy) : null;
          // Handles the case where rss link is available.
          if (rssLink) {
            console.log(`Found RSS link in HTML head: ${rssLink}`);
            htmlCandidates.push(rssLink);
          }
          
          // Check for meta refresh redirects (e.g., <meta http-equiv="refresh" content="0; url=...">)
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
              const resolvedMetaUrl = resolveLink(responseUrl, metaUrl);
              // Handles the case where resolved meta url is available.
              if (resolvedMetaUrl) {
                console.log(`Found meta refresh redirect: ${resolvedMetaUrl}`);
                htmlCandidates.push(resolvedMetaUrl);
              }
            }
          }
        }
      }
    }

    // Derives the base url through get base url while performing discover rss link.
    const baseUrl = getBaseUrl(responseUrl);

    // Collects the common paths while performing discover rss link.
    const commonPaths = [
      '/feed',
      '/feed.xml',
      '/rss',
      '/rss.xml',
      '/rss/news',
      '/rss/feed',
      '/atom',
      '/atom.xml',
      '/feeds/all',
      '/feeds/posts/default'
    ];

    // The original and redirected URLs were already checked by the initial fetch.
    const fallbackCandidates = unique([
      blueskyRssCandidate,
      mastodonRssCandidate,
      ...htmlCandidates,
      baseUrl,
      ...(baseUrl ? commonPaths.map(p => resolveLink(baseUrl, p)) : [])
    ]);

    let discoveryError = 'No RSS link discovered';
    // Processes each fallback candidates entry in turn.
    for (const candidate of fallbackCandidates) {
      try {
        console.log(`Trying RSS candidate: ${candidate}`);
        // Fetches the candidate while performing discover rss link.
        const candidateResponse = await fetchCandidate(
          candidate,
          FALLBACK_FETCH_RETRIES,
          FALLBACK_FETCH_TIMEOUT_MS
        );
        
        // Skips the current entry when ok is unavailable.
        if (!candidateResponse?.ok) continue;
        
        // Read body once
        const body = await candidateResponse.text();
        
        // Parse the candidate here so callers do not need to fetch a valid feed again.
        const parsedFeed = parseFeedBody(body);
        // Handles the case where parsed feed is available.
        if (parsedFeed) {
          // Derives the discovered url required while performing discover rss link.
          const discoveredUrl = candidateResponse.url || candidate;
          await persistDiscoveredUrl(feed, discoveredUrl);
          return formatDiscoveryResult(discoveredUrl, parsedFeed, options);
        }
        
        // If not a feed, check for meta refresh redirect
        if (body) {
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
              const resolvedMetaUrl = resolveLink(candidateResponse.url || candidate, metaUrl);
              // Handles the case where resolved meta url is available.
              if (resolvedMetaUrl) {
                console.log(`Found meta refresh from ${candidate} → ${resolvedMetaUrl}`);
                // Try the meta refresh URL immediately
                try {
                  // Fetches the candidate while performing discover rss link.
                  const metaResponse = await fetchCandidate(
                    resolvedMetaUrl,
                    FALLBACK_FETCH_RETRIES,
                    FALLBACK_FETCH_TIMEOUT_MS
                  );
                  // Handles the case where ok is available.
                  if (metaResponse?.ok) {
                    // Derives the meta body through text while performing discover rss link.
                    const metaBody = await metaResponse.text();
                    // Parses the feed body while performing discover rss link.
                    const parsedFeed = parseFeedBody(metaBody);
                    // Handles the case where parsed feed is available.
                    if (parsedFeed) {
                      // Derives the discovered url required while performing discover rss link.
                      const discoveredUrl = metaResponse.url || resolvedMetaUrl;
                      await persistDiscoveredUrl(feed, discoveredUrl);
                      return formatDiscoveryResult(discoveredUrl, parsedFeed, options);
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
        // Candidate failed (fetch or parse). Continue to next candidate.
        console.log(`[Error] Candidate failed: ${candidate} - ${e.message}`);
        // Handles the case where e name is timeout error and now reaches discovery deadline.
        if (e.name === 'TimeoutError' && Date.now() >= discoveryDeadline) {
          discoveryError = e.message;
          break;
        }
      }
    }

    await registerDiscoveryError(feed, discoveryError);
    return undefined;

  } catch (e) {
    console.log(
      `[Error] Error discovering RSS link for ${url} ${e.message}`
    );

    await registerDiscoveryError(feed, e.message);
    return undefined;
  }
};

export default {
  fetchURL,
  discoverRssLink
}
