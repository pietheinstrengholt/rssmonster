import { load } from 'cheerio';
import { parseFeed } from 'feedsmith';
import { fetchURL as fetchURLInternal } from './fetchURL.js';

//function to return overlap
const findOverlap = (a, b) => {
  if (b.length === 0) {
    return "";
  }
  if (a.endsWith(b)) {
    return b;
  }
  if (a.indexOf(b) >= 0) {
    return b;
  }
  return findOverlap(a, b.substring(0, b.length - 1));
}

//function to validate if url is valid url
const isURL = (str) => {
  var regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#:.?+=&%!\-\/]))?/;
  return regex.test(str);
}

const resolveLink = (base, href) => {
  try {
    return new URL(href, base).toString();
  } catch (e) {
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

const isValidFeedResponse = async (response) => {
  if (!response?.ok) return false;

  // Always validate by body content. Content-Type is unreliable in the wild
  // and we want retries when a URL returns non-feed XML/HTML.
  const body = await response.text();
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

export const fetchURL = async (url, retries = 2) => {
  // Backwards-compatible export: throw on failure so callers can handle
  return fetchURLInternal(url, retries);
};

export const discoverRssLink = async (url, feed) => {
  try {
    if (!isURL(url)) {
      await registerDiscoveryError(feed, 'Invalid URL');
      return undefined;
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

    const responseUrl = initialResponse?.url || url;

    const htmlCandidates = [];
    if (initialResponse?.ok) {
      const ct = initialResponse.headers.get('content-type') || '';
      if (isLikelyFeedContentType(ct)) {
        // Don't immediately accept; validate by parsing to enable retry fallback on parse failures.
        const body = await initialResponse.text();
        if (body && (isLikelyFeedBody(body) || canParseFeed(body))) {
          console.log(`Discovered feed URL directly: ${responseUrl}`);
          await persistDiscoveredUrl(feed, responseUrl);
          return responseUrl;
        }
      } else {
        const body = await initialResponse.text();
        if (body) {
          const $ = load(String(body));
          const legacy =
            $('head link[type="application/rss+xml"]').attr('href') ||
            $('head link[type="application/atom+xml"]').attr('href');

          const rssLink = legacy ? resolveLink(responseUrl, legacy) : null;
          if (rssLink) {
            htmlCandidates.push(rssLink);
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
      '/atom',
      '/atom.xml'
    ];

    const fallbackCandidates = unique([
      responseUrl,
      ...htmlCandidates,
      baseUrl,
      ...(baseUrl ? commonPaths.map(p => resolveLink(baseUrl, p)) : [])
    ]);

    for (const candidate of fallbackCandidates) {
      try {
        console.log(`Trying RSS candidate: ${candidate}`);
        const candidateResponse = await fetchURL(candidate);
        if (await isValidFeedResponse(candidateResponse)) {
          const discoveredUrl = candidateResponse.url || candidate;
          await persistDiscoveredUrl(feed, discoveredUrl);
          return discoveredUrl;
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