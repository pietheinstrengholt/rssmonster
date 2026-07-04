import db from '../../models/index.js';

const { Tag } = db;

const TAG_TYPE_PRIORITY = {
  generated: 1,
  feed: 2,
  rule: 3
};

// This function normalizes tag names before storage or comparison.
export const normalizeTagName = tag => String(tag || '').trim().toLowerCase();

// This function normalizes a list of tags and removes duplicate names.
export const normalizeTagList = tags => {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set();

  return tags
    .map(normalizeTagName)
    .filter(tag => {
      if (!tag || seen.has(tag)) {
        return false;
      }

      seen.add(tag);
      return true;
    });
};

// This function converts article tag sources into one de-duplicated row list.
export const buildArticleTags = ({ generatedTags = [], feedTags = [], ruleTags = [] } = {}) => {
  const byName = new Map();

  [
    { tagType: 'generated', tags: generatedTags },
    { tagType: 'feed', tags: feedTags },
    { tagType: 'rule', tags: ruleTags }
  ].forEach(({ tagType, tags }) => {
    normalizeTagList(tags).forEach(name => {
      const existing = byName.get(name);
      if (!existing || TAG_TYPE_PRIORITY[tagType] > TAG_TYPE_PRIORITY[existing.tagType]) {
        byName.set(name, { name, tagType });
      }
    });
  });

  return [...byName.values()];
};

// This function persists article tags using normalized, de-duplicated names.
export const saveArticleTags = async ({ articleId, userId, generatedTags, feedTags, ruleTags }) => {
  const tags = buildArticleTags({ generatedTags, feedTags, ruleTags });

  if (tags.length === 0) {
    return;
  }

  await Promise.all(
    tags.map(tag =>
      Tag.create({
        articleId,
        userId,
        name: tag.name,
        tagType: tag.tagType
      }).catch(err =>
        console.error(`Error saving ${tag.tagType} tag "${tag.name}":`, err.message)
      )
    )
  );
};
