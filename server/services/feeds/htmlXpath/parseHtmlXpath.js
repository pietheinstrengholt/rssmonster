import { JSDOM } from 'jsdom';
import { assertNormalizedFeedLimits, getFeedInputLimits } from '../feedsmith/feedInputLimits.js';
import { resolveSafeHttpUrl } from '../feedsmith/resolveArticleLink.js';
import {
  HTML_XPATH_LIMITS,
  htmlXpathError,
  normalizeHtmlXpathConfig
} from './config.js';

// Collapses whitespace like XPath normalize-space() while preserving absent values.
const normalizedText = value => String(value || '').replace(/\s+/g, ' ').trim() || null;

// Evaluates one scalar expression using FreshRSS-compatible first-node string semantics.
const evaluateText = (document, XPathResult, expression, contextNode, field) => {
  if (!expression) return null;
  try {
    return normalizedText(document.evaluate(
      `normalize-space(${expression})`,
      contextNode,
      null,
      XPathResult.STRING_TYPE
    ).stringValue);
  } catch {
    throw htmlXpathError(
      'HTML_XPATH_INVALID_EXPRESSION',
      `Invalid XPath expression for ${field}`,
      field
    );
  }
};

// Serializes a selected content node without flattening selected element markup.
const serializeContentNode = node => {
  if (node.nodeType === node.ELEMENT_NODE) return node.outerHTML;
  if (node.nodeType === node.ATTRIBUTE_NODE) return node.value;
  if (node.nodeType === node.TEXT_NODE || node.nodeType === node.CDATA_SECTION_NODE) {
    return node.textContent;
  }
  return '';
};

// Evaluates content as all selected nodes, or as a scalar for non-node XPath results.
const evaluateContent = (document, XPathResult, expression, contextNode) => {
  if (!expression) return { content: null, contentKind: null };
  let result;
  try {
    result = document.evaluate(expression, contextNode, null, XPathResult.ANY_TYPE);
  } catch {
    throw htmlXpathError(
      'HTML_XPATH_INVALID_EXPRESSION',
      'Invalid XPath expression for itemContent',
      'itemContent'
    );
  }

  if (result.resultType === XPathResult.STRING_TYPE) {
    return { content: normalizedText(result.stringValue), contentKind: 'text' };
  }
  if (result.resultType === XPathResult.NUMBER_TYPE) {
    return { content: String(result.numberValue), contentKind: 'text' };
  }
  if (result.resultType === XPathResult.BOOLEAN_TYPE) {
    return { content: String(result.booleanValue), contentKind: 'text' };
  }

  const values = [];
  let hasMarkup = false;
  try {
    let node = result.iterateNext();
    while (node) {
      hasMarkup ||= node.nodeType === node.ELEMENT_NODE;
      const serialized = serializeContentNode(node);
      if (serialized) values.push(serialized);
      node = result.iterateNext();
    }
  } catch {
    throw htmlXpathError(
      'HTML_XPATH_INVALID_EXPRESSION',
      'itemContent must return serializable content',
      'itemContent'
    );
  }

  const content = values.join('\n').trim() || null;
  return { content, contentKind: content ? (hasMarkup ? 'html' : 'text') : null };
};

