import { load } from 'cheerio';
import language from '../../util/language.js';
import hotlink from '../../controllers/hotlink.js';
import normalizeUrl from '../../util/normalizeUrl.js';
import crypto from 'crypto';

/* ======================================================
   HTML parsing & sanitization
   ------------------------------------------------------
   - Removes script/style/noscript tags
   - Collects outbound links for hotlinking
   - Strips HTML for content analysis
   - Detects language
   - Computes content hash for duplication checks
====================================================== */
function processHtmlContent(content, description, entryLink, feed, entryTitle) {
  let contentOriginal;

  try {
    // Use content if available, otherwise fall back to description
    contentOriginal = content || description;
    if (!contentOriginal) return null;

    // Parse HTML content into a mutable DOM
    const $ = load(contentOriginal);

    // Remove all script-related tags from post content
    $('script, style, noscript').remove();

    // Execute hotlink feature by collecting all the links in each RSS post
    // https://github.com/passiomatic/coldsweat/issues/68#issuecomment-272963268
    let domain;
    try {
      if (!entryLink) return;
      domain = new URL(entryLink).hostname;
    } catch {
      domain = entryLink;
    }

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

        // Update cache
        // (fire-and-forget; hotlinks are best-effort signals)
        hotlink.set(cleanUrl, feed.id, feed.userId).catch(console.error);
      }
    });

    // Serialize cleaned HTML
    const html = $.html();

    // Strip HTML for language detection & content analysis; this is ideal for NLP tasks
    // (text extraction without an extra parsing pass)
    const text = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

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
      contentHash: contentHash
    };
  } catch (err) {
    console.error(
      `[${feed.feedName}] Error parsing content for article "${entryTitle}":`,
      err.message
    );
    return {
      content: contentOriginal,
      stripped: contentOriginal,
      language: 'unknown',
      contentHash: null
    };
  }
}

export default processHtmlContent;