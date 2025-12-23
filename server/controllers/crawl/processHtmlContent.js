import { load } from 'cheerio';
import * as htmlparser2 from 'htmlparser2';
import striptags from 'striptags';

import language from '../../util/language.js';
import cache from '../../util/cache.js';

/* ======================================================
   HTML parsing & sanitization
   ------------------------------------------------------
   - Removes script tags
   - Collects outbound links for hotlinking
   - Strips HTML for content analysis
   - Detects language
====================================================== */
function processHtmlContent(entryContent, entryLink, feed, entryTitle) {
  try {
    // htmlparser2 has error-correcting mechanisms,
    // which may be useful when parsing non-HTML content.
    const dom = htmlparser2.parseDocument(entryContent);
    const $ = load(dom, { _useHtmlParser2: true });

    // Remove all script tags from post content
    $('script').remove();

    // Execute hotlink feature by collecting all the links in each RSS post
    // https://github.com/passiomatic/coldsweat/issues/68#issuecomment-272963268
    $('a').each(function () {
      let domain;
      try {
        if (!entryLink) return;
        domain = new URL(entryLink).hostname;
      } catch (err) {
        domain = entryLink;
      }

      // Fetch all URLs referenced to other websites
      const href = $(this).attr('href');
      if (
        href &&
        !href.includes(domain) &&
        (href.startsWith('http://') || href.startsWith('https://'))
      ) {
        // Update cache
        cache.set(href, feed.userId);
      }
    });

    const html = $.html();
    let detectedLanguage = 'unknown';

    try {
      detectedLanguage = language.get(html);
    } catch (err) {
      console.error(
        `[${feed.feedName}] Error detecting language for article "${entryTitle}":`,
        err.message
      );
    }

    return {
      content: html,
      stripped: striptags(html, ['a', 'img', 'strong']),
      language: detectedLanguage
    };
  } catch (err) {
    console.error(
      `[${feed.feedName}] Error parsing content for article "${entryTitle}":`,
      err.message
    );
    return {
      content: entryContent,
      stripped: entryContent,
      language: 'unknown'
    };
  }
}

export default processHtmlContent;
