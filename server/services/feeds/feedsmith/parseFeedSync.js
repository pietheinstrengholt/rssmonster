// Contains synchronous parsing used only inside isolated workers and compatibility calls.

import { parseFeed as parseFeedsmithFeed } from 'feedsmith';
import normalizeFeed from './normalizeFeed.js';
import { assertNormalizedFeedLimits } from './feedInputLimits.js';
import {
  containsUnsafeXmlDeclaration,
  detectFeedSourceKind,
  prepareFeedSource
} from './xmlCleanup.js';

// Rejects DTDs and entity declarations before an XML parser sees the document.
export const assertSafeFeedSource = source => {
  const text = String(source);
  if (
    detectFeedSourceKind(text) === 'xml' &&
    containsUnsafeXmlDeclaration(text)
  ) {
    const error = new Error('DTD and entity declarations are not allowed in feeds');
    error.name = 'UnsafeFeedXmlError';
    error.code = 'UNSAFE_FEED_XML';
    throw error;
  }
  return text;
};

// Parses and validates one feed synchronously inside the current execution context.
export const parseFeedSourceSync = source => assertNormalizedFeedLimits(
  normalizeFeed(parseFeedsmithFeed(
    assertSafeFeedSource(prepareFeedSource(source))
  ))
);

export default { assertSafeFeedSource, parseFeedSourceSync };
