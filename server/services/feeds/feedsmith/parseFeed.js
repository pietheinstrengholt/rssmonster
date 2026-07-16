import { parseFeed as parseFeedsmithFeed } from 'feedsmith';

import { fetchURL } from '../../../utils/fetchURL.js';
import normalizeFeed from './normalizeFeed.js';

// This function parses source text with Feedsmith and returns an RSSMonster canonical feed.
export const parseFeedSource = source => normalizeFeed(parseFeedsmithFeed(String(source)));

// This function downloads and parses one feed into the RSSMonster canonical feed contract.
export const process = async feedUrl => {
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

    return parseFeedSource(body);
  } catch (err) {
    if (err?.code) throw err;

    if (err?.message === 'Unrecognized feed format') {
      const cleanError = new Error('Invalid or unsupported feed format');
      cleanError.code = 'INVALID_FEED';
      throw cleanError;
    }

    const cleanError = new Error(err?.message || 'Feed parsing failed');
    cleanError.code = 'FEED_PARSE_ERROR';
    throw cleanError;
  }
};

export default { parseFeedSource, process };
