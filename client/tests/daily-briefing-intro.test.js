import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';

import ArticleListView from '../src/components/ArticleListView.vue';
import ArticleReaderLayout from '../src/components/ArticleReaderLayout.vue';
import DailyBriefingIntro from '../src/components/DailyBriefingIntro.vue';
import { fetchDailyBriefing } from '../src/api/articles';

vi.mock('../src/api/articles', () => ({
  fetchDailyBriefing: vi.fn(),
  fetchDuplicateArticles: vi.fn(),
  markAsFavorite: vi.fn(),
  markClicked: vi.fn(),
  markMoreLikeThis: vi.fn(),
  markNotInterested: vi.fn()
}));

const briefingResponse = {
  generatedAt: '2026-07-20T08:30:00.000Z',
  filters: {
    period: '7d',
    status: 'all',
    dateFrom: '2026-07-13T08:30:00.000Z'
  },
  context: {
    articleCount: 12,
    eventCount: 7,
    newEventCount: 4,
    topicCount: 38,
    islandCount: 6,
    sourceCount: 15
  },
  morningSummary: {
    items: [
      {
        eventId: 140,
        representativeArticleId: 92840,
        headline: 'EU AI Act enters into force',
        text: 'A phased compliance timeline sets new benchmarks for AI governance.',
        island: { id: 12, name: 'Artificial Intelligence' }
      },
      {
        eventId: 141,
        representativeArticleId: 92841,
        headline: 'European gas markets tighten',
        text: 'Norway maintenance cuts flows and lifts prices across the region.',
        island: { id: 13, name: 'Energy' }
      }
    ]
  }
};

// This function mounts the briefing intro with the existing selected query.
function mountDailyBriefingIntro(search = 'briefing:true @lastweek') {
  return mount(DailyBriefingIntro, {
    global: {
      mocks: {
        $store: {
          data: {
            currentSelection: { status: 'briefing', search }
          }
        }
      }
    }
  });
}

// This function mounts the standard article list with the requested selection.
function mountArticleList(currentSelection = 'briefing') {
  return shallowMount(ArticleListView, {
    props: {
      articles: [{ id: 1 }],
      pool: new Set(),
      container: [1],
      currentSelection,
      currentViewUnreadCount: 0,
      viewMode: 'full',
      remainingItems: 1,
      fetchCount: 20,
      hasLoadedContent: false,
      isFlushed: false,
      distance: 0
    },
    global: {
      mocks: {
        $store: {
          data: {
            mobileSearchOpen: false,
            unreadsSinceLastUpdate: 0,
            currentSelection: { status: currentSelection, viewMode: 'full' }
          }
        }
      }
    }
  });
}

// This function mounts the reader layout in a loading or loaded-empty state.
function mountReaderLayout(hasLoadedContent) {
  return shallowMount(ArticleReaderLayout, {
    props: {
      articles: [],
      container: [],
      currentSelection: 'briefing',
      currentViewUnreadCount: 0,
      currentViewSourceCount: 0,
      remainingItems: 0,
      fetchCount: 20,
      hasLoadedContent,
      isFlushed: false,
      distance: 0
    },
    global: {
      mocks: {
        $store: {
          data: {
            currentSelection: {
              status: 'briefing',
              smartFolderId: null,
              tag: null,
              search: 'briefing:true @lastweek',
              categoryId: '%',
              feedId: '%'
            },
            smartFolders: [],
            categories: [],
            unreadsSinceLastUpdate: 0
          }
        }
      }
    }
  });
}

describe('DailyBriefingIntro', () => {
  beforeEach(() => {
    fetchDailyBriefing.mockReset();
    fetchDailyBriefing.mockResolvedValue({ data: briefingResponse });
  });

  it('loads and renders API context and morning-summary items', async () => {
    const wrapper = mountDailyBriefingIntro();

    expect(wrapper.get('.briefing-context').text()).toContain('Loading briefing context');

    await flushPromises();

    expect(fetchDailyBriefing).toHaveBeenCalledWith({ period: '7d', status: 'all' });
    expect(wrapper.get('.briefing-context').text()).toContain('12 articles');
    expect(wrapper.get('.briefing-context').text()).toContain('15 sources');
    expect(wrapper.get('.briefing-context').text()).toContain('across 4 events, and 38 topics.');
    expect(wrapper.get('.briefing-context').text()).not.toContain('7 events');
    expect(wrapper.get('.briefing-context').text()).not.toContain('new events');
    expect(wrapper.get('.briefing-context').text()).not.toContain('interest areas');
    expect(wrapper.get('#briefing-morning-title').text()).toBe('The stories shaping your morning');
    expect(wrapper.findAll('.briefing-morning-summary-text p')).toHaveLength(2);
    expect(wrapper.get('.briefing-summary-headline').text()).toBe('EU AI Act enters into force');
    expect(wrapper.get('.briefing-summary-excerpt').text()).toContain('phased compliance timeline');
    expect(wrapper.get('.briefing-morning-summary-icon i').classes()).toContain('bi-sunrise-fill');
  });

  it('hides the morning-summary article text in reader mode', async () => {
    const wrapper = mountDailyBriefingIntro();
    await wrapper.setProps({ readerMode: true });
    await flushPromises();

    expect(wrapper.find('.briefing-morning-summary-text').exists()).toBe(false);
    expect(wrapper.get('#briefing-morning-title').text()).toBe('The stories shaping your morning');
  });

  it('submits the one-day period when the existing query selects today', async () => {
    mountDailyBriefingIntro('briefing:true @today');

    await flushPromises();

    expect(fetchDailyBriefing).toHaveBeenCalledWith({ period: '24h', status: 'all' });
  });

  it('submits the unread status when the briefing query enables unread filtering', async () => {
    mountDailyBriefingIntro('briefing:true unread:true @lastweek');

    await flushPromises();

    expect(fetchDailyBriefing).toHaveBeenCalledWith({ period: '7d', status: 'unread' });
  });

  it('opens Briefing Preferences from the context action', async () => {
    const setShowModal = vi.fn();
    const wrapper = mount(DailyBriefingIntro, {
      global: {
        mocks: {
          $store: {
            data: {
              currentSelection: { status: 'briefing', search: 'briefing:true @lastweek' },
              setShowModal
            }
          }
        }
      }
    });

    const action = wrapper.get('.briefing-tune-action');
    expect(action.element.tagName).toBe('BUTTON');
    expect(action.text()).toBe('Tune your briefing');
    expect(action.get('i').classes()).toContain('bi-sliders2');

    await action.trigger('click');

    expect(setShowModal).toHaveBeenCalledWith('BriefingPreferences');
  });

  it('appears once before the article list only for the briefing selection', async () => {
    const wrapper = mountArticleList();

    expect(wrapper.findAllComponents(DailyBriefingIntro)).toHaveLength(1);
    expect(wrapper.html().indexOf('daily-briefing-intro-stub')).toBeLessThan(
      wrapper.html().indexOf('article-stub')
    );

    await wrapper.setProps({ currentSelection: 'unread' });

    expect(wrapper.findComponent(DailyBriefingIntro).exists()).toBe(false);
  });

  it.each([false, true])('remains singular in the reader layout when loaded is %s', hasLoadedContent => {
    const wrapper = mountReaderLayout(hasLoadedContent);

    expect(wrapper.findAllComponents(DailyBriefingIntro)).toHaveLength(1);
    expect(wrapper.getComponent(DailyBriefingIntro).props('readerMode')).toBe(true);
  });
});
