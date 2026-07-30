// Defines the reddit hosts enforced by this service.
const REDDIT_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com'
]);

// Defines the reddit media hosts enforced by this service.
const REDDIT_MEDIA_HOSTS = new Set([
  'redd.it',
  'i.redd.it',
  'preview.redd.it',
  'v.redd.it'
]);

// Defines the body semantic elements enforced by this service.
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

// This function normalizes visible Reddit text for comparisons and labels.
function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// This function parses absolute and relative Reddit URLs without throwing.
function parsedUrl(value) {
  // Normalizes the raw before performing parsed url.
  const raw = String(value || '').trim();
  // Returns no result when raw is unavailable.
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
  // Parses the d url while checking reddit url.
  const url = parsedUrl(value);
  return Boolean(url && REDDIT_HOSTS.has(url.hostname.toLowerCase()));
}

// This function checks whether a URL points to Reddit-hosted media.
function isRedditMediaUrl(value) {
  // Parses the d url while checking reddit media url.
  const url = parsedUrl(value);
  return Boolean(url && REDDIT_MEDIA_HOSTS.has(url.hostname.toLowerCase()));
}

// This function checks a Reddit path on either a recognized host or a relative URL.
function matchesRedditPath(value, pattern) {
  // Parses the d url while performing matches reddit path.
  const url = parsedUrl(value);
  return Boolean(
    url &&
    (REDDIT_HOSTS.has(url.hostname.toLowerCase()) || url.hostname === 'relative.invalid') &&
    pattern.test(url.pathname)
  );
}

// This function checks whether a link identifies a Reddit user.
function isAuthorLink(link) {
  // Normalizes the label before checking author link.
  const label = normalizedText(link.text());
  return Boolean(
    matchesRedditPath(getUrl(link), /^\/user\/[^/]+\/?$/i) ||
    label.match(/^\/?u\/[\w-]+$/i)
  );
}

// This function checks whether a link identifies a subreddit rather than a post.
function isSubredditLink(link) {
  // Normalizes the label before checking subreddit link.
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
  // Loads the match needed while performing first link.
  const match = elements.find(el => predicate($(el)));
  // Selects the result based on whether match is available.
  return match ? $(match) : null;
}

