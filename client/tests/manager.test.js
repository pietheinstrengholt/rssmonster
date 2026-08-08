import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Sidebar from '../src/components/sidebar/Sidebar.vue';
import { updateCategoryOrder } from '../src/api/manager';
import { useSelectionStore } from '../src/store/selection.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/manager', () => ({
	updateCategoryOrder: vi.fn().mockResolvedValue({ status: 200 })
}));

describe('Sidebar manager', () => {
	it('hydrates the developing-events setting with a false default', () => {
		setActivePinia(createPinia());
		const store = useSelectionStore();

		expect(store.currentSelection.includeDevelopingEvents).toBe(false);
		expect(Object.hasOwn(store.$state, 'includeDevelopingEvents')).toBe(false);

		store.setCurrentSelection({ includeDevelopingEvents: true });

		expect(store.currentSelection.includeDevelopingEvents).toBe(true);
		expect(Object.hasOwn(store.$state, 'includeDevelopingEvents')).toBe(false);
	});

	it('hydrates mark-as-read scrolling with an enabled default', () => {
		setActivePinia(createPinia());
		const store = useSelectionStore();

		expect(store.currentSelection.markAsReadOnScroll).toBe(true);

		store.setCurrentSelection({ markAsReadOnScroll: false });

		expect(store.currentSelection.markAsReadOnScroll).toBe(false);
	});

	it('forces event grouping when a search selects developing stories', () => {
		setActivePinia(createPinia());
		const store = useSelectionStore();

		store.setSelectedSearch('quality:0.5 developing:true');

		expect(store.currentSelection.grouping).toBe('event');
		expect(store.currentSelection.includeDevelopingEvents).toBe(true);

		store.setSmartFolder({ id: 9, query: 'developing:true', limitCount: 20 });

		expect(store.currentSelection.grouping).toBe('event');
		expect(store.currentSelection.includeDevelopingEvents).toBe(true);

		store.setCurrentSelection({ grouping: 'none', includeDevelopingEvents: false });
		store.setSelectedSearch('developing:true developing:false');

		expect(store.currentSelection.grouping).toBe('none');
		expect(store.currentSelection.includeDevelopingEvents).toBe(false);
	});

	it('uses the briefing query for the Daily briefing pseudo-status', () => {
		setActivePinia(createPinia());
		const store = useSelectionStore();

		store.setSelectedStatus('briefing');

		expect(store.currentSelection.status).toBe('briefing');
		expect(store.currentSelection.search).toBe('briefing:true @lastweek sort:recommended');
		expect(store.currentSelection.sort).toBe('recommended');
		expect(store.currentSelection.grouping).toBe('event');

		store.setBriefingSelectionPeriod('24h');

		expect(store.briefingSelectionPeriod).toBe('24h');
		expect(store.currentSelection.search).toBe('briefing:true @today sort:recommended');

		store.setBriefingSelectionPeriod('7d');

		expect(store.currentSelection.search).toBe('briefing:true @lastweek sort:recommended');

		store.setBriefingFilters({
			selectionPeriod: '7d',
			includeOnlyUnreadArticles: true,
			markAsReadOnScroll: true,
			prioritizeHighTrust: false
		});

		expect(store.briefingIncludeOnlyUnreadArticles).toBe(true);
		expect(store.briefingMarkAsReadOnScroll).toBe(true);
		expect(store.effectiveMarkAsReadOnScroll).toBe(true);
		expect(store.currentSelection.search).toBe('briefing:true unread:true @lastweek sort:recommended');

		store.setBriefingFilters({
			selectionPeriod: '7d',
			includeOnlyUnreadArticles: true,
			markAsReadOnScroll: false,
			prioritizeHighTrust: true
		});

		expect(store.briefingPrioritizeHighTrust).toBe(true);
		expect(store.currentSelection.search)
			.toBe('briefing:true unread:true @lastweek sort:recommended');

		store.setBriefingFilters({
			selectionPeriod: '7d',
			includeOnlyUnreadArticles: true,
			markAsReadOnScroll: false,
			prioritizeHighTrust: true,
			showOnlyDevelopingEventArticles: true
		});

		expect(store.briefingShowOnlyDevelopingEventArticles).toBe(true);
		expect(store.currentSelection.grouping).toBe('event');
		expect(store.currentSelection.includeDevelopingEvents).toBe(true);

		store.refreshBriefingSelection();

		expect(store.currentSelection.briefingRevision).toBe(1);
	});

	it('renders the live Daily briefing row before Unread and updates category order', async () => {
		const setSelectedStatus = vi.fn();
		const stores = createFocusedStores({
			auth: {
				role: 'user'
			},
			overview: {
				categories: [
					{ id: 10, name: 'Tech', feeds: [] },
					{ id: 20, name: 'News', feeds: [] }
				],
				smartFolders: [],
				topTags: [],
				briefingCount: 7,
				unreadCount: 0,
				readCount: 0,
				favoriteCount: 0,
				hotCount: 0,
				clickedCount: 0,
				unreadsSinceLastUpdate: 0,
				fetchTopTags: vi.fn().mockResolvedValue({}),
				fetchSmartFolders: vi.fn().mockResolvedValue({})
			},
			selection: {
				currentSelection: {
					AIEnabled: true,
					status: 'briefing',
					categoryId: '%',
					feedId: '%',
					search: 'briefing:true @lastweek',
					smartFolderId: null,
					tag: null
				},
				setSelectedStatus,
				setSmartFolder: vi.fn(),
				setTag: vi.fn()
			},
			ui: {
				setShowModal: vi.fn()
			}
		});
		const wrapper = mount(Sidebar, {
			global: {
				plugins: [stores.pinia],
				stubs: {
					BootstrapIcon: true,
					draggable: {
						template: '<div><slot /></div>'
					}
				}
			}
		});

		const statusRows = wrapper.findAll('.sidebar-status-item');
		expect(statusRows[0].text()).toContain('Daily briefing');
		expect(statusRows[0].text()).toContain('7');
		expect(statusRows[0].find('bootstrap-icon-stub').attributes('icon')).toBe('sunrise-fill');
		expect(statusRows[0].classes()).toContain('selected');
		expect(statusRows[1].text()).toContain('Unread');

		await statusRows[0].trigger('click');
		expect(setSelectedStatus).not.toHaveBeenCalled();

		wrapper.vm.selectionStore.currentSelection.status = 'unread';
		wrapper.vm.selectionStore.currentSelection.smartFolderId = 42;
		await wrapper.vm.$nextTick();
		await statusRows[1].trigger('click');
		expect(setSelectedStatus).toHaveBeenCalledWith('unread');

		wrapper.vm.selectionStore.currentSelection.AIEnabled = false;
		await wrapper.vm.$nextTick();
		expect(wrapper.text()).not.toContain('Daily briefing');

		wrapper.vm.updateSortOrder();

		expect(updateCategoryOrder).toHaveBeenCalledWith([10, 20]);
	});
});
