// This function freezes option records so shared presentation metadata stays declarative.
function createOptions(options) {
  return Object.freeze(options.map(option => Object.freeze(option)));
}

export const ARTICLE_STATUS_OPTIONS = createOptions([
  {
    value: 'briefing',
    label: 'Daily briefing',
    icon: 'sunrise-fill',
    iconClass: 'icon-briefing',
    countKey: 'briefingCount',
    requiresAI: true
  },
  { value: 'unread', label: 'Unread', icon: 'record-circle-fill', iconClass: 'icon-unread', countKey: 'unreadCount' },
  { value: 'favorite', label: 'Favorite', sidebarLabel: 'Favorites', icon: 'bookmark-fill', iconClass: 'icon-star', countKey: 'favoriteCount' },
  { value: 'hot', label: 'Hot', icon: 'fire', iconClass: 'icon-hot', countKey: 'hotCount' },
  { value: 'clicked', label: 'Clicked', icon: 'arrow-up-right-square-fill', iconClass: 'icon-clicked', countKey: 'clickedCount' },
  { value: 'read', label: 'Read', icon: 'circle-fill', iconClass: 'icon-read', countKey: 'readCount' }
]);

export const ARTICLE_VIEW_MODE_OPTIONS = createOptions([
  { value: 'reader', label: 'Reader', desktopOnly: true },
  { value: 'full', label: 'Expanded', mobileDescription: 'Show the full article content' },
  { value: 'summarized', label: 'Summarized', mobileLabel: 'Summarized content', mobileDescription: 'Show the AI generated summary' },
  { value: 'summaryBullets', label: 'Summary Bullets', mobileLabel: 'Summary bullets', mobileDescription: 'Show short summaries as bullet points', requiresAI: true },
  { value: 'minimal', label: 'Headlines', mobileDescription: 'Show only the article titles' }
]);

export const ARTICLE_SORT_OPTIONS = createOptions([
  { value: 'asc', label: 'Oldest' },
  { value: 'desc', label: 'Newest' },
  { value: 'trust', label: 'Trust' },
  { value: 'recommended', label: 'Recommended', requiresAI: true },
  { value: 'quality', label: 'Quality', requiresAI: true },
  { value: 'attention', label: 'Most Engaged', requiresAI: true }
]);

export const ARTICLE_GROUPING_OPTIONS = createOptions([
  { value: 'none', label: 'None', mobileLabel: 'All articles' },
  { value: 'event', label: 'Events', mobileLabel: 'Cluster per event' },
  { value: 'topic', label: 'Topics', mobileLabel: 'Cluster per topic' }
]);

// This lookup keeps status consumers aligned on one metadata record per value.
const STATUS_OPTIONS_BY_VALUE = new Map(ARTICLE_STATUS_OPTIONS.map(option => [option.value, option]));

export const SIDEBAR_STATUS_OPTIONS = Object.freeze([
  STATUS_OPTIONS_BY_VALUE.get('briefing'),
  STATUS_OPTIONS_BY_VALUE.get('unread'),
  STATUS_OPTIONS_BY_VALUE.get('read'),
  STATUS_OPTIONS_BY_VALUE.get('favorite'),
  STATUS_OPTIONS_BY_VALUE.get('hot'),
  STATUS_OPTIONS_BY_VALUE.get('clicked')
]);

// This function returns one status definition for count and label lookups.
export function getArticleStatusOption(value) {
  return STATUS_OPTIONS_BY_VALUE.get(value);
}

// This function filters shared options according to active product capabilities.
export function getAvailableArticleOptions(options, { aiEnabled, mobile = false }) {
  return options.filter(option =>
    (aiEnabled || !option.requiresAI) &&
    (!mobile || !option.desktopOnly)
  );
}
