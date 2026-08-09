import { load } from 'cheerio';
import language from '../../../utils/language.js';
import normalizeUrl from './normalizeUrl.js';
import {
  finalizeHtmlContent,
  prepareHtmlContent
} from './cleanupHtmlContent.js';
import normalizeHtmlUrls from './normalizeHtmlUrls.js';
import sanitizeHtmlContent from './sanitizeHtmlContent.js';
import htmlToVisibleText from './htmlToVisibleText.js';
import normalizePlainTextContent from './normalizePlainTextContent.js';
import {
  transformWordPressContent,
  transformWordPressSourceContent
} from './compatibility/transformWordPressContent.js';
import { hashOriginalContent, hashVisibleText } from '../../../utils/articleContentHashes.js';
import extractInlineMedia from '../media/extractInlineMedia.js';

// Defines the html tag pattern enforced by this service.
const HTML_TAG_PATTERN = /<\/?[a-z][\w:-]*(?:\s[^<>]*)?>/i;
// Defines the min language text length enforced by this service.
const MIN_LANGUAGE_TEXT_LENGTH = 20;

// This function identifies text that cannot contain an HTML element.
function isPlainText(value) {
  return typeof value === 'string' && !HTML_TAG_PATTERN.test(value);
}

// This function treats the conventional www host alias as the publisher's apex host.
function normalizeComparableHostname(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '');
}

// This function avoids language detection for text too short to identify reliably.
function shouldDetectLanguage(text) {
  return text.length >= MIN_LANGUAGE_TEXT_LENGTH && /\p{L}/u.test(text);
}

// This function detects language consistently for plain-text and HTML content.
function detectLanguage(text, feed, entryTitle) {
  // Returns early when should detect language is unavailable.
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
function processHtmlContent(
  content,
  _description,
  entryLink,
  feed,
  entryTitle,
  contentKind = null,
  feedMedia = null
) {
  let contentOriginal;
  let contentHtml;
  let contentText;
  // Collects the hotlink url while processing html content.
  const hotlinkUrls = [];

  try {
    // Use only feed body content here; feed summaries belong in description.
    contentOriginal = content;
    // Returns no result when content original is unavailable.
    if (!contentOriginal) return null;

    // Apply source transforms only when the value is not explicitly plain text.
    contentHtml = contentKind === 'text'
      ? contentOriginal
      : transformWordPressSourceContent(contentOriginal);
    // Returns no result when content html is unavailable.
    if (!contentHtml) return null;

    // Handles the case where content html is plain text.
    if (contentKind === 'text' || (contentKind === null && isPlainText(contentHtml))) {
      // Normalizes the normalized before processing html content.
      const normalized = normalizePlainTextContent(contentHtml, {
        decodeEntities: contentKind === null
      });
      const { text } = normalized;
      contentText = text;
      contentHtml = normalized.html;
      // Derives the content source hash through hash original content while processing html content.
      const contentSourceHash = hashOriginalContent(contentOriginal);
      // Derives the content text hash through hash visible text while processing html content.
      const contentTextHash = hashVisibleText(text);

      // Handles the case where entry title is untitled and text is available.
      if (entryTitle === 'Untitled' && text) {
        // Derives the sentence match through match while processing html content.
        const sentenceMatch = text.match(/^[^.!?:]*[.!?:]/);
        // Handles the case where sentence match is available.
        if (sentenceMatch) {
          entryTitle = sentenceMatch[0].trim();
        }
      }

      // Detects the language while processing html content.
      const detectedLanguage = detectLanguage(text, feed, entryTitle);

      return {
        content: contentOriginal,
        html: contentHtml,
        text: contentText,
        language: detectedLanguage,
        contentSourceHash,
        contentTextHash,
        hotlinkUrls: [...new Set(hotlinkUrls)],
        title: entryTitle
      };
    }

    // Parse pre-cleaned HTML content into a mutable DOM.
    const $ = load(contentHtml);

    transformWordPressContent($);
    prepareHtmlContent($);
    normalizeHtmlUrls($, entryLink);
    // Extracts normalized inline media before cleanup and sanitization can remove its elements.
    const inlineMediaResult = extractInlineMedia($, feedMedia);
    finalizeHtmlContent($);

    // Collect hotlink candidates; the caller persists them only after article acceptance.
    // https://github.com/passiomatic/coldsweat/issues/68#issuecomment-272963268
    let articleHostname = null;
    // Handles the case where entry link is available.
    if (entryLink) {
      try {
        articleHostname = normalizeComparableHostname(new URL(entryLink).hostname);
      } catch {}
    }

    // Fetch all URLs referenced to other websites
    $('a[href]').each((_, el) => {
      // Derives the href through attr while processing html content.
      const href = $(el).attr('href');

      try {
        // Derives the parsed href required while processing html content.
        const parsedHref = new URL(href);
        // Returns early when value does not contain parsed href protocol or article hostname is available and normalize comparable hostname is article hostname.
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
    const text = htmlToVisibleText(contentHtml);
    contentText = text;

    // If title is "Untitled", try to extract first sentence from content
    if (entryTitle === 'Untitled' && text) {
      // Derives the sentence match through match while processing html content.
      const sentenceMatch = text.match(/^[^.!?:]*[.!?:]/);
      // Handles the case where sentence match is available.
      if (sentenceMatch) {
        entryTitle = sentenceMatch[0].trim();
      }
    }

    // Derives the content source hash through hash original content while processing html content.
    const contentSourceHash = hashOriginalContent(contentOriginal);
    // Derives the content text hash through hash visible text while processing html content.
    const contentTextHash = hashVisibleText(text);

    // Detects the language while processing html content.
    const detectedLanguage = detectLanguage(text, feed, entryTitle);

    return {
      content: contentOriginal,
      html: contentHtml,
      text: contentText,
      language: detectedLanguage,
      contentSourceHash,
      contentTextHash,
      hotlinkUrls: [...new Set(hotlinkUrls)],
      media: inlineMediaResult.media,
      title: entryTitle
    };
  } catch (err) {
    // Derives the text through strip html while processing html content.
    const text = htmlToVisibleText(contentOriginal);
    // Derives the html through render plain text html while processing html content.
    const html = normalizePlainTextContent(text).html;
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
      hotlinkUrls: [...new Set(hotlinkUrls)],
      title: entryTitle
    };
  }
}

export default processHtmlContent;
