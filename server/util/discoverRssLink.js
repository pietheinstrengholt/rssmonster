import { load } from 'cheerio';
import { parseFeed } from 'feedsmith';
import { fetchURL as fetchURLInternal } from './fetchURL.js';
import { getYoutubeRssFromHandle } from './getYoutubeRssFromHandle.js';

//function to validate if url is valid url
const isURL = (str) => {
  var regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#:.?+=&%!\-\/]))?/;
  return regex.test(str);
}

const resolveLink = (base, href) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

const getBaseUrl = (url) => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
};

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

const isLikelyFeedContentType = (ct = "") => /xml|rss|atom/i.test(ct);

const isLikelyFeedBody = (body = "") => {
  const head = String(body).trim().slice(0, 500).toLowerCase();
  return (
    head.startsWith('<?xml') ||
    head.includes('<rss') ||
    head.includes('<feed')
  );
};

const canParseFeed = (body) => {
  try {
    parseFeed(String(body));
    return true;
  } catch {
    return false;
  }
};

const isValidFeedBody = (body) => {
  if (!body) return false;
  return isLikelyFeedBody(body) || canParseFeed(body);
};

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

export const fetchURL = async (url, retries = 2) =>
  // Backwards-compatible export: throw on failure so callers can handle
  fetchURLInternal(url, retries);

export const discoverRssLink = async (url, feed) => {
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
      
      if (isLikelyFeedContentType(ct)) {
        // Don't immediately accept; validate by parsing to enable retry fallback on parse failures.
        if (isValidFeedBody(body)) {
          console.log(`Discovered feed URL directly: ${responseUrl}`);
          await persistDiscoveredUrl(feed, responseUrl);
          return responseUrl;
        }
      } else {
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
        
        // Check if it's a valid feed
        if (isValidFeedBody(body)) {
          const discoveredUrl = candidateResponse.url || candidate;
          await persistDiscoveredUrl(feed, discoveredUrl);
          return discoveredUrl;
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
                    if (isValidFeedBody(metaBody)) {
                      const discoveredUrl = metaResponse.url || resolvedMetaUrl;
                      await persistDiscoveredUrl(feed, discoveredUrl);
                      return discoveredUrl;
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