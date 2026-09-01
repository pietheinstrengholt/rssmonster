import db from '../models/index.js';
const { Feed, Category } = db;
import {
  OpmlImportError,
  importOpmlPreview
} from '../services/feeds/opmlImport.js';
import {
  getOpmlPreviewJob,
  startOpmlPreviewJob
} from '../services/feeds/opmlPreviewJobs.js';

/**
 * Generate OPML content for a user's feeds
 * @param {number} userId - The user ID to generate OPML for
 * @returns {Promise<string>} - The OPML XML content
 */
export const generateOpml = async (userId) => {
  // Fetch all categories with their feeds for this user
  const categories = await Category.findAll({
    where: { userId: userId },
    include: [{
      model: Feed,
      required: false,
      where: { userId }
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
        if (feed.feedDesc) {
          opml += ` description="${escapeXml(feed.feedDesc)}"`;
        }
        opml += ` htmlUrl="${escapeXml(feed.url)}"`;
        opml += ` />\n`;
      });
    }
    
    opml += `    </outline>\n`;
  });

  opml += `  </body>
</opml>`;

  return opml;
};

export const exportOpml = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const opml = await generateOpml(userId);

    // Set headers for XML download
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rssmonster-export-${Date.now()}.opml"`);
    
    return res.status(200).send(opml);
  } catch (err) {
    console.error('Error exporting OPML:', err);
    return res.status(500).json({ error: 'OPML export failed' });
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

export const previewOpml = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    // Check if file was uploaded
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No OPML file provided' });
    }

    const result = await startOpmlPreviewJob({
      userId,
      content: req.file.buffer
    });

    return res.status(202).json(result);
  } catch (err) {
    console.error('Error previewing OPML:', err);
    if (err instanceof OpmlImportError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'OPML preview failed' });
  }
};

export const getOpmlPreviewStatus = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const result = getOpmlPreviewJob({
      previewId: req.params.previewId,
      userId
    });
    if (!result) {
      return res.status(404).json({ error: 'OPML preview not found' });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('Error reading OPML preview status:', err);
    return res.status(500).json({ error: 'OPML preview status failed' });
  }
};

export const importOpml = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const result = await importOpmlPreview({
      userId,
      preview: req.body
    });

    return res.status(200).json({
      message: 'OPML import completed',
      ...result
    });
  } catch (err) {
    console.error('Error importing OPML:', err);
    if (err instanceof OpmlImportError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'OPML import failed' });
  }
};

export default {
  exportOpml,
  previewOpml,
  getOpmlPreviewStatus,
  importOpml
};
