import { z } from 'zod';
import db from '../models/index.js';

const fields = {
  neverDeleteUnread: 'neverDeleteUnreadArticles',
  neverDeleteFavorites: 'neverDeleteFavorites',
  neverDeleteClicked: 'neverDeleteClickedArticles',
  maximumAgeValue: 'maximumArticleAge',
  maximumAgeUnit: 'maximumArticleAgeUnit',
  maximumArticlesPerFeed: 'maximumArticlesPerFeed',
  maximumArticlesTotal: 'maximumArticlesTotal'
};

export const archivingSettingsSchema = z.strictObject({
  neverDeleteUnread: z.boolean(),
  neverDeleteFavorites: z.boolean(),
  neverDeleteClicked: z.boolean(),
  maximumAgeValue: z.number().int().min(1).max(2147483647),
  maximumAgeUnit: z.enum(['days', 'weeks', 'months', 'years']),
  maximumArticlesPerFeed: z.number().int().min(1).max(1000000).nullable(),
  maximumArticlesTotal: z.number().int().min(1).max(1000000000).nullable()
});

// Calendar months/years clamp to the last day of the target month in UTC.
export function articleRetentionCutoff(value, unit, now = new Date()) {
  const cutoff = new Date(now);
  if (unit === 'days' || unit === 'weeks') {
    cutoff.setUTCDate(cutoff.getUTCDate() - value * (unit === 'weeks' ? 7 : 1));
  } else {
    const day = cutoff.getUTCDate();
    cutoff.setUTCDate(1);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - value * (unit === 'years' ? 12 : 1));
    const lastDay = new Date(cutoff);
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    cutoff.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  }
  // Retention beyond the database date range cannot have eligible articles.
  return Number.isFinite(cutoff.getTime()) && cutoff.getUTCFullYear() >= 1000 ? cutoff : null;
}

const serialize = settings => Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, settings[column]]));

export async function getArchivingSettings(userId, transaction) {
  const settings = await db.ArchivingSetting.findOne({ where: { userId }, transaction });
  return serialize(settings || db.ArchivingSetting.build({ userId }));
}

export async function saveArchivingSettings(userId, input) {
  const values = Object.fromEntries(Object.entries(fields).map(([key, column]) => [column, input[key]]));
  return db.sequelize.transaction(async transaction => {
    // Serialize saves and cleanup for this user, including the first settings insert.
    await db.User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    const settings = await db.ArchivingSetting.findOne({ where: { userId }, transaction });
    const saved = settings
      ? await settings.update(values, { transaction })
      : await db.ArchivingSetting.create({ userId, ...values }, { transaction });
    return serialize(saved);
  });
}
