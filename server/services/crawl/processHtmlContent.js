import { load } from 'cheerio';
import language from '../../utils/language.js';
import hotlink from '../../controllers/hotlink.js';
import normalizeUrl from './normalizeUrl.js';
import decodeHtmlEntities from '../../utils/decodeHtmlEntities.js';
import cleanupHtmlContent from './cleanupHtmlContent.js';
import sanitizeHtmlContent from './sanitizeHtmlContent.js';
import removeKnownShortcodes from './removeKnownShortcodes.js';
import crypto from 'crypto';

const HTML_TAG_PATTERN = /<\/?[a-z][\w:-]*(?:\s[^<>]*)?>/i;
const MIN_LANGUAGE_TEXT_LENGTH = 20;

// This function creates a stable hash for processed article content.
const hashContent = value => crypto
  .createHash('sha256')
  .update(value || '', 'utf8')
  .digest('hex');

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

// This function avoids language detection for text too short to identify reliably.
function shouldDetectPlainTextLanguage(text) {
  return text.length >= MIN_LANGUAGE_TEXT_LENGTH && /\p{L}/u.test(text);
}

/* ======================================================
   HTML parsing, cleanup & sanitization
   ------------------------------------------------------
   - Cleans feed DOM with Cheerio
   - Sanitizes cleaned HTML with sanitize-html
   - Collects outbound links for hotlinking
   - Strips HTML for content analysis
   - Detects language
   - Computes content hash for duplication checks
====================================================== */
function processHtmlContent(content, _description, entryLink, feed, entryTitle, hotlinkBatcher = null) {
  let contentOriginal;
  let contentStripped;
  let contentText;

  try {
    // Use only feed body content here; feed summaries belong in description.
    contentOriginal = content;
    // Start contentStripped from the original source before applying HTML cleanup.
    contentStripped = removeKnownShortcodes(contentOriginal);
    if (!contentOriginal) return null;

    if (isPlainText(contentStripped)) {
      const text = normalizePlainText(contentStripped);
      contentText = text;
      const contentStrippedHash = hashContent(text);

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
        content: contentOriginal,
        stripped: contentStripped,
        text: contentText,
        language: detectedLanguage,
        contentHash: contentStrippedHash,
        contentStrippedHash,
        title: entryTitle
      };
    }

    // Parse pre-cleaned HTML content into a mutable DOM.
    const $ = load(contentStripped);

    cleanupHtmlContent($);

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
        // Normalize identity noise while preserving meaningful query parameters.
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

    // Serialize cleaned HTML before security sanitization.
    const cleanedHtml = $.html();
    contentStripped = sanitizeHtmlContent(cleanedHtml);

    // Strip final sanitized HTML for language detection & content analysis.
    const text = load(contentStripped)('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    contentText = text;

    // If title is "Untitled", try to extract first sentence from content
    if (entryTitle === 'Untitled' && text) {
      const sentenceMatch = text.match(/^[^.!?:]*[.!?:]/);
      if (sentenceMatch) {
        entryTitle = sentenceMatch[0].trim();
      }
    }

    const contentStrippedHash = hashContent(text);

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
      content: contentOriginal,
      stripped: contentStripped,
      text: contentText,
      language: detectedLanguage,
      contentHash: contentStrippedHash,
      contentStrippedHash,
      title: entryTitle
    };
  } catch (err) {
    const stripped = stripHtml(contentOriginal);
    contentText = stripped;

    console.error(
      `[${feed.feedName}] Error parsing content for article "${entryTitle}":`,
      err.message
    );
    return {
      content: contentOriginal,
      stripped,
      text: contentText,
      language: 'unknown',
      contentHash: null,
      contentStrippedHash: hashContent(stripped),
      title: entryTitle
    };
  }
}

export default processHtmlContent;
