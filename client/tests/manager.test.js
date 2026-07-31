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

	it('uses the briefing query for the Daily briefing pseudo-status', () => {
		setActivePinia(createPinia());
		const store = useSelectionStore();

		store.setSelectedStatus('briefing');

		expect(store.currentSelection.status).toBe('briefing');
		expect(store.currentSelection.search).toBe('briefing:true @lastweek');

		store.setBriefingSelectionPeriod('24h');

		expect(store.briefingSelectionPeriod).toBe('24h');
		expect(store.currentSelection.search).toBe('briefing:true @today');

		store.setBriefingSelectionPeriod('7d');

		expect(store.currentSelection.search).toBe('briefing:true @lastweek');

		store.setBriefingFilters({
			selectionPeriod: '7d',
			includeOnlyUnreadArticles: true,
			prioritizeHighTrust: false
		});

		expect(store.briefingIncludeOnlyUnreadArticles).toBe(true);
		expect(store.currentSelection.search).toBe('briefing:true unread:true @lastweek');

		store.setBriefingFilters({
			selectionPeriod: '7d',
			includeOnlyUnreadArticles: true,
			prioritizeHighTrust: true
		});

		expect(store.briefingPrioritizeHighTrust).toBe(true);
		expect(store.currentSelection.search)
			.toBe('briefing:true unread:true @lastweek sort:trust');

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
