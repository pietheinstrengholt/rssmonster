import { parseFeed } from 'feedsmith';
import { fetchURL } from './fetchURL.js';

export const process = async (feedUrl, { etag = null, lastModified = null } = {}) => {
  try {
    if (!feedUrl) {
      const err = new Error('Missing feed URL');
      err.code = 'INVALID_FEED_URL';
      throw err;
    }

    const response = await fetchURL(feedUrl, 2, { etag, lastModified });

    // Handle 304 Not Modified: feed has not changed
    if (response.status === 304) {
      return {
        status: 304,
        cached: true,
        feed: null,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified')
      };
    }

    if (!response?.ok) {
      const status = response?.status;
      const err = new Error(`Feed fetch failed${status ? ` (HTTP ${status})` : ''}`);
      err.code = 'FEED_FETCH_ERROR';
      throw err;
    }

    const body = await response.text();
    if (!body) {
      const err = new Error('Empty feed response');
      err.code = 'EMPTY_FEED_RESPONSE';
      throw err;
    }

    const feed = parseFeed(body);

    // Extract etag and last-modified from response headers
    const etagValue = response.headers.get('etag');
    const lastModifiedValue = response.headers.get('last-modified');

    return {
      status: response.status,
      cached: false,
      feed,
      etag: etagValue,
      lastModified: lastModifiedValue
    };
  } catch (err) {
    // Suppress feedsmith stack trace
    if (err?.message === 'Unrecognized feed format') {
      const cleanError = new Error('Invalid or unsupported feed format');
      cleanError.code = 'INVALID_FEED';
      throw cleanError;
    }

    // Fallback: rethrow generic error without stack noise
    const cleanError = new Error(err?.message || 'Feed parsing failed');
    cleanError.code = 'FEED_PARSE_ERROR';
    throw cleanError;
  }
};

export default {
  process
};
