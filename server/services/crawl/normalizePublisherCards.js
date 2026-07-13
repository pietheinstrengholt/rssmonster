const CARD_CLASS = 'rss-content-card';
const HIDDEN_CONTENT_SELECTOR = [
  'script',
  'iframe',
  '[hidden]',
  '[aria-hidden="true"]',
  '[style*="display:none"]',
  '[style*="display: none"]'
].join(',');

// This function normalizes visible card text without inventing content.
function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// This function checks whether a URL is an absolute HTTP or HTTPS URL.
function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(String(value).trim()).protocol);
  } catch {
    return false;
  }
}

// This function returns the first safe anchor matching optional publisher rules.
function firstSafeAnchor($, node, matcher = () => true, excludedSelector = '') {
  return node
    .find('a[href]')
    .toArray()
    .map(el => $(el))
    .find(anchor => {
      const href = anchor.attr('href');
      return (
        isHttpUrl(href) &&
        matcher(href) &&
        (!excludedSelector || anchor.closest(excludedSelector).length === 0)
      );
    });
}

// This function returns the first safe image from a publisher card.
function firstSafeImage($, node, preferredSelector = '') {
  const images = [
    ...(preferredSelector ? node.find(preferredSelector).toArray() : []),
    ...node.find('img').toArray()
  ];
  const seen = new Set();

  for (const el of images) {
    if (seen.has(el)) continue;
    seen.add(el);

    const image = $(el);
    if (isHttpUrl(image.attr('src'))) return image.attr('src').trim();
  }

  return '';
}

// This function returns readable text after excluding widget-only descendants.
function readableText(node, removeSelector = '') {
  const clone = node.clone();
  clone.find(HIDDEN_CONTENT_SELECTOR).remove();
  if (removeSelector) clone.find(removeSelector).remove();
  return normalizedText(clone.text());
}

// This function builds the static RSSMonster-owned card structure.
function createCanonicalCard($, type, fields) {
  const title = normalizedText(fields.title);
  const description = normalizedText(fields.description);
  const metadata = normalizedText(fields.metadata);
  const image = isHttpUrl(fields.image) ? fields.image.trim() : '';

  if (!isHttpUrl(fields.href) || (!title && !description && !metadata && !image)) {
    return null;
  }

  const figure = $('<figure></figure>')
    .attr('class', `${CARD_CLASS} ${CARD_CLASS}--${type}`);
  const link = $('<a></a>')
    .attr('class', `${CARD_CLASS}__link`)
    .attr('href', fields.href.trim());

  if (title || description || metadata) {
    const body = $('<div></div>').attr('class', `${CARD_CLASS}__body`);

    if (title) {
      body.append($('<strong></strong>').attr('class', `${CARD_CLASS}__title`).text(title));
    }
    if (description) {
      body.append($('<p></p>').attr('class', `${CARD_CLASS}__description`).text(description));
    }
    if (metadata) {
      body.append($('<span></span>').attr('class', `${CARD_CLASS}__meta`).text(metadata));
    }

    link.append(body);
  }

  if (image) {
    link.append(
      $('<img>')
        .attr('class', `${CARD_CLASS}__image`)
        .attr('src', image)
        .attr('alt', '')
        .attr('loading', 'lazy')
    );
  }

  figure.append(link);
  return figure;
}

// This function converts a Ghost bookmark into canonical static markup.
function normalizeGhostBookmark($, node) {
  const container = node.find('.kg-bookmark-container').first();
  const containerHref = container.is('a[href]') ? container.attr('href') : '';
  const anchor = isHttpUrl(containerHref) ? container : firstSafeAnchor($, node);
  if (!anchor) return null;

  const title = normalizedText(node.find('.kg-bookmark-title').first().text());
  const description = normalizedText(node.find('.kg-bookmark-description').first().text());
  const publisher = normalizedText(node.find('.kg-bookmark-publisher').first().text());
  const author = normalizedText(node.find('.kg-bookmark-author').first().text());
  const metadata = publisher || author;

  return createCanonicalCard($, 'ghost', {
    href: anchor.attr('href'),
    title,
    description: description === title ? '' : description,
    metadata: metadata === title || metadata === description ? '' : metadata,
    image: firstSafeImage($, node, '.kg-bookmark-thumbnail img')
  });
}

