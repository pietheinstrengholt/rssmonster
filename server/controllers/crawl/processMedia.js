/* ======================================================
   Media + enclosure processing
   ------------------------------------------------------
   Handles media feeds (e.g. YouTube, podcast enclosures)
   and extracts lead image + preview HTML
====================================================== */
function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeMediaUrl(value = '') {
  const trimmed = String(value).trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function processMedia(entry) {
  let leadImage = null;
  let content = '';

  /* -----------------------------
     1. Handle enclosures
  ------------------------------ */
  const enclosures = Array.isArray(entry.enclosures)
    ? entry.enclosures
    : [];

  const imageEnclosure = enclosures.find(e =>
    typeof e.type === 'string' && e.type.startsWith('image/')
  );

  if (imageEnclosure?.url && isSafeMediaUrl(imageEnclosure.url)) {
    leadImage = imageEnclosure.url;

    content += `
      <div class="media-content enclosure">
        <img src="${escapeHtml(imageEnclosure.url)}" alt="${escapeHtml(entry.title || 'Image')}">
      </div>
    `;
  }

  /* -----------------------------
     2. Handle feedsmith media
  ------------------------------ */
  if (entry.media) {
    const rawMedia = entry.media;

    // Normalize media to array (feedsmith quirk)
    const mediaArray = Array.isArray(rawMedia)
      ? rawMedia
      : rawMedia?.group?.contents || [];

    if (mediaArray.length) {
      const mediaItems = mediaArray.map(m => ({
        type: m.type || 'video',
        url: m.url || m.player?.url || null,
        image:
          m.image ||
          m.thumbnail ||
          rawMedia?.group?.thumbnails?.[0]?.url ||
          null,
        title: m.title?.value || m.title || null
      }));

      // If no enclosure image exists, use media image
      if (!leadImage) {
        leadImage =
          mediaItems.find(m => isSafeMediaUrl(m.image))?.image || null;
      }

      const media = mediaItems[0];
      const safeImage = isSafeMediaUrl(media.image) ? media.image : null;
      const safeUrl = isSafeMediaUrl(media.url) ? media.url : null;

      content += `
        <div class="media-content media">
          ${safeImage ? `<img src="${escapeHtml(safeImage)}" alt="${escapeHtml(media.title || 'Media')}">` : ''}
          ${media.title ? `<h5>${escapeHtml(media.title)}</h5>` : ''}
          ${safeUrl ? `<p><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">View Media</a></p>` : ''}
        </div>
      `;
    }
  }

  return {
    content: content || null,
    leadImage
  };
}

export default processMedia;
