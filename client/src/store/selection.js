import { defineStore } from 'pinia';
import { fetchSettings as fetchSettingsAPI } from '../api/settings';
import { useOverviewStore } from './overview.js';
import { normalizeResourceError } from './resourceState.js';
import { useUiStore } from './ui.js';

const DEFAULT_BRIEFING_SELECTION_PERIOD = '7d';
// This selection subset defines the canonical unfiltered article collection.
const DEFAULT_ARTICLE_FILTERS = Object.freeze({
  status: 'unread',
  categoryId: '%',
  feedId: '%',
  search: null,
  tag: null,
  smartFolderId: null,
  minAdvertisementScore: 0,
  minSentimentScore: 0,
  minQualityScore: 0,
  sort: 'desc',
  grouping: 'none'
});
const SUPPORTED_SELECTION_FIELDS = [
  'AIEnabled',
  'status',
  'categoryId',
  'feedId',
  'search',
  'tag',
  'smartFolderId',
  'minAdvertisementScore',
  'minSentimentScore',
  'minQualityScore',
  'sort',
  'viewMode',
  'grouping',
  'includeDevelopingEvents',
  'markAsReadOnScroll',
  'briefingRevision'
];

// This function maps a stored Briefing period to the existing article date filters.
const briefingDateFilter = selectionPeriod => (
  selectionPeriod === '24h' ? '@today' : '@lastweek'
);

// This function builds the existing article-search query for configured Briefing filters.
const briefingSearchQuery = ({
  selectionPeriod,
  includeOnlyUnreadArticles
}) => [
  'briefing:true',
  includeOnlyUnreadArticles ? 'unread:true' : null,
  briefingDateFilter(selectionPeriod),
  'sort:recommended'
].filter(Boolean).join(' ');

// This function creates the default article selection contract.
const defaultSelection = () => ({
  AIEnabled: false,
  ...DEFAULT_ARTICLE_FILTERS,
  viewMode: 'full',
  includeDevelopingEvents: false,
  markAsReadOnScroll: true,
  briefingRevision: 0
});

// This function restricts persisted sort values to supported article orderings.
const normalizeSort = value => {
  const normalized = String(value ?? 'desc').toLowerCase();
  return ['asc', 'desc', 'trust', 'recommended', 'quality', 'attention'].includes(normalized)
    ? normalized
    : 'desc';
};

// This function removes sort tokens when the explicit sort selection takes ownership.
const removeSortTokens = query => {
  if (!query || !/(^|[\s,])sort:/i.test(query)) return query;

  const cleaned = String(query)
    .split(/([\s,]+)/)
    .filter(part => !/^sort:(desc|asc|trust|recommended|quality|attention)[.,;]*$/i.test(part.trim()))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || null;
};

// This function returns the final developing filter value represented by a query.
const developingFilterFromQuery = query => {
  const matches = Array.from(
    String(query ?? '').matchAll(/(?:^|[\s,])developing:(true|false)(?=$|[\s,.;])/gi)
  );
  if (matches.length === 0) return null;
  return matches.at(-1)[1].toLowerCase() === 'true';
};

// This function forces the presentation required to select an event's developing article.
const developingSelection = query => (
  developingFilterFromQuery(query) === true
    ? { grouping: 'event', includeDevelopingEvents: true }
    : {}
);

// This function restricts grouping to the supported event and topic modes.
const normalizeGrouping = value => {
  const normalized = String(value ?? 'none');
  if (normalized === 'event') return 'event';
  if (normalized === 'topic') return 'topic';
  return 'none';
};

// This function retains only fields that participate in supported selection behavior.
const supportedSelection = selection => Object.fromEntries(
  SUPPORTED_SELECTION_FIELDS
    .filter(field => Object.prototype.hasOwnProperty.call(selection, field))
    .map(field => [field, selection[field]])
);

// This function creates selection and settings-resource state for one user session.
const initialSelectionState = () => ({
  currentSelection: defaultSelection(),
  briefingSelectionPeriod: DEFAULT_BRIEFING_SELECTION_PERIOD,
  briefingIncludeOnlyUnreadArticles: false,
  briefingMarkAsReadOnScroll: false,
  briefingPrioritizeHighTrust: false,
  briefingShowOnlyDevelopingEventArticles: false,
  settingsStatus: 'idle',
  settingsError: null,
  settingsRequestId: 0
});

