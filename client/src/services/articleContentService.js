export const NULL_ARTICLE_CONTENT = '<html><head></head><body>null</body></html>';

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// This function converts a legacy raw description into display-safe literal HTML.
export function safeDescriptionFallbackHtml(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[\t ]*\n+/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(paragraph => `<p>${paragraph
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</p>`)
    .join('\n');
}

// This function classifies a lead image from its known dimensions.
export function classifyArticleLeadImage(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'pending';

  const area = width * height;
  const aspectRatio = width / height;
  const isNearSquare = aspectRatio >= 0.8 && aspectRatio <= 1.25;

  if (width <= 2 || height <= 2 || (width < 96 && height < 96) || aspectRatio > 4.5 || aspectRatio < 0.18) return 'hidden';
  if (width >= 640 && height >= 320 && area >= 300000 && aspectRatio > 1.25 && aspectRatio <= 3.2) return 'hero';
  if (width >= 500 && height >= 700 && height / width > 1.35) return 'portrait';
  if (isNearSquare || width < 640 || height < 320) return 'thumbnail';

  return 'thumbnail';
}

// This function normalizes image URLs without discarding meaningful query parameters.
function normalizeImageUrl(value) {
  const decodedUrl = String(value || '').trim().replace(/&amp;/gi, '&');
  if (!decodedUrl) return '';

  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.href : undefined;
    const parsedUrl = baseUrl ? new URL(decodedUrl, baseUrl) : new URL(decodedUrl);

    if (parsedUrl.pathname.length > 1) {
      parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
    }

    return parsedUrl.href;
  } catch {
    return decodedUrl.length > 1 ? decodedUrl.replace(/\/+$/, '') : decodedUrl;
  }
}

// This function preserves safe string-based normalization when DOMParser is unavailable.
function fallbackNormalizedContent(html, fallbackImageUrl = '') {
  const normalizedFallbackImageUrl = normalizeImageUrl(fallbackImageUrl);
  const decodedHtml = html.replace(/&amp;/gi, '&');
  const rawFallbackImageUrl = String(fallbackImageUrl || '').trim().replace(/&amp;/gi, '&');
  const text = html.replace(/<(.|\n)*?>/g, ' ').replace(/&nbsp;/gi, ' ').trim();

  return {
    html,
    hasReadableContent: html !== NULL_ARTICLE_CONTENT && text.length > 0,
    containsFallbackImage: Boolean(normalizedFallbackImageUrl) && (
      decodedHtml.includes(rawFallbackImageUrl) || decodedHtml.includes(normalizedFallbackImageUrl)
    )
  };
}

// This function makes every segment of legacy Mastodon-formatted links visible.
function normalizeMastodonLinks(document) {
  document.querySelectorAll('a').forEach(link => {
    const children = Array.from(link.children);
    const visibleParts = children.filter(child => child.matches('span:not(.invisible)'));
    const invisibleParts = children.filter(child => child.matches('span.invisible'));
    const hasUnexpectedText = Array.from(link.childNodes)
      .some(child => child.nodeType === 3 && child.textContent.trim());

    if (
      visibleParts.length !== 1 ||
      invisibleParts.length === 0 ||
      children.length !== visibleParts.length + invisibleParts.length ||
      hasUnexpectedText
    ) {
      return;
    }

    invisibleParts.forEach(part => part.classList.remove('invisible'));
    children.forEach(part => {
      if (!String(part.getAttribute('class') || '').trim()) part.removeAttribute('class');
    });
  });
}

// This function checks whether a value is shaped like a YouTube video id.
function isValidYouTubeVideoId(value) {
  return YOUTUBE_VIDEO_ID_PATTERN.test(String(value || ''));
}

// This function extracts a YouTube video id from a supported URL.
export function youtubeVideoIdFromUrl(value = '') {
  try {
    const parsed = new URL(String(value), window.location.origin);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = null;

    if (hostname === 'youtu.be') {
      videoId = parsed.pathname.split('/').filter(Boolean)[0];
    } else if (hostname === 'youtube.com' && parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    } else if (hostname === 'youtube.com' && parsed.pathname.startsWith('/embed/')) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1];
    } else if (hostname === 'youtube.com' && parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1];
    }

    return isValidYouTubeVideoId(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

// This function extracts a validated YouTube video id from known figure formats.
function youtubeVideoIdFromFigure(figure) {
  const dataVideoId = figure.dataset?.videoId;

  if (isValidYouTubeVideoId(dataVideoId)) {
    return dataVideoId;
  }

  const href = figure.querySelector('a[href]')?.getAttribute('href');
  return youtubeVideoIdFromUrl(href);
}

// This function creates the safe iframe wrapper used for YouTube videos.
function createYouTubeEmbed(document, videoId) {
  const figure = document.createElement('figure');
  const iframe = document.createElement('iframe');

  figure.className = 'rssmonster-embed rssmonster-youtube-embed';
  figure.dataset.provider = 'youtube';
  figure.dataset.videoId = videoId;

  iframe.className = 'rssmonster-youtube-frame';
  iframe.src = `https://www.youtube.com/embed/${videoId}`;
  iframe.title = 'YouTube video player';
  iframe.loading = 'lazy';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;

  figure.appendChild(iframe);
  return figure;
}

// This function normalizes display markup, readable text, and fallback-image membership in one DOM pass.
export function normalizeArticleContent(value, fallbackImageUrl = '') {
  const html = String(value || '');

  if (typeof DOMParser === 'undefined') {
    return fallbackNormalizedContent(html, fallbackImageUrl);
  }

  try {
    const document = new DOMParser().parseFromString(html, 'text/html');
    normalizeMastodonLinks(document);
    const embedFigures = document.querySelectorAll('figure.rssmonster-embed[data-provider="youtube"], figure.embed-youtube');

    embedFigures.forEach(figure => {
      const videoId = youtubeVideoIdFromFigure(figure);
      if (!videoId) return;

      figure.replaceWith(createYouTubeEmbed(document, videoId));
    });

    const normalizedFallbackImageUrl = normalizeImageUrl(fallbackImageUrl);
    let containsFallbackImage = false;

    document.querySelectorAll('img, source').forEach(element => {
      if (element.tagName.toLowerCase() === 'img') {
        element.setAttribute('loading', 'lazy');
        element.setAttribute('decoding', 'async');
      }

      if (!normalizedFallbackImageUrl || containsFallbackImage) return;

      const src = element.getAttribute('src');
      const srcset = String(element.getAttribute('srcset') || '')
        .split(',')
        .map(candidate => candidate.trim().split(/\s+/)[0]);
      containsFallbackImage = [src, ...srcset]
        .some(candidate => normalizeImageUrl(candidate) === normalizedFallbackImageUrl);
    });

    const hasReadableContent = html !== NULL_ARTICLE_CONTENT
      && Boolean(String(document.body.textContent || '').replace(/\u00a0/g, ' ').trim());

    return {
      html: document.body.innerHTML,
      hasReadableContent,
      containsFallbackImage
    };
  } catch {
    return fallbackNormalizedContent(html, fallbackImageUrl);
  }
}

// This function normalizes and limits canonical visible text for article previews.
export function summarizeArticleContent(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().split(' ')
    .filter(Boolean)
    .slice(0, 100)
    .join(' ');
}
