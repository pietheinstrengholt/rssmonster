import { parseFeed as parseFeedsmithFeed } from 'feedsmith';

import { fetchURL } from '../../../utils/fetchURL.js';
import normalizeFeed from './normalizeFeed.js';

// This function parses source text with Feedsmith and returns an RSSMonster canonical feed.
export const parseFeedSource = source => normalizeFeed(parseFeedsmithFeed(String(source)));

// This function downloads and parses one feed into the RSSMonster canonical feed contract.
export const process = async feedUrl => {
  try {
    // Handles the case where feed url is unavailable.
    if (!feedUrl) {
      // Derives the err required while performing process.
      const err = new Error('Missing feed URL');
      err.code = 'INVALID_FEED_URL';
      throw err;
    }

    // Fetches the url while performing process.
    const response = await fetchURL(feedUrl);
    // Handles the case where ok is unavailable.
    if (!response?.ok) {
      const status = response?.status;
      // Selects the err based on whether status is available.
      const err = new Error(`Feed fetch failed${status ? ` (HTTP ${status})` : ''}`);
      err.code = 'FEED_FETCH_ERROR';
      throw err;
    }

    // Derives the body through text while performing process.
    const body = await response.text();
    // Handles the case where body is unavailable.
    if (!body) {
      // Derives the err required while performing process.
      const err = new Error('Empty feed response');
      err.code = 'EMPTY_FEED_RESPONSE';
      throw err;
    }

    return parseFeedSource(body);
  } catch (err) {
    // Rejects processing when code is available.
    if (err?.code) throw err;

    // Handles the case where message is unrecognized feed format.
    if (err?.message === 'Unrecognized feed format') {
      // Derives the clean error required while performing process.
      const cleanError = new Error('Invalid or unsupported feed format');
      cleanError.code = 'INVALID_FEED';
      throw cleanError;
    }

    // Derives the clean error required while performing process.
    const cleanError = new Error(err?.message || 'Feed parsing failed');
    cleanError.code = 'FEED_PARSE_ERROR';
    throw cleanError;
  }
};

export default { parseFeedSource, process };