export const useSelectionStore = defineStore('selection', {
  // This state owns article selection, display filters, and Briefing preferences.
  state: initialSelectionState,

  getters: {
    // This getter selects the scrolling behavior owned by the active article collection.
    effectiveMarkAsReadOnScroll: state => (
      state.currentSelection.status === 'briefing'
        ? state.briefingMarkAsReadOnScroll
        : state.currentSelection.markAsReadOnScroll
    )
  },

  actions: {
    // This action clears collection filters while preserving presentation and capability settings.
    resetArticleFilters() {
      this.setCurrentSelection(DEFAULT_ARTICLE_FILTERS);
    },

    // This action makes every settings request from the previous session obsolete.
    invalidateSessionRequests() {
      this.settingsRequestId++;
    },

    // This action clears user selection and resource state while retaining its invalidation generation.
    resetSessionState() {
      const settingsRequestId = this.settingsRequestId;
      this.$patch({
        ...initialSelectionState(),
        settingsRequestId
      });
    },

    // This action applies persisted selection settings and delegates theme ownership to the UI store.
    async fetchSettings() {
      const requestId = ++this.settingsRequestId;
      this.settingsStatus = 'loading';
      this.settingsError = null;

      try {
        const { data } = await fetchSettingsAPI();
        if (requestId !== this.settingsRequestId) return false;

        useUiStore().setThemeMode(data.themeMode);
        this.setCurrentSelection(data);
        this.settingsStatus = 'success';
        return true;
      } catch (error) {
        if (requestId === this.settingsRequestId) {
          this.settingsStatus = 'error';
          this.settingsError = normalizeResourceError(error);
        }
        throw error;
      }
    },

    // This action normalizes a partial selection while preserving unspecified values.
    setCurrentSelection(selection = {}) {
      useUiStore().setChatAssistantOpen(false);

      const previous = this.currentSelection;
      const previousGrouping = previous.grouping;
      const previousStatus = previous.status;
      const supported = supportedSelection(selection);
      const includeDevelopingEvents = supported.includeDevelopingEvents != null
        ? Boolean(supported.includeDevelopingEvents)
        : Boolean(previous.includeDevelopingEvents);
      const markAsReadOnScroll = supported.markAsReadOnScroll != null
        ? Boolean(supported.markAsReadOnScroll)
        : Boolean(previous.markAsReadOnScroll);
      this.currentSelection = {
        ...previous,
        ...supported,
        sort: supported.sort != null
          ? normalizeSort(supported.sort)
          : normalizeSort(previous.sort),
        grouping: supported.grouping != null
          ? normalizeGrouping(supported.grouping)
          : normalizeGrouping(previous.grouping),
        includeDevelopingEvents,
        markAsReadOnScroll
      };
      if (
        this.currentSelection.grouping !== previousGrouping ||
        this.currentSelection.status !== previousStatus
      ) {
        void useOverviewStore().fetchTopTags();
      }
    },

    // This action applies selection and related UI changes as one coherent transition.
    applySelection(selection, { closeChat = true } = {}) {
      const previousStatus = this.currentSelection.status;
      this.$patch({
        currentSelection: {
          ...this.currentSelection,
          ...selection
        }
      });
      if (closeChat) useUiStore().setChatAssistantOpen(false);
      if (this.currentSelection.status !== previousStatus) {
        void useOverviewStore().fetchTopTags();
      }
    },

    // This action selects an article status and constructs an active Briefing query when required.
    setSelectedStatus(status) {
      this.applySelection({
        status,
        search: status === 'briefing'
          ? briefingSearchQuery({
            selectionPeriod: this.briefingSelectionPeriod,
            includeOnlyUnreadArticles: this.briefingIncludeOnlyUnreadArticles
          })
          : null,
        smartFolderId: null,
        ...(status === 'briefing' ? { sort: 'recommended', grouping: 'event' } : {}),
        ...(status === 'briefing' && this.briefingShowOnlyDevelopingEventArticles
          ? { includeDevelopingEvents: true }
          : {})
      });
    },

    // This action applies configured Briefing filters to future and active selections.
    setBriefingFilters({
      selectionPeriod,
      includeOnlyUnreadArticles,
      markAsReadOnScroll,
      prioritizeHighTrust,
      showOnlyDevelopingEventArticles
    }) {
      const previousSelectionPeriod = this.briefingSelectionPeriod;
      const previousIncludeOnlyUnreadArticles = this.briefingIncludeOnlyUnreadArticles;
      const previousShowOnlyDevelopingEventArticles =
        this.briefingShowOnlyDevelopingEventArticles;
      const normalizedPeriod = selectionPeriod === '24h'
        ? '24h'
        : DEFAULT_BRIEFING_SELECTION_PERIOD;
      this.briefingSelectionPeriod = normalizedPeriod;
      this.briefingIncludeOnlyUnreadArticles = Boolean(includeOnlyUnreadArticles);
      this.briefingMarkAsReadOnScroll = this.briefingIncludeOnlyUnreadArticles
        && Boolean(markAsReadOnScroll);
      this.briefingPrioritizeHighTrust = Boolean(prioritizeHighTrust);
      this.briefingShowOnlyDevelopingEventArticles = Boolean(
        showOnlyDevelopingEventArticles
      );

      if (this.currentSelection.status !== 'briefing') return;

      const search = briefingSearchQuery({
        selectionPeriod: normalizedPeriod,
        includeOnlyUnreadArticles: this.briefingIncludeOnlyUnreadArticles
      });
      if (this.currentSelection.search !== search) {
        this.currentSelection.search = search;
      }
      const groupingChanged = this.currentSelection.grouping !== 'event';
      this.currentSelection.sort = 'recommended';
      this.currentSelection.grouping = 'event';
      if (this.briefingShowOnlyDevelopingEventArticles) {
        this.currentSelection.includeDevelopingEvents = true;
      }
      if (
        normalizedPeriod !== previousSelectionPeriod ||
        this.briefingIncludeOnlyUnreadArticles !== previousIncludeOnlyUnreadArticles ||
        this.briefingShowOnlyDevelopingEventArticles
          !== previousShowOnlyDevelopingEventArticles ||
        groupingChanged
      ) {
        void useOverviewStore().fetchTopTags();
      }
    },

    // This action applies only a Briefing period while preserving the other preferences.
    setBriefingSelectionPeriod(selectionPeriod) {
      this.setBriefingFilters({
        selectionPeriod,
        includeOnlyUnreadArticles: this.briefingIncludeOnlyUnreadArticles,
        markAsReadOnScroll: this.briefingMarkAsReadOnScroll,
        prioritizeHighTrust: this.briefingPrioritizeHighTrust,
        showOnlyDevelopingEventArticles:
          this.briefingShowOnlyDevelopingEventArticles
      });
    },

    // This action invalidates the active Briefing list after non-query preferences change.
    refreshBriefingSelection() {
      if (this.currentSelection.status !== 'briefing') return;
      this.currentSelection.briefingRevision = Number(
        this.currentSelection.briefingRevision || 0
      ) + 1;
      void useOverviewStore().fetchTopTags();
    },

    // This action delegates a forced count refresh to the overview owner.
    async refreshOverviewCounts() {
      await useOverviewStore().refreshOverviewCounts();
    },

    // This action selects a category and removes competing feed and query filters.
    selectCategory(categoryId) {
      this.applySelection({
        categoryId: String(categoryId),
        feedId: '%',
        tag: null,
        search: null,
        smartFolderId: null
      });
    },

    // This compatibility action delegates category selection to the atomic contract.
    setSelectedCategoryId(categoryId) {
      this.selectCategory(categoryId);
    },

    // This action selects a feed and optional parent category in one transition.
    selectFeed(feedId, categoryId = this.currentSelection.categoryId) {
      this.applySelection({
        categoryId: String(categoryId),
        feedId: String(feedId),
        tag: null,
        search: null,
        smartFolderId: null
      });
    },

    // This compatibility action preserves the selected category while selecting a feed.
    setSelectedFeedId(feedId) {
      this.selectFeed(feedId);
    },

    // This action selects a free-form search and clears the competing tag filter.
    setSelectedSearch(search) {
      this.applySelection({
        search,
        tag: null,
        ...developingSelection(search)
      });
    },

    // This action normalizes explicit sorting and removes embedded query sorting.
    setSelectedSort(sort) {
      this.applySelection({
        sort: normalizeSort(sort),
        search: removeSortTokens(this.currentSelection.search)
      });
    },

    // This action selects a tag and clears competing navigation filters.
    setTag(tag) {
      this.applySelection({
        tag,
        categoryId: '%',
        feedId: '%',
        search: null,
        smartFolderId: null
      });
    },

    // This action converts a smart folder into the existing article selection contract.
    setSmartFolder(smartFolder) {
      const search = smartFolder
        ? smartFolder.query +
          (smartFolder.limitCount ? ` limit:${smartFolder.limitCount}` : '')
        : null;

      this.applySelection({
        categoryId: '%',
        feedId: '%',
        status: 'unread',
        sort: 'desc',
        tag: null,
        smartFolderId: smartFolder?.id ?? null,
        search,
        ...developingSelection(search)
      });
    },

    // This action updates the advertisement score threshold.
    setMinAdvertisementScore(value) {
      this.currentSelection.minAdvertisementScore = value;
    },

    // This action updates the sentiment score threshold.
    setMinSentimentScore(value) {
      this.currentSelection.minSentimentScore = value;
    },

    // This action updates the quality score threshold.
    setMinQualityScore(value) {
      this.currentSelection.minQualityScore = value;
    },

    // This action updates the article list presentation mode.
    setViewMode(value) {
      this.applySelection({ viewMode: value });
    },

    // This action normalizes grouping and refreshes its dependent overview and tag resources.
    setGrouping(value) {
      const grouping = normalizeGrouping(value);
      const groupingChanged = grouping !== this.currentSelection.grouping;
      this.currentSelection.grouping = grouping;
      const overviewStore = useOverviewStore();
      if (groupingChanged) {
        void overviewStore.fetchTopTags();
      }
      overviewStore.fetchOverviewSplit({ forceUpdate: true }).catch(err => {
        if (import.meta.env.DEV) {
          console.warn('Grouping refresh failed', err);
        }
      });
    }
  }
});
