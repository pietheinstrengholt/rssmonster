import { load } from 'cheerio';

import {
  finalizeHtmlContent,
  prepareHtmlContent
} from './cleanupHtmlContent.js';
import htmlToVisibleText from './htmlToVisibleText.js';
import normalizeHtmlUrls from './normalizeHtmlUrls.js';
import normalizePlainTextContent from './normalizePlainTextContent.js';
import sanitizeHtmlContent from './sanitizeHtmlContent.js';
import {
  transformWordPressContent,
  transformWordPressSourceContent
} from './compatibility/transformWordPressContent.js';

// Defines the legacy HTML detection pattern used only when source metadata is absent.
const HTML_TAG_PATTERN = /<\/?[a-z][\w:-]*(?:\s[^<>]*)?>/i;

// This function returns a safely escaped fallback when description processing fails.
const safeTextFallback = value => normalizePlainTextContent(htmlToVisibleText(value));

// This function derives sanitized display HTML and visible text from a raw feed description.
export default function processDescriptionContent(description, descriptionKind, entryLink) {
  if (typeof description !== 'string' || !description.trim()) {
    return { html: null, text: null };
  }

  if (descriptionKind === 'text' || (
    descriptionKind === null || descriptionKind === undefined
  ) && !HTML_TAG_PATTERN.test(description)) {
    const normalized = normalizePlainTextContent(description, {
      decodeEntities: descriptionKind !== 'text'
    });
    return { html: normalized.html || null, text: normalized.text || null };
  }

  try {
    const derivedHtml = transformWordPressSourceContent(description);
    if (!derivedHtml) return { html: null, text: null };

    const $ = load(derivedHtml);
    transformWordPressContent($);
    prepareHtmlContent($);
    normalizeHtmlUrls($, entryLink);
    finalizeHtmlContent($);

    const html = sanitizeHtmlContent($('body').html() || '');
    return { html: html || null, text: htmlToVisibleText(html) || null };
  } catch {
    const fallback = safeTextFallback(description);
    return { html: fallback.html || null, text: fallback.text || null };
  }
}
