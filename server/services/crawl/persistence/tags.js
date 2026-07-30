import db from '../../../models/index.js';
import { Op } from 'sequelize';

// Provides the shared dependencies used by this service.
const { Tag } = db;

// Defines the tag type priority enforced by this service.
const TAG_TYPE_PRIORITY = {
  generated: 1,
  feed: 2,
  rule: 3
};
// Defines the crawl tag types enforced by this service.
const CRAWL_TAG_TYPES = Object.keys(TAG_TYPE_PRIORITY);

// This function normalizes tag names before storage or comparison.
export const normalizeTagName = tag => String(tag || '').trim().toLowerCase();

// This function normalizes a list of tags and removes duplicate names.
export const normalizeTagList = tags => {
  // Returns an empty result when tags is not an array.
  if (!Array.isArray(tags)) {
    return [];
  }

  // Tracks distinct seen while normalizing tag list.
  const seen = new Set();

  // Filters source values to the entries eligible while normalizing tag list.
  return tags
    .map(normalizeTagName)
    .filter(tag => {
      // Rejects the value when tag is unavailable or seen contains tag.
      if (!tag || seen.has(tag)) {
        return false;
      }

      seen.add(tag);
      return true;
    });
};

// This function converts article tag sources into one de-duplicated row list.
export const buildArticleTags = ({ generatedTags = [], feedTags = [], ruleTags = [] } = {}) => {
  // Derives the by name required while building article tags.
  const byName = new Map();

  // Runs the callback required while building article tags.
  [
    { tagType: 'generated', tags: generatedTags },
    { tagType: 'feed', tags: feedTags },
    { tagType: 'rule', tags: ruleTags }
  ].forEach(({ tagType, tags }) => {
    // Runs the callback required while building article tags.
    normalizeTagList(tags).forEach(name => {
      // Derives the existing through get while building article tags.
      const existing = byName.get(name);
      // Handles the case where existing is unavailable or tag type priority tag type exceeds tag type priority tag type.
      if (!existing || TAG_TYPE_PRIORITY[tagType] > TAG_TYPE_PRIORITY[existing.tagType]) {
        byName.set(name, { name, tagType });
      }
    });
  });

  return [...byName.values()];
};

// This function persists article tags using normalized, de-duplicated names.
export const saveArticleTags = async ({
  articleId,
  userId,
  generatedTags,
  feedTags,
  ruleTags,
  transaction = null
}) => {
  // Builds the article tags while performing save article tags.
  const tags = buildArticleTags({ generatedTags, feedTags, ruleTags });

  // Returns early when tags count is value.
  if (tags.length === 0) {
    return;
  }

  // Maps source values into the result produced while performing save article tags.
  await Promise.all(
    tags.map(tag =>
      Tag.create({
        articleId,
        userId,
        name: tag.name,
        tagType: tag.tagType
      }, { transaction })
    )
  );
};

// This function reads a tag field from a Sequelize row or plain test object.
const tagValue = (tag, field) => typeof tag?.getDataValue === 'function'
  ? tag.getDataValue(field)
  : tag?.[field];

// This function replaces crawl-owned tags while preserving manual and unknown tag provenance.
export const replaceArticleDerivedTags = async ({
  articleId,
  userId,
  generatedTags,
  feedTags,
  ruleTags,
  transaction
}) => {
  // Loads the existing tags needed while performing replace article derived tags.
  const existingTags = await Tag.findAll({
    where: { articleId, userId },
    transaction
  });
  // Derives the existing by type through from entries while performing replace article derived tags.
  const existingByType = Object.fromEntries(
    CRAWL_TAG_TYPES.map(tagType => [
      tagType,
      existingTags
        .filter(tag => tagValue(tag, 'tagType') === tagType)
        .map(tag => tagValue(tag, 'name'))
    ])
  );
  // Tracks distinct manual names while performing replace article derived tags.
  const manualNames = new Set(
    existingTags
      .filter(tag => !CRAWL_TAG_TYPES.includes(tagValue(tag, 'tagType')))
      .map(tag => normalizeTagName(tagValue(tag, 'name')))
      .filter(Boolean)
  );
  // Selects the desired tags based on whether generated tags is undefined.
  const desiredTags = buildArticleTags({
    generatedTags: generatedTags === undefined
      ? existingByType.generated
      : generatedTags,
    feedTags: feedTags === undefined
      ? existingByType.feed
      : feedTags,
    ruleTags: ruleTags === undefined
      ? existingByType.rule
      : ruleTags
  }).filter(tag => !manualNames.has(tag.name));

  await Tag.destroy({
    where: {
      articleId,
      userId,
      tagType: { [Op.in]: CRAWL_TAG_TYPES }
    },
    transaction
  });

  // Maps source values into the result produced while performing replace article derived tags.
  await Promise.all(desiredTags.map(tag => Tag.create({
    articleId,
    userId,
    name: tag.name,
    tagType: tag.tagType
  }, { transaction })));
};
