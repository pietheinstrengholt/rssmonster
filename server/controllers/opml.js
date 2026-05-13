import db from '../models/index.js';
const { Feed, Category } = db;
import { parseStringPromise } from 'xml2js';

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const outlineAttrs = (outline) => outline?.$ || {};

const resolveCategoryName = (attrs, fallback = 'Uncategorized') =>
  String(attrs?.text || attrs?.title || fallback).trim() || fallback;

const collectOpmlFeedEntries = (outline, categoryName = 'Uncategorized', acc = []) => {
  const attrs = outlineAttrs(outline);
  const xmlUrl = String(attrs?.xmlUrl || '').trim();
  const children = toArray(outline?.outline);

  if (xmlUrl) {
    acc.push({
      categoryName,
      attrs: {
        ...attrs,
        xmlUrl
      }
    });
  }

  // Folder/category nodes may be nested; recurse with the nearest category label.
  if (children.length > 0) {
    const nextCategoryName = xmlUrl ? categoryName : resolveCategoryName(attrs, categoryName);
    for (const child of children) {
      collectOpmlFeedEntries(child, nextCategoryName, acc);
    }
  }

  return acc;
};

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

export const importOpml = async (req, res, _next) => {
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

    const outlines = toArray(result.opml.body.outline);
    const feedEntries = outlines.flatMap(outline => collectOpmlFeedEntries(outline, 'Uncategorized', []));

    if (!feedEntries.length) {
      return res.status(400).json({ error: 'No feed entries (xmlUrl) found in OPML file' });
    }

    let categoriesCreated = 0;
    let feedsCreated = 0;
    let feedsSkipped = 0;
    const errors = [];

    // Get the maximum categoryOrder to append new categories at the end
    const maxOrderCategory = await Category.findOne({
      where: { userId: userId },
      order: [['categoryOrder', 'DESC']],
      attributes: ['categoryOrder']
    });
    let categoryOrder = maxOrderCategory ? maxOrderCategory.categoryOrder + 1 : 1;

    const existingCategories = await Category.findAll({
      where: { userId: userId },
      attributes: ['id', 'name']
    });
    const categoryByName = new Map(
      existingCategories.map(category => [category.name, category])
    );

    const existingFeeds = await Feed.findAll({
      where: { userId: userId },
      attributes: ['url']
    });
    const existingFeedUrls = new Set(existingFeeds.map(feed => String(feed.url || '').trim()).filter(Boolean));

    // Process each discovered feed entry regardless of nesting style.
    for (const entry of feedEntries) {
      try {
        const categoryName = resolveCategoryName({ text: entry.categoryName }, 'Uncategorized');

        // Check if category already exists
        let category = categoryByName.get(categoryName);

        // Create category if it doesn't exist
        if (!category) {
          category = await Category.create({
            userId: userId,
            name: categoryName,
            categoryOrder: categoryOrder++
          });
          categoriesCreated++;
          categoryByName.set(categoryName, category);
        }

        const feedAttrs = entry.attrs || {};
        const xmlUrl = String(feedAttrs.xmlUrl || '').trim();

        // Skip if no xmlUrl (required for RSS feeds)
        if (!xmlUrl) {
          feedsSkipped++;
          continue;
        }

        // Skip if feed already exists for this user.
        if (existingFeedUrls.has(xmlUrl)) {
          feedsSkipped++;
          continue;
        }

        await Feed.create({
          userId: userId,
          categoryId: category.id,
          url: xmlUrl,
          feedName: String(feedAttrs.text || feedAttrs.title || xmlUrl).trim(),
          feedDesc: feedAttrs.description || null,
          feedType: String(feedAttrs.type || 'rss').slice(0, 16),
          favicon: null,
          errorCount: 0
        });

        existingFeedUrls.add(xmlUrl);
        feedsCreated++;
      } catch (entryError) {
        console.error('Error importing OPML entry:', entryError);
        errors.push(`Failed to import feed entry: ${entryError.message}`);
      }
    }

    return res.status(200).json({
      message: 'OPML import completed',
      categoriesCreated,
      feedsCreated,
      feedsSkipped,
      entriesDiscovered: feedEntries.length,
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
