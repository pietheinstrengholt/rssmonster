// Resolves YouTube channel, handle, or custom URLs to YouTube's RSS feed endpoint.
// Video URLs are rejected because they do not represent a channel feed.
import { fetchURL as fetchURLInternal } from '../../utils/fetchURL.js';

const YOUTUBE_HOSTNAMES = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be'
]);

// Checks whether an absolute HTTP(S) URL uses an explicitly supported YouTube hostname.
export const isYoutubeUrl = (input) => {
  try {
    const url = new URL(input);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      YOUTUBE_HOSTNAMES.has(url.hostname)
    );
  } catch {
    return false;
  }
};

// Converts supported YouTube inputs into the corresponding channel RSS URL.
export const getYoutubeRssFromHandle = async (input) => {
  let url;

  try {
    // Normalize input
    url = input.startsWith('http')
      ? new URL(input)
      : new URL(`https://www.youtube.com/@${input}`);
  } catch {
    return undefined;
  }

  if (!isYoutubeUrl(url.toString())) return undefined;

  // Reject video URLs
  if (url.hostname === 'youtu.be' || url.searchParams.has('v')) {
    return undefined;
  }

  // Direct channel ID
  if (url.pathname.startsWith('/channel/')) {
    const channelId = url.pathname.split('/')[2];
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  }

  // Fetch HTML for @handle or /c/ URLs
  let res;
  try {
    res = await fetchURLInternal(url.toString());
  } catch {
    return undefined;
  }

  if (!res?.ok) return undefined;

  const html = await res.text();

  // YouTube embeds channelId in page JSON
  const match = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{20,})"/);
  if (!match) return undefined;

  const channelId = match[1];
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
};
