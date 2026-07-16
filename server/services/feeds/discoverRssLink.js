// Discovers valid RSS or Atom feed URLs from website URLs, social profile URLs, or fallback feed paths.
// It validates candidates by content type and feed parsing, and can persist successful discoveries on feed models.
import { load } from 'cheerio';
import { fetchURL as fetchURLInternal } from '../../utils/fetchURL.js';
import { getYoutubeRssFromHandle } from './getYoutubeRssFromHandle.js';
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
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
};

// Builds the canonical Bluesky RSS URL for supported profile URLs.
const getBlueskyRssCandidate = (url) => {
  try {
    const u = new URL(url);
    if (u.host !== 'bsky.app') return null;
    if (!u.pathname.startsWith('/profile/')) return null;
    if (u.pathname.endsWith('/rss')) return u.toString();

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
    const u = new URL(url);
    if (!u.pathname.startsWith('/@')) return null;
    if (u.pathname.endsWith('.rss')) return u.toString();

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
  if (!feed) return;

  const newErrorCount = (feed.errorCount || 0) + 1;

  const updateData = {
    errorCount: newErrorCount,
    errorMessage: message
  };

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
  if (options?.includeParsedFeed) {
    return { url, parsedFeed };
  }

  return url;
};

// Persists a newly discovered feed URL when it differs from the current one.
const persistDiscoveredUrl = async (feed, discoveredUrl) => {
  if (!feed) return;
  if (!discoveredUrl) return;
  if (feed.url === discoveredUrl) return;

  try {
    await feed.update({ url: discoveredUrl });
  } catch {
    // Ignore (e.g. unique constraint). Discovery should not crash crawling.
  }
};

// Removes duplicate candidate URLs while preserving discovery order.
const unique = (arr) => {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
};

// Re-exports centralized URL fetching for callers that import it from this module.
export const fetchURL = async (url, retries = 2) =>
  // Backwards-compatible export: throw on failure so callers can handle
  fetchURLInternal(url, retries);

// Attempts RSS discovery from direct feeds, HTML link tags, social URL conventions, and common fallback paths.
export const discoverRssLink = async (url, feed, options = {}) => {
  try {
    if (!isURL(url)) {
      await registerDiscoveryError(feed, 'Invalid URL');
      return undefined;
    }

    // YouTube short-circuit
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const ytRss = await getYoutubeRssFromHandle(url);

      if (ytRss) {
        console.log(`Discovered YouTube RSS feed: ${ytRss}`);
        await persistDiscoveredUrl(feed, ytRss);
        return ytRss;
      }

      // If YouTube resolution fails, continue with normal discovery
    }

    // Build candidate list, and validate each candidate by fetching + parsing.
    // This ensures that if one "looks" like a feed but fails to parse, we keep trying.

    let initialResponse;
    try {
      initialResponse = await fetchURL(url);
    } catch (e) {
      // Still try fallbacks based on the URL we were given.
      console.log(`[Error] Initial fetch failed for ${url}: ${e.message}`);
    }

    // Detect Cloudflare bot protection early (check headers + status only, no body read)
    if (initialResponse && !initialResponse.ok) {
      const server = (initialResponse.headers?.get?.('server') || '').toLowerCase();
      if (server.includes('cloudflare') && (initialResponse.status === 403 || initialResponse.status === 503)) {
        console.log(`[Cloudflare] Bot protection detected for ${url} (status ${initialResponse.status})`);
        await registerDiscoveryError(feed, 'Cloudflare bot protection detected');
        return { cloudflare: true, url };
      }
    }

    // Use the final redirected URL if available
    const responseUrl = initialResponse?.url || url;

    const blueskyRssCandidate =
      getBlueskyRssCandidate(responseUrl) || getBlueskyRssCandidate(url);
    const mastodonRssCandidate =
      getMastodonRssCandidate(responseUrl) || getMastodonRssCandidate(url);

    const htmlCandidates = [];
    if (initialResponse?.ok) {
      const ct = initialResponse.headers.get('content-type') || '';
      const body = await initialResponse.text();

      // Parse before inspecting HTML because some feeds are served with a generic content type.
      const parsedFeed = body ? parseFeedBody(body) : null;
      if (parsedFeed) {
        await persistDiscoveredUrl(feed, responseUrl);
        return formatDiscoveryResult(responseUrl, parsedFeed, options);
      }

      if (!isLikelyFeedContentType(ct)) {
        if (body) {
          const $ = load(String(body));
          
          // Check for RSS/Atom links in HTML head
          const legacy =
            $('head link[type="application/rss+xml"]').attr('href') ||
            $('head link[type="application/atom+xml"]').attr('href');

          const rssLink = legacy ? resolveLink(responseUrl, legacy) : null;
          if (rssLink) {
            console.log(`Found RSS link in HTML head: ${rssLink}`);
            htmlCandidates.push(rssLink);
          }
          
          // Check for meta refresh redirects (e.g., <meta http-equiv="refresh" content="0; url=...">)
          const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
          if (metaRefresh) {
            const urlMatch = metaRefresh.match(/url=(.+)/i);
            if (urlMatch) {
              const metaUrl = urlMatch[1].trim().replace(/['"]/g, '');
              const resolvedMetaUrl = resolveLink(responseUrl, metaUrl);
              if (resolvedMetaUrl) {
                console.log(`Found meta refresh redirect: ${resolvedMetaUrl}`);
                htmlCandidates.push(resolvedMetaUrl);
              }
            }
          }
        }
      }
    }

    const baseUrl = getBaseUrl(responseUrl);

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

    // Include the original URL and the redirected URL as top candidates
    const fallbackCandidates = unique([
      responseUrl,  // Try the redirected URL first
      url,          // Then the original URL
      blueskyRssCandidate,
      mastodonRssCandidate,
      ...htmlCandidates,
      baseUrl,
      ...(baseUrl ? commonPaths.map(p => resolveLink(baseUrl, p)) : [])
    ]);

    for (const candidate of fallbackCandidates) {
      try {
        console.log(`Trying RSS candidate: ${candidate}`);
        const candidateResponse = await fetchURL(candidate);
        
        if (!candidateResponse?.ok) continue;
        
        // Read body once
        const body = await candidateResponse.text();
        
        // Parse the candidate here so callers do not need to fetch a valid feed again.
        const parsedFeed = parseFeedBody(body);
        if (parsedFeed) {
          const discoveredUrl = candidateResponse.url || candidate;
          await persistDiscoveredUrl(feed, discoveredUrl);
          return formatDiscoveryResult(discoveredUrl, parsedFeed, options);
        }
        
        // If not a feed, check for meta refresh redirect
        if (body) {
          const $ = load(String(body));
          const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
          if (metaRefresh) {
            const urlMatch = metaRefresh.match(/url=(.+)/i);
            if (urlMatch) {
              const metaUrl = urlMatch[1].trim().replace(/['"]/g, '');
              const resolvedMetaUrl = resolveLink(candidateResponse.url || candidate, metaUrl);
              if (resolvedMetaUrl) {
                console.log(`Found meta refresh from ${candidate} → ${resolvedMetaUrl}`);
                // Try the meta refresh URL immediately
                try {
                  const metaResponse = await fetchURL(resolvedMetaUrl);
                  if (metaResponse?.ok) {
                    const metaBody = await metaResponse.text();
                    const parsedFeed = parseFeedBody(metaBody);
                    if (parsedFeed) {
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
      }
    }

    await registerDiscoveryError(feed, 'No RSS link discovered');
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
