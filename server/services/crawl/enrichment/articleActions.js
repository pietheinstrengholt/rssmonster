import db from '../../../models/index.js';

const { Action } = db;

// This function loads actions only when the caller did not preload them.
export const resolveArticleActions = async (feed, preloadedActions) => preloadedActions ??
  Action.findAll({ where: { userId: feed.userId } });