// This function counts independent Reddit signals on a candidate layout table.
function redditIndicatorCount($, table, secondCell) {
  // Derives the all links through to array while performing reddit indicator count.
  const allLinks = table.find('a[href]').toArray();
  // Derives the second links through to array while performing reddit indicator count.
  const secondLinks = secondCell.find('a[href]').toArray();
  // Normalizes the second text before performing reddit indicator count.
  const secondText = normalizedText(secondCell.text());
  // Keeps the media values entries eligible while performing reddit indicator count.
  const mediaValues = table
    .find('img')
    .toArray()
    .flatMap(el => [$(el).attr('src'), $(el).attr('data-src')])
    .filter(Boolean);

  // Checks candidate values while performing reddit indicator count.
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
  // Rejects the value when closest count exceeds value.
  if (table.closest('.publisher-card--reddit, [aria-label="Reddit post"]').length > 0) {
    return false;
  }

  // Loads the rows needed while checking reddit layout table.
  const rows = table.find('tr');
  // Rejects the value when rows count is not 1.
  if (rows.length !== 1) return false;

  // Derives the row through first while checking reddit layout table.
  const row = rows.first();
  // Derives the cells through children while checking reddit layout table.
  const cells = row.children('td');
  // Rejects the value when cells count is not 2 or children count is not 2.
  if (cells.length !== 2 || row.children('td, th').length !== 2) return false;

  // Derives the first cell through eq while checking reddit layout table.
  const firstCell = cells.eq(0);
  // Derives the second cell through eq while checking reddit layout table.
  const secondCell = cells.eq(1);
  // Rejects the value when find count is value.
  if (firstCell.find('img').length === 0) return false;

  // Derives the second has reddit metadata required while checking reddit layout table.
  const secondHasRedditMetadata = secondCell.find('a[href]').toArray().some(el => {
    // Derives the link through $ while checking reddit layout table.
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
  // Derives the second links through to array while extracting link roles.
  const secondLinks = secondCell.find('a[href]').toArray();
  // Derives the all links through to array while extracting link roles.
  const allLinks = table.find('a[href]').toArray();
  // Derives the author through first link while extracting link roles.
  const author = firstLink($, secondLinks, isAuthorLink);
  // Derives the subreddit through first link while extracting link roles.
  const subreddit = firstLink($, secondLinks, isSubredditLink);
  // Derives the comments label through first link while extracting link roles.
  const commentsLabel = firstLink(
    $,
    secondLinks,
    link => normalizedText(link.text()).toLowerCase() === '[comments]'
  );
  // Derives the comments required while extracting link roles.
  const comments = commentsLabel ||
    firstLink($, secondLinks, link => isCommentsUrl(getUrl(link))) ||
    firstLink($, allLinks, link => isCommentsUrl(getUrl(link)));
  // Derives the original label through first link while extracting link roles.
  const originalLabel = firstLink(
    $,
    secondLinks,
    link => normalizedText(link.text()).toLowerCase() === '[link]'
  );
  // Derives the media link through first link while extracting link roles.
  const mediaLink = firstLink($, secondLinks, link => isRedditMediaUrl(getUrl(link)));
  // Derives the external link through first link while extracting link roles.
  const externalLink = firstLink($, secondLinks, link => {
    // Parses the d url while extracting link roles.
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
  // Derives the original required while extracting link roles.
  const original = originalLabel || mediaLink || externalLink;
  // Derives the first image through first while extracting link roles.
  const firstImage = firstCell.find('img').first();
  // Normalizes the image source before extracting link roles.
  const imageSource = String(
    firstImage.attr('src') || firstImage.attr('data-src') || ''
  ).trim();
  // Derives the comments url through get url while extracting link roles.
  const commentsUrl = getUrl(comments);
  // Derives the original url through get url while extracting link roles.
  let originalUrl = getUrl(original);

  // Handles the case where original url is unavailable and image source is reddit media url.
  if (!originalUrl && isRedditMediaUrl(imageSource)) originalUrl = imageSource;
  // Handles the case where original url is available and original url is comments url.
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
  // Returns no result when href is unavailable.
  if (!href) return null;
  return $('<a></a>').attr('href', href).text(label);
}

// This function derives a readable author label without changing its URL.
function authorLabel(link) {
  // Returns early when link is unavailable.
  if (!link) return '';

  // Derives the visible through replace while performing author label.
  const visible = normalizedText(link.text()).replace(/^\/u\//i, 'u/');
  // Returns early when visible is available.
  if (visible) return visible;

  const username = parsedUrl(getUrl(link))?.pathname.match(/^\/user\/([^/]+)/i)?.[1];
  // Selects the result based on whether username is available.
  return username ? `u/${username}` : '';
}

// This function derives a readable subreddit label without changing its URL.
function subredditLabel(link) {
  // Returns early when link is unavailable.
  if (!link) return '';

  // Normalizes the visible before performing subreddit label.
  const visible = normalizedText(link.text());
  // Returns early when visible is available.
  if (visible) return visible;

  const subreddit = parsedUrl(getUrl(link))?.pathname.match(/^\/r\/([^/]+)/i)?.[1];
  // Selects the result based on whether subreddit is available.
  return subreddit ? `r/${subreddit}` : '';
}

// This function creates a stable signature for matching cloned publisher links.
function linkSignature(link) {
  return `${getUrl(link)}\u0000${normalizedText(link?.text()).toLowerCase()}`;
}

// This function checks whether a subtree still contains readable article content.
function hasMeaningfulContent(node) {
  // Returns early when normalized text succeeds.
  if (normalizedText(node.text())) return true;
  return node.find(BODY_SEMANTIC_ELEMENTS).length > 0;
}

// This function removes extracted metadata and empty layout residue from cloned body content.
function extractBodyContent($, secondCell, roles) {
  // Derives the clone through clone while extracting body content.
  const clone = secondCell.clone();
  // Tracks distinct extracted signatures while extracting body content.
  const extractedSignatures = new Set([
    roles.author,
    roles.subreddit
  ].filter(Boolean).map(linkSignature));

  // Runs the callback required while extracting body content.
  clone.find('a').each((_, el) => {
    // Derives the link through $ while extracting body content.
    const link = $(el);
    // Normalizes the label before extracting body content.
    const label = normalizedText(link.text()).toLowerCase();
    // Derives the href through get url while extracting body content.
    const href = getUrl(link);

    // Handles the case where extracted signatures contains link signature or value contains label or href is roles original url or href is roles comments url.
    if (
      extractedSignatures.has(linkSignature(link)) ||
      ['[link]', '[comments]'].includes(label) ||
      href === roles.originalUrl ||
      href === roles.commentsUrl
    ) {
      link.remove();
    }
  });

  // Collects the elements while extracting body content.
  const elements = [clone[0], ...clone.find('*').toArray()];
  // Processes each elements entry in turn.
  for (const el of elements) {
    // Processes each entry entry in turn.
    for (const child of [...(el.children || [])]) {
      // Handles the case where child type is text and value contains to lower case.
      if (
        child.type === 'text' &&
        ['submitted by', 'to'].includes(normalizedText(child.data).toLowerCase())
      ) {
        $(child).remove();
      }
    }
  }

  clone.find('br').remove();
  // Processes each reverse entry in turn.
  for (const el of clone.find('span, div, p').toArray().reverse()) {
    // Derives the node through $ while extracting body content.
    const node = $(el);
    // Handles the case where has meaningful content is unavailable.
    if (!hasMeaningfulContent(node)) node.remove();
  }

  // Selects the result based on whether has meaningful content succeeds.
  return hasMeaningfulContent(clone) ? clone.contents() : null;
}

// This function moves unique Reddit media elements into a vertical figure.
function appendMedia($, figure, firstCell, fallbackHref) {
  // Tracks distinct used anchors while performing append media.
  const usedAnchors = new Set();
  // Tracks distinct used images while performing append media.
  const usedImages = new Set();

  // Processes each to array entry in turn.
  for (const el of firstCell.find('img').toArray()) {
    // Skips the current entry when used images contains el.
    if (usedImages.has(el)) continue;

    // Derives the image through $ while performing append media.
    const image = $(el);
    // Derives the anchor through first while performing append media.
    const anchor = image.closest('a[href]').first();
    // Derives the anchor in first cell required while performing append media.
    const anchorInFirstCell = anchor.length > 0 && anchor.closest('td')[0] === firstCell[0];

    // Handles the case where anchor in first cell is available.
    if (anchorInFirstCell) {
      // Skips the current entry when used anchors contains anchor 0.
      if (usedAnchors.has(anchor[0])) continue;
      usedAnchors.add(anchor[0]);
      // Processes each to array entry in turn.
      for (const imageEl of anchor.find('img').toArray()) usedImages.add(imageEl);
      figure.append(anchor);
      continue;
    }

    const movedImage = image;
    // Creates the link while performing append media.
    const link = createLink($, fallbackHref, '');
    // Handles the case where link is available.
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
  // Derives the row through first while performing transform table.
  const row = table.find('tr').first();
  // Derives the cells through children while performing transform table.
  const cells = row.children('td');
  // Derives the first cell through eq while performing transform table.
  const firstCell = cells.eq(0);
  // Derives the second cell through eq while performing transform table.
  const secondCell = cells.eq(1);
  // Extracts the link roles while performing transform table.
  const roles = extractLinkRoles($, table, firstCell, secondCell);
  // Extracts the body content while performing transform table.
  const bodyContent = extractBodyContent($, secondCell, roles);
  // Derives the card through attr while performing transform table.
  const card = $('<div></div>')
    .addClass('publisher-card publisher-card--reddit')
    .attr('aria-label', 'Reddit post');
  // Derives the figure through attr while performing transform table.
  const figure = $('<figure></figure>')
    .addClass('publisher-card__media')
    .attr('aria-label', 'Reddit post media');

  appendMedia($, figure, firstCell, roles.commentsUrl || roles.originalUrl);
  card.append(figure);

  // Handles the case where body content is available.
  if (bodyContent) {
    card.append(
      $('<div></div>')
        .addClass('publisher-card__content')
        .attr('aria-label', 'Reddit post content')
        .append(bodyContent)
    );
  }

  // Derives the meta through attr while performing transform table.
  const meta = $('<div></div>')
    .addClass('publisher-card__meta')
    .attr('aria-label', 'Reddit post metadata');
  // Derives the author through author label while performing transform table.
  const author = authorLabel(roles.author);
  // Derives the subreddit through subreddit label while performing transform table.
  const subreddit = subredditLabel(roles.subreddit);

  // Handles the case where author is available or subreddit is available.
  if (author || subreddit) {
    // Derives the byline through attr while performing transform table.
    const byline = $('<span></span>')
      .addClass('publisher-card__byline')
      .attr('aria-label', 'Reddit post byline');

    // Handles the case where author is available.
    if (author) {
      byline.append('Submitted by ');
      byline.append(createLink($, getUrl(roles.author), author));
    }
    // Handles the case where subreddit is available.
    if (subreddit) {
      // Selects the result based on whether author is available.
      byline.append(author ? ' to ' : 'To ');
      byline.append(createLink($, getUrl(roles.subreddit), subreddit));
    }

    meta.append(byline);
  }

  // Handles the case where roles original url is available or roles comments url is available.
  if (roles.originalUrl || roles.commentsUrl) {
    // Derives the actions through attr while performing transform table.
    const actions = $('<div></div>')
      .addClass('publisher-card__actions')
      .attr('aria-label', 'Reddit post actions');
    // Creates the link while performing transform table.
    const originalLink = createLink($, roles.originalUrl, 'View original');
    // Creates the link while performing transform table.
    const commentsLink = createLink($, roles.commentsUrl, 'Comments');

    // Handles the case where original link is available.
    if (originalLink) actions.append(originalLink);
    // Handles the case where comments link is available.
    if (commentsLink) actions.append(commentsLink);
    meta.append(actions);
  }

  // Handles the case where children count exceeds value.
  if (meta.children().length > 0) card.append(meta);
  table.replaceWith(card);
}

// This function converts recognized Reddit RSS layout tables into vertical semantic cards.
export const transformRedditContent = ($) => {
  let transformedCount = 0;

  // Processes each to array entry in turn.
  for (const el of $('table').toArray()) {
    // Derives the table through $ while performing transform reddit content.
    const table = $(el);
    // Skips the current entry when $ is not reddit layout table.
    if (!isRedditLayoutTable($, table)) continue;

    transformTable($, table);
    transformedCount += 1;
  }

  return transformedCount;
};
