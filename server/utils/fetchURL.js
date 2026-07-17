// Centralized URL fetching with timeout, retry logic, redirects, and RSS-friendly request headers.
// Uses native fetch from Node.js 18+ so feed discovery and parsing share consistent network behavior.

// Waits for a retry backoff interval.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Detects transient network errors that are worth retrying.
const isRetryableFetchError = err => {
  const msg = err?.message || '';
  return (
    err?.name === 'AbortError' ||
    err?.name === 'TimeoutError' ||
    msg.includes('socket hang up') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed')
  );
};

// Creates a consistent timeout error when the total fetch budget is exhausted.
const createTimeoutError = () => {
  const error = new Error('The fetch operation timed out');
  error.name = 'TimeoutError';
  return error;
};

// Fetches a URL within one total timeout budget, including retries and body consumption.
export const fetchURL = async (url, retries = 1, timeoutMs = 5000) => {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;

  // Performs one fetch attempt and recursively retries retryable failures.
  const attemptFetch = async attempt => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw createTimeoutError();

    const attemptStartedAt = Date.now();
    // Keep the signal alive after headers arrive so response body reads share the deadline.
    const signal = AbortSignal.timeout(remainingMs);

    const options = {
      signal,
      redirect: 'follow',  // Explicitly follow redirects
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
      
      // Log redirects for debugging
      if (response.url && response.url !== url) {
        console.log(`[Redirect] ${url} → ${response.url}`);
      }
      
      return response;
    } catch (err) {
      if (isRetryableFetchError(err) && attempt < retries) {
        const remainingAfterFailureMs = deadline - Date.now();
        const waitTime = Math.min(500 * (attempt + 1), remainingAfterFailureMs);
        if (waitTime <= 0) throw err;

        const elapsedMs = Date.now() - attemptStartedAt;
        console.log(
          `[Error] Fetch attempt ${attempt + 1} failed after ${elapsedMs}ms ` +
          `for ${url}, retrying in ${waitTime}ms...`
        );
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