// Parses only documented date shapes without manufacturing a crawl-time timestamp.
const parsePublishedAt = value => {
  const text = normalizedText(value);
  if (!text) return null;
  const supported = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.test(text)
    || /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+/i.test(text);
  if (!supported) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

// Resolves the page base without allowing non-HTTP schemes to escape downstream URL policy.
const resolveDocumentBase = (document, effectiveUrl) => {
  const declaredBase = document.querySelector('base[href]')?.getAttribute('href');
  return resolveSafeHttpUrl(declaredBase, effectiveUrl) || effectiveUrl;
};

// Creates the canonical image candidate consumed by the existing article media path.
const imageCandidate = url => url ? [{
  url,
  width: null,
  height: null,
  mimeType: null,
  // XPath thumbnails use the same persisted source as other publisher image fields.
  source: 'publisher',
  position: null,
  alt: null,
  className: null
}] : [];

// Converts one bounded HTML document into RSSMonster's canonical parsed-feed contract.
export const parseHtmlXpath = (source, {
  url,
  config: inputConfig
} = {}) => {
  const config = normalizeHtmlXpathConfig(inputConfig);
  const effectiveUrl = resolveSafeHttpUrl(url);
  if (!effectiveUrl) {
    throw htmlXpathError('HTML_XPATH_INVALID_CONFIG', 'A valid HTTP(S) page URL is required', 'url');
  }
  if (!String(source || '').trim()) {
    throw htmlXpathError('HTML_XPATH_EMPTY_BODY', 'The website returned an empty body');
  }

  let dom;
  try {
    dom = new JSDOM(String(source), {
      url: effectiveUrl,
      contentType: 'text/html'
    });
  } catch {
    throw htmlXpathError('HTML_XPATH_INVALID_HTML', 'The website HTML could not be parsed');
  }

  try {
    const { document, XPathResult } = dom.window;
    let itemResult;
    try {
      itemResult = document.evaluate(
        config.item,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
      );
    } catch {
      throw htmlXpathError(
        'HTML_XPATH_INVALID_EXPRESSION',
        'Invalid XPath expression for item',
        'item'
      );
    }

    const matchedItems = itemResult.snapshotLength;
    if (matchedItems === 0) {
      throw htmlXpathError('HTML_XPATH_NO_ITEMS', 'The item XPath did not match any elements', 'item');
    }
    const limits = getFeedInputLimits();
    if (matchedItems > limits.entries) {
      throw htmlXpathError(
        'HTML_XPATH_TOO_MANY_ITEMS',
        `Item XPath matched more than ${limits.entries} elements`,
        'item'
      );
    }

    const documentBaseUrl = resolveDocumentBase(document, effectiveUrl);
    const entries = [];
    const warnings = [];
    let aggregateOutputBytes = 0;
    for (let index = 0; index < matchedItems; index += 1) {
      const item = itemResult.snapshotItem(index);
      const title = evaluateText(document, XPathResult, config.itemTitle, item, 'itemTitle');
      const rawUrl = evaluateText(document, XPathResult, config.itemUri, item, 'itemUri');
      const url = resolveSafeHttpUrl(rawUrl, documentBaseUrl);
      const author = evaluateText(document, XPathResult, config.itemAuthor, item, 'itemAuthor');
      const timestamp = evaluateText(
        document,
        XPathResult,
        config.itemTimestamp,
        item,
        'itemTimestamp'
      );
      const thumbnail = resolveSafeHttpUrl(
        evaluateText(document, XPathResult, config.itemThumbnail, item, 'itemThumbnail'),
        documentBaseUrl
      );
      const externalId = evaluateText(document, XPathResult, config.itemUid, item, 'itemUid');
      const { content, contentKind } = evaluateContent(
        document,
        XPathResult,
        config.itemContent,
        item
      );
      aggregateOutputBytes += [
        title, rawUrl, author, timestamp, thumbnail, externalId, content
      ].reduce((total, value) => total + Buffer.byteLength(String(value || ''), 'utf8'), 0);
      if (aggregateOutputBytes > HTML_XPATH_LIMITS.aggregateOutputBytes) {
        throw htmlXpathError(
          'FEED_INPUT_LIMIT_EXCEEDED',
          `Extracted HTML/XPath output exceeds ${HTML_XPATH_LIMITS.aggregateOutputBytes} bytes`,
          'content'
        );
      }

      if (!title && !content && !url) {
        warnings.push({ code: 'ITEM_SKIPPED', itemIndex: index });
        continue;
      }
      if (rawUrl && !url) warnings.push({ code: 'ITEM_URL_INVALID', itemIndex: index });

      entries.push({
        title,
        url,
        urlStatus: url ? 'resolved' : (rawUrl ? 'invalid' : 'missing'),
        contentBaseUrl: url || documentBaseUrl,
        description: null,
        descriptionKind: null,
        content,
        contentKind,
        author,
        categories: [],
        publishedAt: parsePublishedAt(timestamp),
        modifiedAt: null,
        externalId,
        externalIdType: externalId ? 'xpath-id' : null,
        media: null,
        imageCandidates: imageCandidate(thumbnail)
      });
    }

    if (entries.length === 0) {
      throw htmlXpathError(
        'HTML_XPATH_ITEM_EXTRACTION',
        'Matched elements did not produce any usable items'
      );
    }

    const parsedFeed = assertNormalizedFeedLimits({
      format: 'html_xpath',
      title: evaluateText(document, XPathResult, config.feedTitle, document, 'feedTitle'),
      description: normalizedText(
        document.querySelector('meta[name="description"]')?.getAttribute('content') ||
        document.querySelector('meta[property="og:description"]')?.getAttribute('content')
      ),
      faviconUrl: null,
      publishedAt: null,
      selfUrl: effectiveUrl,
      entries
    }, limits);

    return {
      parsedFeed,
      matchedItems,
      usableItems: entries.length,
      warnings,
      previewTruncated: entries.length > HTML_XPATH_LIMITS.previewItems
    };
  } finally {
    dom.window.close();
  }
};

export default parseHtmlXpath;
