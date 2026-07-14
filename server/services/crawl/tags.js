import db from '../../models/index.js';
import { Op } from 'sequelize';

const { Tag } = db;

const TAG_TYPE_PRIORITY = {
  generated: 1,
  feed: 2,
  rule: 3
};
const CRAWL_TAG_TYPES = Object.keys(TAG_TYPE_PRIORITY);

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
export const saveArticleTags = async ({
  articleId,
  userId,
  generatedTags,
  feedTags,
  ruleTags,
  transaction = null
}) => {
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
  const existingTags = await Tag.findAll({
    where: { articleId, userId },
    transaction
  });
  const existingByType = Object.fromEntries(
    CRAWL_TAG_TYPES.map(tagType => [
      tagType,
      existingTags
        .filter(tag => tagValue(tag, 'tagType') === tagType)
        .map(tag => tagValue(tag, 'name'))
    ])
  );
  const manualNames = new Set(
    existingTags
      .filter(tag => !CRAWL_TAG_TYPES.includes(tagValue(tag, 'tagType')))
      .map(tag => normalizeTagName(tagValue(tag, 'name')))
      .filter(Boolean)
  );
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

  await Promise.all(desiredTags.map(tag => Tag.create({
    articleId,
    userId,
    name: tag.name,
    tagType: tag.tagType
  }, { transaction })));
};
