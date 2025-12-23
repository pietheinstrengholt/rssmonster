/* ======================================================
   Media processing
   ------------------------------------------------------
   Handles media feeds (e.g. YouTube, podcast enclosures)
   and extracts lead image + preview HTML
====================================================== */
function processMedia(entry) {
  if (!entry.media) return {};

  const rawMedia = entry.media;

  // Normalize media to array (feedsmith quirk)
  const mediaArray = Array.isArray(rawMedia)
    ? rawMedia
    : rawMedia?.group?.contents || [];

  if (!mediaArray.length) return {};

  // Collect media items
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

  // Pick lead image (first image found)
  const leadImage =
    mediaItems.find(m => m.image)?.image || null;

  // Build content from FIRST media item
  const media = mediaItems[0];

  const content = `
    <div class="media-content">
      ${media.image ? `<img src="${media.image}" alt="${media.title || 'Media'}" style="max-width:100%;height:auto;">` : ''}
      ${media.title ? `<h5>${media.title}</h5>` : ''}
      ${media.url ? `<p><a href="${media.url}" target="_blank">View Media</a></p>` : ''}
    </div>
  `;

  return { content, leadImage };
}

export default processMedia;
