const REDDIT_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com'
]);

const REDDIT_MEDIA_HOSTS = new Set([
  'redd.it',
  'i.redd.it',
  'preview.redd.it',
  'v.redd.it'
]);

const BODY_SEMANTIC_ELEMENTS = [
  'img',
  'picture',
  'audio',
  'video',
  'figure',
  'blockquote',
  'pre',
  'code',
  'ul',
  'ol',
  'hr'
].join(',');

// This function normalizes visible publisher text for comparisons and labels.
function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// This function parses absolute and relative Reddit URLs without throwing.
function parsedUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(raw, 'https://relative.invalid');
    } catch {
      return null;
    }
  }
}

// This function returns a link URL without rewriting publisher input.
function getUrl(link) {
  return String(link?.attr('href') || '').trim();
}

// This function checks whether a parsed URL belongs to Reddit itself.
function isRedditUrl(value) {
  const url = parsedUrl(value);
  return Boolean(url && REDDIT_HOSTS.has(url.hostname.toLowerCase()));
}

// This function checks whether a URL points to Reddit-hosted media.
function isRedditMediaUrl(value) {
  const url = parsedUrl(value);
  return Boolean(url && REDDIT_MEDIA_HOSTS.has(url.hostname.toLowerCase()));
}

// This function checks a Reddit path on either a recognized host or a relative URL.
function matchesRedditPath(value, pattern) {
  const url = parsedUrl(value);
  return Boolean(
    url &&
    (REDDIT_HOSTS.has(url.hostname.toLowerCase()) || url.hostname === 'relative.invalid') &&
    pattern.test(url.pathname)
  );
}

// This function checks whether a link identifies a Reddit user.
function isAuthorLink(link) {
  const label = normalizedText(link.text());
  return Boolean(
    matchesRedditPath(getUrl(link), /^\/user\/[^/]+\/?$/i) ||
    label.match(/^\/?u\/[\w-]+$/i)
  );
}

// This function checks whether a link identifies a subreddit rather than a post.
function isSubredditLink(link) {
  const label = normalizedText(link.text());
  return Boolean(
    matchesRedditPath(getUrl(link), /^\/r\/[^/]+\/?$/i) ||
    label.match(/^r\/[\w-]+$/i)
  );
}

// This function checks whether a URL identifies a Reddit comments page.
function isCommentsUrl(value) {
  return matchesRedditPath(
    value,
    /^\/r\/[^/]+\/comments\/[^/]+(?:\/.*)?$/i
  );
}

// This function returns the first link matching a role predicate.
function firstLink($, elements, predicate) {
  const match = elements.find(el => predicate($(el)));
  return match ? $(match) : null;
}

