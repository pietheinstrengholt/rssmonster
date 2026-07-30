// Defines the card class enforced by this service.
const CARD_CLASS = 'rss-content-card';
// Defines the hidden content selector enforced by this service.
const HIDDEN_CONTENT_SELECTOR = [
  'script',
  'iframe',
  '[hidden]',
  '[aria-hidden="true"]',
  '[style*="display:none"]',
  '[style*="display: none"]'
].join(',');

// This function normalizes visible publisher-card text without inventing content.
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
  // Maps source values into the result produced while performing first safe anchor.
  return node
    .find('a[href]')
    .toArray()
    .map(el => $(el))
    .find(anchor => {
      // Derives the href through attr while performing first safe anchor.
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
  // Selects the images based on whether preferred selector is available.
  const images = [
    ...(preferredSelector ? node.find(preferredSelector).toArray() : []),
    ...node.find('img').toArray()
  ];
  // Tracks distinct seen while performing first safe image.
  const seen = new Set();

  // Processes each images entry in turn.
  for (const el of images) {
    // Skips the current entry when seen contains el.
    if (seen.has(el)) continue;
    seen.add(el);

    // Derives the image through $ while performing first safe image.
    const image = $(el);
    // Returns early when attr is http url.
    if (isHttpUrl(image.attr('src'))) return image.attr('src').trim();
  }

  return '';
}

// This function returns readable text after excluding widget-only descendants.
function readableText(node, removeSelector = '') {
  // Derives the clone through clone while performing readable text.
  const clone = node.clone();
  clone.find(HIDDEN_CONTENT_SELECTOR).remove();
  // Handles the case where remove selector is available.
  if (removeSelector) clone.find(removeSelector).remove();
  return normalizedText(clone.text());
}

// This function builds the static RSSMonster-owned card structure.
function createCanonicalCard($, type, fields) {
  // Normalizes the title before creating canonical card.
  const title = normalizedText(fields.title);
  // Normalizes the description before creating canonical card.
  const description = normalizedText(fields.description);
  // Normalizes the metadata before creating canonical card.
  const metadata = normalizedText(fields.metadata);
  // Selects the image based on whether fields image is http url.
  const image = isHttpUrl(fields.image) ? fields.image.trim() : '';

  // Returns no result when fields href is not http url or title is unavailable and description is unavailable and metadata is unavailable and image is unavailable.
  if (!isHttpUrl(fields.href) || (!title && !description && !metadata && !image)) {
    return null;
  }

  // Derives the figure through attr while creating canonical card.
  const figure = $('<figure></figure>')
    .attr('class', `${CARD_CLASS} ${CARD_CLASS}--${type}`);
  // Derives the link through attr while creating canonical card.
  const link = $('<a></a>')
    .attr('class', `${CARD_CLASS}__link`)
    .attr('href', fields.href.trim());

  // Handles the case where title is available or description is available or metadata is available.
  if (title || description || metadata) {
    // Derives the body through attr while creating canonical card.
    const body = $('<div></div>').attr('class', `${CARD_CLASS}__body`);

    // Handles the case where title is available.
    if (title) {
      body.append($('<strong></strong>').attr('class', `${CARD_CLASS}__title`).text(title));
    }
    // Handles the case where description is available.
    if (description) {
      body.append($('<p></p>').attr('class', `${CARD_CLASS}__description`).text(description));
    }
    // Handles the case where metadata is available.
    if (metadata) {
      body.append($('<span></span>').attr('class', `${CARD_CLASS}__meta`).text(metadata));
    }

    link.append(body);
  }

  // Handles the case where image is available.
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
  // Derives the container through first while normalizing ghost bookmark.
  const container = node.find('.kg-bookmark-container').first();
  // Selects the container href based on whether is succeeds.
  const containerHref = container.is('a[href]') ? container.attr('href') : '';
  // Selects the anchor based on whether container href is http url.
  const anchor = isHttpUrl(containerHref) ? container : firstSafeAnchor($, node);
  // Returns no result when anchor is unavailable.
  if (!anchor) return null;

  // Normalizes the title before normalizing ghost bookmark.
  const title = normalizedText(node.find('.kg-bookmark-title').first().text());
  // Normalizes the description before normalizing ghost bookmark.
  const description = normalizedText(node.find('.kg-bookmark-description').first().text());
  // Normalizes the publisher before normalizing ghost bookmark.
  const publisher = normalizedText(node.find('.kg-bookmark-publisher').first().text());
  // Normalizes the author before normalizing ghost bookmark.
  const author = normalizedText(node.find('.kg-bookmark-author').first().text());
  // Derives the metadata required while normalizing ghost bookmark.
  const metadata = publisher || author;

  // Selects the result based on whether description is title.
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
  // Derives the excluded through join while normalizing word press embed.
  const excluded = [
    '.wp-embed-footer',
    '.wp-embed-site-title',
    '.wp-embed-more',
    '.wp-embed-comments-rating'
  ].join(',');
  // Derives the anchor through first safe anchor while normalizing word press embed.
  const anchor = firstSafeAnchor($, node, () => true, excluded);
  // Returns no result when anchor is unavailable.
  if (!anchor) return null;

  // Normalizes the anchor title before normalizing word press embed.
  const anchorTitle = normalizedText(anchor.text());
  // Derives the title required while normalizing word press embed.
  const title = anchorTitle || readableText(
    node,
    '.wp-embed-footer, .wp-embed-site-title, .wp-embed-more, .wp-embed-comments-rating'
  );
  // Normalizes the metadata before normalizing word press embed.
  const metadata = normalizedText(node.find('.wp-embed-site-title').first().text());

  // Selects the result based on whether metadata is title.
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
    // Derives the url required while checking twitter status url.
    const url = new URL(value);
    // Derives the hostname through replace while checking twitter status url.
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
  // Derives the anchor through first safe anchor while normalizing twitter embed.
  const anchor = firstSafeAnchor($, node, isTwitterStatusUrl);
  // Returns no result when anchor is unavailable.
  if (!anchor) return null;

  // Derives the paragraph through first while normalizing twitter embed.
  const paragraph = node.find('p').first();
  // Selects the description based on whether paragraph count exceeds value.
  const description = paragraph.length > 0
    ? readableText(paragraph)
    : readableText(node, 'a[href], cite, .twitter-tweet-author');
  // Normalizes the explicit author before normalizing twitter embed.
  const explicitAuthor = normalizedText(
    node.find('cite, .twitter-tweet-author').first().text()
  );
  // Selects the remainder based on whether paragraph count exceeds value.
  const remainder = paragraph.length > 0
    ? readableText(node, 'p, a[href], cite, .twitter-tweet-author')
      .replace(/^[\s—–-]+/, '')
    : '';
  // Derives the title required while normalizing twitter embed.
  const title = explicitAuthor || normalizedText(remainder);

  // Selects the result based on whether title is description.
  return createCanonicalCard($, 'twitter', {
    href: anchor.attr('href'),
    title: title === description ? '' : title,
    description
  });
}

// This function checks for canonical Instagram post and reel links.
function isInstagramPostUrl(value) {
  try {
    // Derives the url required while checking instagram post url.
    const url = new URL(value);
    // Derives the hostname through replace while checking instagram post url.
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
  // Derives the anchor through first safe anchor while normalizing instagram embed.
  const anchor = firstSafeAnchor($, node, isInstagramPostUrl);
  // Returns no result when anchor is unavailable.
  if (!anchor) return null;

  // Normalizes the explicit author before normalizing instagram embed.
  const explicitAuthor = normalizedText(
    node.find('cite, .instagram-media-author').first().text()
  );
  // Derives the shared by match through match while normalizing instagram embed.
  const sharedByMatch = normalizedText(anchor.text())
    .match(/^a post shared by\s+(.+?)(?:\s+on\s|$)/i);
  // Derives the title required while normalizing instagram embed.
  const title = explicitAuthor || normalizedText(sharedByMatch?.[1]);
  // Keeps the captions entries eligible while normalizing instagram embed.
  const captions = node
    .find('p')
    .toArray()
    .map(el => withoutInstagramBoilerplate($(el).text()))
    .filter(text => text && text !== title);
  // Derives the description required while normalizing instagram embed.
  const description = normalizedText(Array.from(new Set(captions)).join(' ')) ||
    withoutInstagramBoilerplate(
      readableText(node, 'a[href], cite, .instagram-media-author')
    );

  // Selects the result based on whether description is title.
  return createCanonicalCard($, 'instagram', {
    href: anchor.attr('href'),
    title,
    description: description === title ? '' : description,
    image: firstSafeImage($, node)
  });
}

// Defines the publisher card normalizers enforced by this service.
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
  // Processes each publisher card normalizers entry in turn.
  for (const normalizer of PUBLISHER_CARD_NORMALIZERS) {
    // Derives the candidates through to array while normalizing publisher cards.
    const candidates = $(normalizer.selectors.join(',')).toArray();

    // Processes each candidates entry in turn.
    for (const el of candidates) {
      // Skips the current entry when el parent is unavailable or contains is unavailable.
      if (!el.parent || !$.contains($.root()[0], el)) continue;

      // Derives the node through $ while normalizing publisher cards.
      const node = $(el);
      // Skips the current entry when has class succeeds or closest count exceeds value or find count exceeds value.
      if (
        node.hasClass(CARD_CLASS) ||
        node.closest(`.${CARD_CLASS}`).length > 0 ||
        node.find(`.${CARD_CLASS}`).length > 0
      ) {
        continue;
      }

      try {
        // Normalizes the canonical card before normalizing publisher cards.
        const canonicalCard = normalizer.normalize($, node);
        // Handles the case where canonical card is available.
        if (canonicalCard) node.replaceWith(canonicalCard);
      } catch {
        // Leave an individual malformed card available to the generic cleanup pipeline.
      }
    }
  }
}

export { PUBLISHER_CARD_NORMALIZERS };
export default normalizePublisherCards;
