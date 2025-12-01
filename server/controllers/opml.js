import Category from "../models/category.js";
import Feed from "../models/feed.js";

export const exportOpml = async (req, res, next) => {
  try {
    const userId = req.userData.userId;

    // Fetch all categories with their feeds for this user
    const categories = await Category.findAll({
      where: { userId: userId },
      include: [{
        model: Feed,
        required: false
      }],
      order: [
        ["categoryOrder", "ASC"],
        ["name", "ASC"],
        [Feed, "feedName", "ASC"]
      ]
    });

    // Build OPML XML
    const timestamp = new Date().toUTCString();
    let opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>RSSMonster Feed Export</title>
    <dateCreated>${timestamp}</dateCreated>
  </head>
  <body>
`;

    // Add each category as an outline with nested feed outlines
    categories.forEach(category => {
      opml += `    <outline text="${escapeXml(category.name)}" title="${escapeXml(category.name)}">\n`;
      
      if (category.feeds && category.feeds.length > 0) {
        category.feeds.forEach(feed => {
          opml += `      <outline type="rss" text="${escapeXml(feed.feedName)}" title="${escapeXml(feed.feedName)}" xmlUrl="${escapeXml(feed.url)}"`;
          if (feed.description) {
            opml += ` description="${escapeXml(feed.description)}"`;
          }
          if (feed.link) {
            opml += ` htmlUrl="${escapeXml(feed.link)}"`;
          }
          opml += ` />\n`;
        });
      }
      
      opml += `    </outline>\n`;
    });

    opml += `  </body>
</opml>`;

    // Set headers for XML download
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rssmonster-export-${Date.now()}.opml"`);
    
    return res.status(200).send(opml);
  } catch (err) {
    console.error('Error exporting OPML:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Helper function to escape XML special characters
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default {
  exportOpml
};
