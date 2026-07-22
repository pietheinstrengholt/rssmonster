import db from '../models/index.js';

const { BriefingPreference, Setting } = db;
const SELECTION_PERIODS = new Set(['24h', '7d']);

// This function returns only the public Daily Briefing preference fields.
const serializePreferences = preference => ({
  includeOnlyUnreadArticles: Boolean(preference.includeOnlyUnreadArticles),
  includeDevelopingEvents: Boolean(preference.includeDevelopingEvents),
  showOnlyInterestMatchedArticles: Boolean(preference.showOnlyInterestMatchedArticles),
  showOnlyDevelopingEventArticles: Boolean(preference.showOnlyDevelopingEventArticles),
  minDistinctSources: Number(preference.minDistinctSources),
  prioritizeHighTrust: Boolean(preference.prioritizeHighTrust),
  selectionPeriod: preference.selectionPeriod
});

// This function validates a complete Briefing Preferences replacement payload.
const validatePreferencesPayload = preferences => {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return 'preferences must be an object';
  }

  const booleanFields = [
    'includeOnlyUnreadArticles',
    'includeDevelopingEvents',
    'showOnlyInterestMatchedArticles',
    'showOnlyDevelopingEventArticles',
    'prioritizeHighTrust'
  ];

  if (booleanFields.some(field => typeof preferences[field] !== 'boolean')) {
    return 'Briefing preference flags must be boolean values';
  }

  if (preferences.showOnlyInterestMatchedArticles
    && preferences.showOnlyDevelopingEventArticles) {
    return 'Only one article-type filter can be enabled';
  }

  if (!Number.isInteger(preferences.minDistinctSources)
    || preferences.minDistinctSources < 1
    || preferences.minDistinctSources > 127) {
    return 'minDistinctSources must be an integer between 1 and 127';
  }

  if (!SELECTION_PERIODS.has(preferences.selectionPeriod)) {
    return 'selectionPeriod must be 24h or 7d';
  }

  return null;
};

// This function returns the authenticated user's effective preferences.
export const getBriefingPreferences = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const storedPreferences = await BriefingPreference.findOne({ where: { userId }, raw: true });

    const effectivePreferences = storedPreferences
      || BriefingPreference.build({ userId }).get({ plain: true });

    return res.status(200).json({
      preferences: serializePreferences(effectivePreferences)
    });
  } catch (err) {
    console.error('Error in getBriefingPreferences:', err);
    return res.status(500).json({ error: 'Unable to load Briefing Preferences' });
  }
};

// This function replaces the authenticated user's Daily Briefing preferences.
export const updateBriefingPreferences = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const preferences = req.body?.preferences;
    const validationError = validatePreferencesPayload(preferences);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const storedPreferences = {
      userId,
      includeOnlyUnreadArticles: preferences.includeOnlyUnreadArticles,
      includeDevelopingEvents: preferences.includeDevelopingEvents,
      showOnlyInterestMatchedArticles: preferences.showOnlyInterestMatchedArticles,
      showOnlyDevelopingEventArticles: preferences.showOnlyDevelopingEventArticles,
      minDistinctSources: preferences.minDistinctSources,
      prioritizeHighTrust: preferences.prioritizeHighTrust,
      selectionPeriod: preferences.selectionPeriod
    };

    await db.sequelize.transaction(async transaction => {
      await BriefingPreference.upsert(storedPreferences, { transaction });

      const [settings, created] = await Setting.findOrCreate({
        where: { userId },
        defaults: {
          includeDevelopingEvents: preferences.includeDevelopingEvents
        },
        transaction
      });

      if (!created) {
        await settings.update({
          includeDevelopingEvents: preferences.includeDevelopingEvents
        }, { transaction });
      }
    });

    return res.status(200).json({
      preferences: serializePreferences(storedPreferences)
    });
  } catch (err) {
    console.error('Error in updateBriefingPreferences:', err);
    return res.status(500).json({ error: 'Unable to save Briefing Preferences' });
  }
};

export default {
  getBriefingPreferences,
  updateBriefingPreferences
};