// This function counts independent Reddit signals on a candidate layout table.
function redditIndicatorCount($, table, secondCell) {
  const allLinks = table.find('a[href]').toArray();
  const secondLinks = secondCell.find('a[href]').toArray();
  const secondText = normalizedText(secondCell.text());
  const mediaValues = table
    .find('img')
    .toArray()
    .flatMap(el => [$(el).attr('src'), $(el).attr('data-src')])
    .filter(Boolean);

  return [
    allLinks.some(el => isRedditUrl($(el).attr('href'))),
    allLinks.some(el => isRedditMediaUrl($(el).attr('href'))) ||
      mediaValues.some(isRedditMediaUrl),
    secondLinks.some(el => matchesRedditPath($(el).attr('href'), /^\/user\//i)),
    /(?:^|\s)\/?u\/[\w-]+(?:\s|$)/i.test(secondText),
    secondLinks.some(el => matchesRedditPath($(el).attr('href'), /^\/r\/[^/]+\/?$/i)),
    /(?:^|\s)r\/[\w-]+(?:\s|$)/i.test(secondText),
    /submitted by/i.test(secondText),
    secondLinks.some(el => normalizedText($(el).text()).toLowerCase() === '[link]'),
    secondLinks.some(el => normalizedText($(el).text()).toLowerCase() === '[comments]'),
    allLinks.some(el => isCommentsUrl($(el).attr('href')))
  ].filter(Boolean).length;
}

// This function checks the structural and publisher signals for one Reddit layout table.
function isRedditLayoutTable($, table) {
  if (table.closest('.publisher-card--reddit, [aria-label="Reddit post"]').length > 0) {
    return false;
  }

  const rows = table.find('tr');
  if (rows.length !== 1) return false;

  const row = rows.first();
  const cells = row.children('td');
  if (cells.length !== 2 || row.children('td, th').length !== 2) return false;

  const firstCell = cells.eq(0);
  const secondCell = cells.eq(1);
  if (firstCell.find('img').length === 0) return false;

  const secondHasRedditMetadata = secondCell.find('a[href]').toArray().some(el => {
    const link = $(el);
    return (
      isRedditUrl(getUrl(link)) ||
      isRedditMediaUrl(getUrl(link)) ||
      isAuthorLink(link) ||
      isSubredditLink(link) ||
      isCommentsUrl(getUrl(link)) ||
      ['[link]', '[comments]'].includes(normalizedText(link.text()).toLowerCase())
    );
  }) || /submitted by|(?:^|\s)\/?u\/|(?:^|\s)r\//i.test(normalizedText(secondCell.text()));

  return secondHasRedditMetadata && redditIndicatorCount($, table, secondCell) >= 2;
}

// This function identifies the metadata and action links in a Reddit layout table.
function extractLinkRoles($, table, firstCell, secondCell) {
  const secondLinks = secondCell.find('a[href]').toArray();
  const allLinks = table.find('a[href]').toArray();
  const author = firstLink($, secondLinks, isAuthorLink);
  const subreddit = firstLink($, secondLinks, isSubredditLink);
  const commentsLabel = firstLink(
    $,
    secondLinks,
    link => normalizedText(link.text()).toLowerCase() === '[comments]'
  );
  const comments = commentsLabel ||
    firstLink($, secondLinks, link => isCommentsUrl(getUrl(link))) ||
    firstLink($, allLinks, link => isCommentsUrl(getUrl(link)));
  const originalLabel = firstLink(
    $,
    secondLinks,
    link => normalizedText(link.text()).toLowerCase() === '[link]'
  );
  const mediaLink = firstLink($, secondLinks, link => isRedditMediaUrl(getUrl(link)));
  const externalLink = firstLink($, secondLinks, link => {
    const url = parsedUrl(getUrl(link));
    return Boolean(
      url &&
      ['http:', 'https:'].includes(url.protocol) &&
      !isRedditUrl(getUrl(link)) &&
      !isRedditMediaUrl(getUrl(link)) &&
      !isCommentsUrl(getUrl(link)) &&
      !isAuthorLink(link) &&
      !isSubredditLink(link)
    );
  });
  const original = originalLabel || mediaLink || externalLink;
  const firstImage = firstCell.find('img').first();
  const imageSource = String(
    firstImage.attr('src') || firstImage.attr('data-src') || ''
  ).trim();
  const commentsUrl = getUrl(comments);
  let originalUrl = getUrl(original);

  if (!originalUrl && isRedditMediaUrl(imageSource)) originalUrl = imageSource;
  if (originalUrl && originalUrl === commentsUrl) originalUrl = '';

  return {
    author,
    subreddit,
    commentsUrl,
    originalUrl
  };
}

// This function creates a safe action or metadata link.
function createLink($, href, label) {
  if (!href) return null;
  return $('<a></a>').attr('href', href).text(label);
}

// This function derives a readable author label without changing its URL.
function authorLabel(link) {
  if (!link) return '';

  const visible = normalizedText(link.text()).replace(/^\/u\//i, 'u/');
  if (visible) return visible;

  const username = parsedUrl(getUrl(link))?.pathname.match(/^\/user\/([^/]+)/i)?.[1];
  return username ? `u/${username}` : '';
}

// This function derives a readable subreddit label without changing its URL.
function subredditLabel(link) {
  if (!link) return '';

  const visible = normalizedText(link.text());
  if (visible) return visible;

  const subreddit = parsedUrl(getUrl(link))?.pathname.match(/^\/r\/([^/]+)/i)?.[1];
  return subreddit ? `r/${subreddit}` : '';
}

// This function creates a stable signature for matching cloned publisher links.
function linkSignature(link) {
  return `${getUrl(link)}\u0000${normalizedText(link?.text()).toLowerCase()}`;
}

// This function checks whether a subtree still contains readable article content.
function hasMeaningfulContent(node) {
  if (normalizedText(node.text())) return true;
  return node.find(BODY_SEMANTIC_ELEMENTS).length > 0;
}

// This function removes extracted metadata and empty layout residue from cloned body content.
function extractBodyContent($, secondCell, roles) {
  const clone = secondCell.clone();
  const extractedSignatures = new Set([
    roles.author,
    roles.subreddit
  ].filter(Boolean).map(linkSignature));

  clone.find('a').each((_, el) => {
    const link = $(el);
    const label = normalizedText(link.text()).toLowerCase();
    const href = getUrl(link);

    if (
      extractedSignatures.has(linkSignature(link)) ||
      ['[link]', '[comments]'].includes(label) ||
      href === roles.originalUrl ||
      href === roles.commentsUrl
    ) {
      link.remove();
    }
  });

  const elements = [clone[0], ...clone.find('*').toArray()];
  for (const el of elements) {
    for (const child of [...(el.children || [])]) {
      if (
        child.type === 'text' &&
        ['submitted by', 'to'].includes(normalizedText(child.data).toLowerCase())
      ) {
        $(child).remove();
      }
    }
  }

  clone.find('br').remove();
  for (const el of clone.find('span, div, p').toArray().reverse()) {
    const node = $(el);
    if (!hasMeaningfulContent(node)) node.remove();
  }

  return hasMeaningfulContent(clone) ? clone.contents() : null;
}

// This function moves unique Reddit media elements into a vertical figure.
function appendMedia($, figure, firstCell, fallbackHref) {
  const usedAnchors = new Set();
  const usedImages = new Set();

  for (const el of firstCell.find('img').toArray()) {
    if (usedImages.has(el)) continue;

    const image = $(el);
    const anchor = image.closest('a[href]').first();
    const anchorInFirstCell = anchor.length > 0 && anchor.closest('td')[0] === firstCell[0];

    if (anchorInFirstCell) {
      if (usedAnchors.has(anchor[0])) continue;
      usedAnchors.add(anchor[0]);
      for (const imageEl of anchor.find('img').toArray()) usedImages.add(imageEl);
      figure.append(anchor);
      continue;
    }

    const movedImage = image;
    const link = createLink($, fallbackHref, '');
    if (link) {
      link.empty().append(movedImage);
      figure.append(link);
    } else {
      figure.append(movedImage);
    }
  }
}

// This function builds one semantic Reddit card from a recognized layout table.
function transformTable($, table) {
  const row = table.find('tr').first();
  const cells = row.children('td');
  const firstCell = cells.eq(0);
  const secondCell = cells.eq(1);
  const roles = extractLinkRoles($, table, firstCell, secondCell);
  const bodyContent = extractBodyContent($, secondCell, roles);
  const card = $('<div></div>')
    .addClass('publisher-card publisher-card--reddit')
    .attr('aria-label', 'Reddit post');
  const figure = $('<figure></figure>')
    .addClass('publisher-card__media')
    .attr('aria-label', 'Reddit post media');

  appendMedia($, figure, firstCell, roles.commentsUrl || roles.originalUrl);
  card.append(figure);

  if (bodyContent) {
    card.append(
      $('<div></div>')
        .addClass('publisher-card__content')
        .attr('aria-label', 'Reddit post content')
        .append(bodyContent)
    );
  }

  const meta = $('<div></div>')
    .addClass('publisher-card__meta')
    .attr('aria-label', 'Reddit post metadata');
  const author = authorLabel(roles.author);
  const subreddit = subredditLabel(roles.subreddit);

  if (author || subreddit) {
    const byline = $('<span></span>')
      .addClass('publisher-card__byline')
      .attr('aria-label', 'Reddit post byline');

    if (author) {
      byline.append('Submitted by ');
      byline.append(createLink($, getUrl(roles.author), author));
    }
    if (subreddit) {
      byline.append(author ? ' to ' : 'To ');
      byline.append(createLink($, getUrl(roles.subreddit), subreddit));
    }

    meta.append(byline);
  }

  if (roles.originalUrl || roles.commentsUrl) {
    const actions = $('<div></div>')
      .addClass('publisher-card__actions')
      .attr('aria-label', 'Reddit post actions');
    const originalLink = createLink($, roles.originalUrl, 'View original');
    const commentsLink = createLink($, roles.commentsUrl, 'Comments');

    if (originalLink) actions.append(originalLink);
    if (commentsLink) actions.append(commentsLink);
    meta.append(actions);
  }

  if (meta.children().length > 0) card.append(meta);
  table.replaceWith(card);
}

// This function converts recognized Reddit RSS layout tables into vertical semantic cards.
export const transformRedditContent = ($) => {
  let transformedCount = 0;

  for (const el of $('table').toArray()) {
    const table = $(el);
    if (!isRedditLayoutTable($, table)) continue;

    transformTable($, table);
    transformedCount += 1;
  }

  return transformedCount;
};
