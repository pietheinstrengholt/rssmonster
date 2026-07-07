import { load } from 'cheerio';
import language from '../../utils/language.js';
import hotlink from '../../controllers/hotlink.js';
import normalizeUrl from '../../utils/normalizeUrl.js';
import decodeHtmlEntities from '../../utils/decodeHtmlEntities.js';
import crypto from 'crypto';

const HTML_TAG_PATTERN = /<\/?[a-z][\w:-]*(?:\s[^<>]*)?>/i;
const MIN_LANGUAGE_TEXT_LENGTH = 20;

const DROP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'meta',
  'link',
  'base',
  'svg',
  'math'
]);

const ALLOWED_TAGS = new Set([
  'html',
  'head',
  'body',
  'article',
  'section',
  'div',
  'p',
  'br',
  'hr',
  'blockquote',
  'pre',
  'code',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'small',
  'span',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
  'img',
  'picture',
  'source',
  'a'
]);

const GLOBAL_ATTRS = new Set([
  'class',
  'title',
  'alt',
  'width',
  'height',
  'aria-label'
]);

const TAG_ATTRS = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'loading']),
  source: new Set(['src', 'type']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan'])
};

const URL_ATTRS = new Set(['href', 'src']);

function isSafeUrl(value = '', attrName = '') {
  const trimmed = String(value).trim();
  if (!trimmed) return false;

  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('#')
  ) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    const safeProtocols = attrName === 'href'
      ? ['http:', 'https:', 'mailto:', 'tel:']
      : ['http:', 'https:'];
    return safeProtocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function stripHtml(value = '') {
  return load(String(value))
    .text()
    .replace(/\s+/g, ' ')
    .trim();
}

// This function identifies text that cannot contain an HTML element.
function isPlainText(value) {
  return typeof value === 'string' && !HTML_TAG_PATTERN.test(value);
}

// This function normalizes plain text for safe storage and duplicate detection.
function normalizePlainText(value) {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, ' ')
    .trim();
}

// This function escapes plain text for clients that render article content as HTML.
function escapePlainText(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// This function avoids language detection for text too short to identify reliably.
function shouldDetectPlainTextLanguage(text) {
  return text.length >= MIN_LANGUAGE_TEXT_LENGTH && /\p{L}/u.test(text);
}

function sanitizeHtml($) {
  $(Array.from(DROP_TAGS).join(',')).remove();

  $('*').each((_, el) => {
    const tagName = String(el.tagName || el.name || '').toLowerCase();
    const node = $(el);

    if (!ALLOWED_TAGS.has(tagName)) {
      node.replaceWith(node.contents());
      return;
    }

    for (const [name, value] of Object.entries(el.attribs || {})) {
      const attrName = name.toLowerCase();
      const allowedForTag = TAG_ATTRS[tagName]?.has(attrName);
      const allowedGlobally = GLOBAL_ATTRS.has(attrName);

      if (
        attrName.startsWith('on') ||
        (!allowedForTag && !allowedGlobally) ||
        (URL_ATTRS.has(attrName) && !isSafeUrl(value, attrName))
      ) {
        node.removeAttr(name);
      }
    }

    if (tagName === 'a' && node.attr('target') === '_blank') {
      node.attr('rel', 'noopener noreferrer');
    }
  });
}

/* ======================================================
   HTML parsing & sanitization
   ------------------------------------------------------
   - Removes executable/embed tags
   - Keeps only safe tags, attributes, and URL protocols
   - Collects outbound links for hotlinking
   - Strips HTML for content analysis
   - Detects language
   - Computes content hash for duplication checks
====================================================== */
function processHtmlContent(content, description, entryLink, feed, entryTitle, hotlinkBatcher = null) {
  let contentOriginal;

  try {
    // Use content if available, otherwise fall back to description
    contentOriginal = content || description;
    if (!contentOriginal) return null;

    if (isPlainText(contentOriginal)) {
      const text = normalizePlainText(contentOriginal);
      const contentHash = crypto
        .createHash('sha256')
        .update(text || '', 'utf8')
        .digest('hex');

      if (entryTitle === 'Untitled' && text) {
        const sentenceMatch = text.match(/^[^.!?:]*[.!?:]/);
        if (sentenceMatch) {
          entryTitle = sentenceMatch[0].trim();
        }
      }

      let detectedLanguage = 'unknown';
      if (shouldDetectPlainTextLanguage(text)) {
        try {
          detectedLanguage = language.get(text);
        } catch (err) {
          console.error(
            `[${feed.feedName}] Error detecting language for article "${entryTitle}":`,
            err.message
          );
        }
      }

      return {
        content: escapePlainText(text),
        stripped: text,
        language: detectedLanguage,
        contentHash,
        title: entryTitle
      };
    }

    // Parse HTML content into a mutable DOM
    const $ = load(contentOriginal);

    sanitizeHtml($);

    // Execute hotlink feature by collecting all the links in each RSS post
    // https://github.com/passiomatic/coldsweat/issues/68#issuecomment-272963268
    let domain;
    try {
      if (!entryLink) return;
      domain = new URL(entryLink).hostname;
    } catch {
      domain = entryLink;
    }

    const hotlinkUrls = [];

    // Fetch all URLs referenced to other websites
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');

      if (
        href &&
        !href.includes(domain) &&
        (href.startsWith('http://') || href.startsWith('https://'))
      ) {
        // Remove query string parameters (everything after ?)
        const cleanUrl = normalizeUrl(href);

        hotlinkUrls.push(cleanUrl);
      }
    });

    // Queue hotlinks for the feed batch when available; retain per-article writes
    // for callers that do not provide a batcher.
    if (hotlinkBatcher) {
      hotlinkBatcher.add(hotlinkUrls);
    } else {
      hotlink.setMany(hotlinkUrls, feed.id, feed.userId).catch(console.error);
    }

    // Serialize cleaned HTML
    const html = $.html();

    // Strip HTML for language detection & content analysis; this is ideal for NLP tasks
    // (text extraction without an extra parsing pass)
    const text = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    // If title is "Untitled", try to extract first sentence from content
    if (entryTitle === 'Untitled' && text) {
      const sentenceMatch = text.match(/^[^.!?:]*[.!?:]/);
      if (sentenceMatch) {
        entryTitle = sentenceMatch[0].trim();
      }
    }

    const contentHash = crypto
      .createHash('sha256')
      .update(text || '', 'utf8')
      .digest('hex');

    let detectedLanguage = 'unknown';

    try {
      detectedLanguage = language.get(text);
    } catch (err) {
      console.error(
        `[${feed.feedName}] Error detecting language for article "${entryTitle}":`,
        err.message
      );
    }

    return {
      content: html,
      stripped: text,
      language: detectedLanguage,
      contentHash: contentHash,
      title: entryTitle
    };
  } catch (err) {
    console.error(
      `[${feed.feedName}] Error parsing content for article "${entryTitle}":`,
      err.message
    );
    return {
      content: stripHtml(contentOriginal),
      stripped: stripHtml(contentOriginal),
      language: 'unknown',
      contentHash: null,
      title: entryTitle
    };
  }
}

export default processHtmlContent;
