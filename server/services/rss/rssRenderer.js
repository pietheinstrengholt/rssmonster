import { Builder } from 'xml2js';
import sanitizeHtmlContent from '../crawl/content/sanitizeHtmlContent.js';

// Builds the shared RSS 2.0 representation used by authenticated and public exports.
export const buildRssXml = (articles, meta) => {
  const builder = new Builder({ cdata: true });
  const feedOrigin = new URL(meta.selfLink || meta.link).origin;

  const items = articles.map(article => ({
    title: article.title || 'No title',
    ...(article.url ? { link: article.url } : {}),
    guid: {
      _: `${feedOrigin}/rss/items/${article.id}`,
      $: { isPermaLink: 'false' }
    },
    pubDate: new Date(article.publishedAt || article.createdAt || Date.now()).toUTCString(),
    description: article.contentHtml
      ? sanitizeHtmlContent(article.contentHtml)
      : article.content || '',
    ...(article.feed?.feedName ? { category: [article.feed.feedName] } : {})
  }));

  const rssObject = {
    rss: {
      $: {
        version: '2.0',
        'xmlns:atom': 'http://www.w3.org/2005/Atom'
      },
      channel: [
        {
          title: meta.title,
          link: meta.link,
          description: meta.description,
          language: meta.language,
          lastBuildDate: new Date().toUTCString(),
          'atom:link': [{
            $: {
              href: meta.selfLink || meta.link,
              rel: 'self',
              type: 'application/rss+xml'
            }
          }],
          item: items
        }
      ]
    }
  };

  return builder.buildObject(rssObject);
};