// This function converts a WordPress embed into canonical static markup.
function normalizeWordPressEmbed($, node) {
  const excluded = [
    '.wp-embed-footer',
    '.wp-embed-site-title',
    '.wp-embed-more',
    '.wp-embed-comments-rating'
  ].join(',');
  const anchor = firstSafeAnchor($, node, () => true, excluded);
  if (!anchor) return null;

  const anchorTitle = normalizedText(anchor.text());
  const title = anchorTitle || readableText(
    node,
    '.wp-embed-footer, .wp-embed-site-title, .wp-embed-more, .wp-embed-comments-rating'
  );
  const metadata = normalizedText(node.find('.wp-embed-site-title').first().text());

  return createCanonicalCard($, 'wordpress', {
    href: anchor.attr('href'),
    title,
    metadata: metadata === title ? '' : metadata,
    image: firstSafeImage($, node)
  });
}

// This function checks for canonical Twitter and X status links.
function isTwitterStatusUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return (
      ['twitter.com', 'x.com'].includes(hostname) &&
      /^\/[^/]+\/status\/[^/]+\/?$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

// This function converts a Twitter or X blockquote into canonical static markup.
function normalizeTwitterEmbed($, node) {
  const anchor = firstSafeAnchor($, node, isTwitterStatusUrl);
  if (!anchor) return null;

  const paragraph = node.find('p').first();
  const description = paragraph.length > 0
    ? readableText(paragraph)
    : readableText(node, 'a[href], cite, .twitter-tweet-author');
  const explicitAuthor = normalizedText(
    node.find('cite, .twitter-tweet-author').first().text()
  );
  const remainder = paragraph.length > 0
    ? readableText(node, 'p, a[href], cite, .twitter-tweet-author')
      .replace(/^[\s—–-]+/, '')
    : '';
  const title = explicitAuthor || normalizedText(remainder);

  return createCanonicalCard($, 'twitter', {
    href: anchor.attr('href'),
    title: title === description ? '' : title,
    description
  });
}

// This function checks for canonical Instagram post and reel links.
function isInstagramPostUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return (
      hostname === 'instagram.com' &&
      /^\/(?:p|reel|reels)\/[^/]+\/?$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

// This function removes repeated Instagram fallback boilerplate from readable text.
function withoutInstagramBoilerplate(value) {
  return normalizedText(
    String(value || '').replace(/view this post on instagram/gi, ' ')
  );
}

// This function converts an Instagram blockquote into canonical static markup.
function normalizeInstagramEmbed($, node) {
  const anchor = firstSafeAnchor($, node, isInstagramPostUrl);
  if (!anchor) return null;

  const explicitAuthor = normalizedText(
    node.find('cite, .instagram-media-author').first().text()
  );
  const sharedByMatch = normalizedText(anchor.text())
    .match(/^a post shared by\s+(.+?)(?:\s+on\s|$)/i);
  const title = explicitAuthor || normalizedText(sharedByMatch?.[1]);
  const captions = node
    .find('p')
    .toArray()
    .map(el => withoutInstagramBoilerplate($(el).text()))
    .filter(text => text && text !== title);
  const description = normalizedText(Array.from(new Set(captions)).join(' ')) ||
    withoutInstagramBoilerplate(
      readableText(node, 'a[href], cite, .instagram-media-author')
    );

  return createCanonicalCard($, 'instagram', {
    href: anchor.attr('href'),
    title,
    description: description === title ? '' : description,
    image: firstSafeImage($, node)
  });
}

const PUBLISHER_CARD_NORMALIZERS = [
  {
    type: 'ghost-bookmark',
    selectors: ['figure.kg-bookmark-card', '.kg-bookmark-card'],
    normalize: normalizeGhostBookmark
  },
  {
    type: 'wordpress-embed',
    selectors: ['figure.wp-block-embed', 'blockquote.wp-embedded-content'],
    normalize: normalizeWordPressEmbed
  },
  {
    type: 'twitter-embed',
    selectors: ['blockquote.twitter-tweet'],
    normalize: normalizeTwitterEmbed
  },
  {
    type: 'instagram-embed',
    selectors: ['blockquote.instagram-media'],
    normalize: normalizeInstagramEmbed
  }
];

// This function normalizes supported publisher cards without reprocessing canonical cards.
function normalizePublisherCards($) {
  for (const normalizer of PUBLISHER_CARD_NORMALIZERS) {
    const candidates = $(normalizer.selectors.join(',')).toArray();

    for (const el of candidates) {
      if (!el.parent || !$.contains($.root()[0], el)) continue;

      const node = $(el);
      if (
        node.hasClass(CARD_CLASS) ||
        node.closest(`.${CARD_CLASS}`).length > 0 ||
        node.find(`.${CARD_CLASS}`).length > 0
      ) {
        continue;
      }

      try {
        const canonicalCard = normalizer.normalize($, node);
        if (canonicalCard) node.replaceWith(canonicalCard);
      } catch {
        // Leave an individual malformed card available to the generic cleanup pipeline.
      }
    }
  }
}

export { PUBLISHER_CARD_NORMALIZERS };
export default normalizePublisherCards;
