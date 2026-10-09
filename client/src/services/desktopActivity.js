export const desktopActivityLabel = activity => {
  if (!activity) return 'Checking background activity…';
  if (activity.status === 'refreshing') return activity.processingArticles ? 'Refreshing feeds · Processing articles' : 'Refreshing feeds…';
  if (activity.status === 'processing') return 'Processing articles…';
  if (activity.status === 'error') return activity.schedulerError ? 'Background refresh needs attention' : 'Some feeds could not be refreshed';
  if (activity.status === 'starting') return 'Starting local services…';
  if (activity.status === 'disabled') return 'Automatic refresh disabled';
  return activity.lastRefreshAt ? `Feeds updated at ${new Date(activity.lastRefreshAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for eligible feeds';
};
export const desktopActivityDetails = activity => activity ? [
  activity.schedulerError,
  `Last refresh: ${activity.lastRefreshAt ? new Date(activity.lastRefreshAt).toLocaleString() : 'Not available'}`,
  `Next check: ${activity.nextRefreshAt ? new Date(activity.nextRefreshAt).toLocaleString() : 'Not scheduled'}`,
  ...(activity.newArticles === null ? [] : [`New articles: ${activity.newArticles}`]),
  ...(activity.failedFeeds > 0 ? [`Failed feeds: ${activity.failedFeeds}`] : [])
].filter(Boolean).join('\n') : '';
