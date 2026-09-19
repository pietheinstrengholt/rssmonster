import { describe, expect, it } from 'vitest';

import { normalizeHtmlXpathConfig } from '../../services/feeds/htmlXpath/config.js';
import { parseHtmlXpath } from '../../services/feeds/htmlXpath/parseHtmlXpath.js';
import { parseHtmlXpathIsolated } from '../../services/feeds/htmlXpath/isolatedHtmlXpathParser.js';
import detectArticleImage from '../../services/crawl/media/detectArticleImage.js';
import buildArticlePersistenceValues from '../../services/crawl/persistence/buildArticlePersistenceValues.js';

const CONFIG = {
  feedTitle: '//title',
  item: '//article',
  itemTitle: './/h2',
  itemContent: './/div[@class="summary"]/node()',
  itemUri: './/a[1]/@href',
  itemAuthor: './/*[@rel="author"]',
  itemTimestamp: './/time/@datetime',
  itemThumbnail: './/img/@src',
  itemUid: './@data-id'
};

const HTML = `<!doctype html>
  <html><head><title> Example   News </title><meta name="description" content="Publisher updates"><base href="/articles/"></head><body>
    <article data-id="item-1">
      <h2> First   story </h2><a href="one">Read</a>
      <div class="summary"><p>Hello <strong>world</strong>.</p><p>More</p></div>
      <span rel="author">Ada</span><time datetime="2026-09-04T10:00:00Z"></time>
      <img src="../images/one.jpg">
    </article>
    <article data-id="item-2"><h2>Second story</h2><a href="/two">Read</a></article>
  </body></html>`;

describe('HTML/XPath adapter', () => {
  it('extracts contextual fields, preserves content HTML, and resolves document bases', () => {
    const result = parseHtmlXpath(HTML, {
      url: 'https://example.com/news/list',
      config: CONFIG
    });

    expect(result).toMatchObject({ matchedItems: 2, usableItems: 2, previewTruncated: false });
    expect(result.parsedFeed).toMatchObject({
      format: 'html_xpath',
      title: 'Example News',
      description: 'Publisher updates',
      selfUrl: 'https://example.com/news/list'
    });
    expect(result.parsedFeed.entries[0]).toMatchObject({
      title: 'First story',
      url: 'https://example.com/articles/one',
      content: '<p>Hello <strong>world</strong>.</p>\n<p>More</p>',
      contentKind: 'html',
      author: 'Ada',
      publishedAt: '2026-09-04T10:00:00.000Z',
      externalId: 'item-1',
      externalIdType: 'xpath-id',
      imageCandidates: [{ url: 'https://example.com/images/one.jpg', source: 'publisher' }]
    });
  });

  it('maps XPath thumbnails to a supported image source for article persistence', async () => {
    const { parsedFeed } = parseHtmlXpath(HTML, {
      url: 'https://example.com/news/list',
      config: CONFIG
    });
    const entry = parsedFeed.entries[0];
    const leadImage = await detectArticleImage({ entry, articleUrl: entry.url });
    const values = buildArticlePersistenceValues({ id: 7, userId: 42 }, {
      ...entry,
      leadImage
    });

    expect(values).toMatchObject({
      imageUrl: 'https://example.com/images/one.jpg',
      imageSource: 'publisher'
    });
  });

  it('recovers malformed browser HTML without executing scripts or loading resources', () => {
    globalThis.__htmlXpathExecuted = false;
    const result = parseHtmlXpath(`
      <title>Broken</title><article><h2>Recovered</h2><a href="/safe">Safe
      <p>Unclosed paragraph
      <script>globalThis.__htmlXpathExecuted = true</script>
      <img src="https://invalid.example/tracker.png">
    `, {
      url: 'https://example.com/',
      config: { item: '//article', itemTitle: './/h2', itemUri: './/a/@href' }
    });

    expect(result.usableItems).toBe(1);
    expect(result.parsedFeed.entries[0].url).toBe('https://example.com/safe');
    expect(globalThis.__htmlXpathExecuted).toBe(false);
    delete globalThis.__htmlXpathExecuted;
  });

  it('rejects document-rooted item fields and unknown configuration keys', () => {
    expect(() => normalizeHtmlXpathConfig({
      item: '//article',
      itemTitle: '//h2'
    })).toThrowError(expect.objectContaining({
      code: 'HTML_XPATH_INVALID_CONFIG',
      field: 'itemTitle'
    }));
    expect(() => normalizeHtmlXpathConfig({
      item: '//article',
      itemTitle: './/h2',
      customHeader: 'secret'
    })).toThrowError(expect.objectContaining({
      code: 'HTML_XPATH_INVALID_CONFIG',
      field: 'customHeader'
    }));
  });

  it('returns precise diagnostics for invalid expressions and zero matches', () => {
    expect(() => parseHtmlXpath(HTML, {
      url: 'https://example.com/',
      config: { item: '//*[', itemTitle: './/h2' }
    })).toThrowError(expect.objectContaining({
      code: 'HTML_XPATH_INVALID_EXPRESSION',
      field: 'item'
    }));
    expect(() => parseHtmlXpath(HTML, {
      url: 'https://example.com/',
      config: { item: '//aside', itemTitle: './/h2' }
    })).toThrowError(expect.objectContaining({ code: 'HTML_XPATH_NO_ITEMS' }));
  });

  it('runs the same adapter in a disposable parser worker', async () => {
    const result = await parseHtmlXpathIsolated(HTML, {
      url: 'https://example.com/news',
      config: CONFIG
    });

    expect(result.matchedItems).toBe(2);
    expect(result.parsedFeed.entries[0].externalId).toBe('item-1');
  });
});
