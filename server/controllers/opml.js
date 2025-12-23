import Category from "../models/category.js";
import Feed from "../models/feed.js";
import { parseStringPromise } from 'xml2js';

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

  return opml;
};

export const exportOpml = async (req, res, next) => {
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

export const importOpml = async (req, res, next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    // Check if file was uploaded
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No OPML file provided' });
    }

    const opmlContent = req.file.buffer.toString('utf-8');

    // Parse OPML XML
    const result = await parseStringPromise(opmlContent, { 
      trim: true,
      explicitArray: false 
    });

    if (!result.opml || !result.opml.body || !result.opml.body.outline) {
      return res.status(400).json({ error: 'Invalid OPML format' });
    }

    let outlines = result.opml.body.outline;
    // Ensure outlines is always an array
    if (!Array.isArray(outlines)) {
      outlines = [outlines];
    }

    let categoriesCreated = 0;
    let feedsCreated = 0;
    let errors = [];

    // Get the maximum categoryOrder to append new categories at the end
    const maxOrderCategory = await Category.findOne({
      where: { userId: userId },
      order: [['categoryOrder', 'DESC']],
      attributes: ['categoryOrder']
    });
    let categoryOrder = maxOrderCategory ? maxOrderCategory.categoryOrder + 1 : 1;

    // Process each outline (category)
    for (const outline of outlines) {
      try {
        const categoryName = outline.$.text || outline.$.title || 'Uncategorized';

        // Check if category already exists
        let category = await Category.findOne({
          where: { userId: userId, name: categoryName }
        });

        // Create category if it doesn't exist
        if (!category) {
          category = await Category.create({
            userId: userId,
            name: categoryName,
            categoryOrder: categoryOrder++
          });
          categoriesCreated++;
        }

        // Process feeds within this category
        if (outline.outline) {
          let feeds = outline.outline;
          // Ensure feeds is always an array
          if (!Array.isArray(feeds)) {
            feeds = [feeds];
          }

          for (const feedOutline of feeds) {
            try {
              const feedAttrs = feedOutline.$;
              const xmlUrl = feedAttrs.xmlUrl;

              // Skip if no xmlUrl (required for RSS feeds)
              if (!xmlUrl) {
                continue;
              }

              // Check if feed already exists for this user
              const existingFeed = await Feed.findOne({
                where: { userId: userId, url: xmlUrl }
              });

              if (!existingFeed) {
                await Feed.create({
                  userId: userId,
                  categoryId: category.id,
                  url: xmlUrl,
                  feedName: feedAttrs.text || feedAttrs.title || xmlUrl,
                  description: feedAttrs.description || null,
                  link: feedAttrs.htmlUrl || null,
                  favicon: null,
                  errorCount: 0
                });
                feedsCreated++;
              }
            } catch (feedError) {
              console.error('Error creating feed:', feedError);
              errors.push(`Failed to create feed: ${feedError.message}`);
            }
          }
        }
      } catch (categoryError) {
        console.error('Error processing category:', categoryError);
        errors.push(`Failed to process category: ${categoryError.message}`);
      }
    }

    return res.status(200).json({
      message: 'OPML import completed',
      categoriesCreated,
      feedsCreated,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Error importing OPML:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  exportOpml,
  importOpml
};
