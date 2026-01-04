import { load } from 'cheerio';
// Use native fetch (Node.js 18+) for better HTTP/2 support

// Helper function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

const isLikelyFeedContentType = (ct = "") => /xml|rss|atom/i.test(ct);

export const fetchURL = async (url, retries = 2) => {
  const attemptFetch = async (attempt) => {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const options = {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache"
      }
    };

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      
      // Retry on network errors
      const isRetryable = err.message && (
        err.message.includes('socket hang up') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('fetch failed') ||
        err.name === 'AbortError'
      );
      
      if (isRetryable && attempt < retries) {
        const waitTime = 1000 * (attempt + 1); // Exponential backoff: 1s, 2s
        console.log(`Fetch attempt ${attempt + 1} failed for ${url}, retrying in ${waitTime}ms...`);
        await delay(waitTime);
        return attemptFetch(attempt + 1);
      }
      
      throw err;
    }
  };

  try {
    return await attemptFetch(0);

  } catch (e) {
    console.log(
      "Error fetching RSS link for " + url + " " + e.message
    );
  }
}

export const discoverRssLink = async (url) => {
  try {
    if (!isURL(url)) {
      return undefined;
    }

    const response = await fetchURL(url);
    if (!response?.ok) {
      return undefined;
    }

    const responseUrl = response.url || url;
    const contentType = response.headers.get("content-type") || "";

    // If the response is already a feed, accept the URL as-is (handles users pasting feed URLs directly)
    if (isLikelyFeedContentType(contentType)) {
      return responseUrl;
    }

    const body = await response.text();

    if (body) {
      const $ = load(String(body));

      // Only use legacy type selectors; skip rel="alternate" parsing
      const legacy = $('head link[type="application/rss+xml"]').attr("href") || $('head link[type="application/atom+xml"]').attr("href");
      const rssLink = legacy ? resolveLink(responseUrl, legacy) : null;

      if (rssLink) {
        return rssLink;
      }
    }

    // Fallback guesses for common feed endpoints
    const fallbackPaths = ['/feed', '/rss.xml', '/atom.xml'];
    for (const path of fallbackPaths) {
      const candidate = resolveLink(responseUrl, path);
      if (!candidate) {
        continue;
      }

      try {
        const guessResponse = await fetchURL(candidate);
        if (!guessResponse?.ok) {
          continue;
        }
        const guessCt = guessResponse.headers.get('content-type') || '';
        if (isLikelyFeedContentType(guessCt)) {
          return guessResponse.url || candidate;
        }
      } catch (e) {
        // Ignore and continue trying other fallbacks
      }
    }

    return responseUrl;
  } catch (e) {
    console.log(
      "Error discovering RSS link for " + url + " " + e.message
    );
  }
}

export default {
  fetchURL,
  discoverRssLink
}