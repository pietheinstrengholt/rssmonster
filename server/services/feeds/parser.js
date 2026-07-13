// Fetches and parses RSS/Atom feed documents into feedsmith feed objects.
// It normalizes common fetch and parse failures into cleaner application error codes.
import { parseFeed } from 'feedsmith';
import { fetchURL } from '../../utils/fetchURL.js';

// Downloads a feed URL, validates the response, and returns the parsed feed object.
export const process = async (feedUrl) => {
  try {
    if (!feedUrl) {
      const err = new Error('Missing feed URL');
      err.code = 'INVALID_FEED_URL';
      throw err;
    }

    const response = await fetchURL(feedUrl);
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
    return feed; // return object, NOT string

  } catch (err) {
    // Preserve errors that were deliberately classified above.
    if (err?.code) {
      throw err;
    }

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
