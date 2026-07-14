import { load } from 'cheerio';
import language from '../../utils/language.js';
import normalizeUrl from './normalizeUrl.js';
import decodeHtmlEntities from '../../utils/decodeHtmlEntities.js';
import {
  finalizeHtmlContent,
  prepareHtmlContent
} from './cleanupHtmlContent.js';
import normalizeHtmlUrls from './normalizeHtmlUrls.js';
import sanitizeHtmlContent from './sanitizeHtmlContent.js';
import {
  transformWordPressContent,
  transformWordPressSourceContent
} from './compatibility/transformWordPressContent.js';
import { hashOriginalContent, hashVisibleText } from '../../utils/articleContentHashes.js';

const HTML_TAG_PATTERN = /<\/?[a-z][\w:-]*(?:\s[^<>]*)?>/i;
const MIN_LANGUAGE_TEXT_LENGTH = 20;

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

// This function treats the conventional www host alias as the publisher's apex host.
function normalizeComparableHostname(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '');
}

// This function encodes normalized paragraphs as display-safe HTML.
function renderPlainTextHtml(paragraphs) {
  const values = paragraphs.length ? paragraphs : [''];

  return values.map(paragraph => {
    const $ = load('<p></p>', null, false);
    $('p').text(paragraph);
    return $.html();
  }).join('\n');
}

// This function preserves plain-text paragraphs while deriving safe HTML and visible text.
function normalizePlainText(value) {
  const paragraphs = decodeHtmlEntities(value)
    .replace(/\r\n?/g, '\n')
    .split(/\n[\t ]*\n+/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return {
    html: renderPlainTextHtml(paragraphs),
    text: paragraphs.join('\n\n')
  };
}

// This function avoids language detection for text too short to identify reliably.
function shouldDetectLanguage(text) {
  return text.length >= MIN_LANGUAGE_TEXT_LENGTH && /\p{L}/u.test(text);
}

// This function detects language consistently for plain-text and HTML content.
function detectLanguage(text, feed, entryTitle) {
  if (!shouldDetectLanguage(text)) return 'unknown';

  try {
    return language.get(text);
  } catch (err) {
    console.error(
      `[${feed.feedName}] Error detecting language for article "${entryTitle}":`,
      err.message
    );
    return 'unknown';
  }
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
function processHtmlContent(content, _description, entryLink, feed, entryTitle) {
  let contentOriginal;
  let contentHtml;
  let contentText;
  const hotlinkUrls = [];

  try {
    // Use only feed body content here; feed summaries belong in description.
    contentOriginal = content;
    if (!contentOriginal) return null;

    // Apply publisher compatibility transforms only to derived content.
    contentHtml = transformWordPressSourceContent(contentOriginal);
    if (!contentHtml) return null;

    if (isPlainText(contentHtml)) {
      const normalized = normalizePlainText(contentHtml);
      const { text } = normalized;
      contentText = text;
      contentHtml = normalized.html;
      const contentSourceHash = hashOriginalContent(contentOriginal);
      const contentTextHash = hashVisibleText(text);

      if (entryTitle === 'Untitled' && text) {
        const sentenceMatch = text.match(/^[^.!?:]*[.!?:]/);
        if (sentenceMatch) {
          entryTitle = sentenceMatch[0].trim();
        }
      }

      const detectedLanguage = detectLanguage(text, feed, entryTitle);

      return {
        content: contentOriginal,
        html: contentHtml,
        text: contentText,
        language: detectedLanguage,
        contentSourceHash,
        contentTextHash,
        hotlinkUrls,
        title: entryTitle
      };
    }

    // Parse pre-cleaned HTML content into a mutable DOM.
    const $ = load(contentHtml);

    transformWordPressContent($);
    prepareHtmlContent($);
    normalizeHtmlUrls($, entryLink);
    finalizeHtmlContent($);

    // Collect hotlink candidates; the caller persists them only after article acceptance.
    // https://github.com/passiomatic/coldsweat/issues/68#issuecomment-272963268
    let articleHostname = null;
    if (entryLink) {
      try {
        articleHostname = normalizeComparableHostname(new URL(entryLink).hostname);
      } catch {}
    }

    // Fetch all URLs referenced to other websites
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');

      try {
        const parsedHref = new URL(href);
        if (
          !['http:', 'https:'].includes(parsedHref.protocol) ||
          (
            articleHostname &&
            normalizeComparableHostname(parsedHref.hostname) === articleHostname
          )
        ) {
          return;
        }

        // Normalize identity noise while preserving meaningful query parameters.
        const cleanUrl = normalizeUrl(parsedHref.href);

        hotlinkUrls.push(cleanUrl);
      } catch {}
    });

    // Serialize only the cleaned article fragment before security sanitization.
    const cleanedHtml = $('body').html() || '';
    contentHtml = sanitizeHtmlContent(cleanedHtml);

    // Strip final sanitized HTML for language detection & content analysis.
    const text = load(contentHtml)('body')
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

    const contentSourceHash = hashOriginalContent(contentOriginal);
    const contentTextHash = hashVisibleText(text);

    const detectedLanguage = detectLanguage(text, feed, entryTitle);

    return {
      content: contentOriginal,
      html: contentHtml,
      text: contentText,
      language: detectedLanguage,
      contentSourceHash,
      contentTextHash,
      hotlinkUrls,
      title: entryTitle
    };
  } catch (err) {
    const text = stripHtml(contentOriginal);
    const html = renderPlainTextHtml([text]);
    contentText = text;

    console.error(
      `[${feed.feedName}] Error parsing content for article "${entryTitle}":`,
      err.message
    );
    return {
      content: contentOriginal,
      html,
      text: contentText,
      language: 'unknown',
      contentSourceHash: hashOriginalContent(contentOriginal),
      contentTextHash: hashVisibleText(text),
      hotlinkUrls,
      title: entryTitle
    };
  }
}

export default processHtmlContent;
