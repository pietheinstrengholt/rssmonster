/* ======================================================
   Media + enclosure processing
   ------------------------------------------------------
   Handles media feeds (e.g. YouTube, podcast enclosures)
   and extracts lead image + preview HTML
====================================================== */
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

  if (imageEnclosure?.url) {
    leadImage = imageEnclosure.url;

    content += `
      <div class="media-content enclosure">
        <img src="${imageEnclosure.url}" alt="${entry.title || 'Image'}" style="max-width:100%;height:auto;">
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
          mediaItems.find(m => m.image)?.image || null;
      }

      const media = mediaItems[0];

      content += `
        <div class="media-content media">
          ${media.image ? `<img src="${media.image}" alt="${media.title || 'Media'}" style="max-width:100%;height:auto;">` : ''}
          ${media.title ? `<h5>${media.title}</h5>` : ''}
          ${media.url ? `<p><a href="${media.url}" target="_blank">View Media</a></p>` : ''}
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
