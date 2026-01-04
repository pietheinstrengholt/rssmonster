import { parseFeed } from 'feedsmith';
import { fetchURL } from "./discoverRssLink.js";

export const process = async (feedUrl) => {
  try {
    const response = await fetchURL(feedUrl);
    const body = await response.text();

    const feed = parseFeed(body);
    return feed; // return object, NOT string

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
