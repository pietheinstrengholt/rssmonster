// util/fetchURL.js
// Centralized fetch with timeout + retry logic.
// Uses native fetch (Node.js 18+)

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableFetchError = err => {
  const msg = err?.message || '';
  return (
    err?.name === 'AbortError' ||
    msg.includes('socket hang up') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed')
  );
};

export const fetchURL = async (url, retries = 2) => {
  const attemptFetch = async attempt => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const options = {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    };

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);

      if (isRetryableFetchError(err) && attempt < retries) {
        const waitTime = 1000 * (attempt + 1);
        console.log(`[Error] Fetch attempt ${attempt + 1} failed for ${url}, retrying in ${waitTime}ms...`);
        await delay(waitTime);
        return attemptFetch(attempt + 1);
      }

      throw err;
    }
  };

  return attemptFetch(0);
};

export default {
  fetchURL
};
