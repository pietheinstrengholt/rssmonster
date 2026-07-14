const EMBED_SHORTCODE_PATTERN = /\[embed\]([\s\S]*?)\[\/embed\]/gi;
const CAPTION_OPEN_SHORTCODE_PATTERN = /\[caption\b[^\]]*\]/gi;
const CAPTION_CLOSE_SHORTCODE_PATTERN = /\[\/caption\]/gi;

// This function extracts a YouTube video ID from supported embed URLs.
function youtubeVideoIdFromUrl(value = '') {
  const trimmed = String(value).trim();

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (hostname === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }

    if (hostname === 'youtube.com' && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }
  } catch {
    return null;
  }

  return null;
}

// This function converts supported embed shortcodes into safe fallback links.
function replaceKnownEmbeds(html = '') {
  return String(html).replace(EMBED_SHORTCODE_PATTERN, (match, embedUrl) => {
    const videoId = youtubeVideoIdFromUrl(embedUrl);
    if (!videoId) return match;

    const href = `https://youtu.be/${videoId}`;

    return `<figure class="embed embed-youtube"><a href="${href}">Watch on YouTube</a></figure>`;
  });
}

// This function removes or converts WordPress shortcodes that feeds expose as text.
export const transformWordPressContent = (html = '') => replaceKnownEmbeds(html)
  .replace(CAPTION_OPEN_SHORTCODE_PATTERN, '')
  .replace(CAPTION_CLOSE_SHORTCODE_PATTERN, '');
