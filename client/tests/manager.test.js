import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Sidebar from '../src/components/Sidebar.vue';
import { updateCategoryOrder } from '../src/api/manager';

vi.mock('../src/api/manager', () => ({
	updateCategoryOrder: vi.fn().mockResolvedValue({ status: 200 })
}));

describe('Sidebar manager', () => {
	it('updates category order via manager API', async () => {
		const wrapper = mount(Sidebar, {
			global: {
				stubs: {
					BootstrapIcon: true,
					draggable: {
						template: '<div><slot /></div>'
					}
				},
				mocks: {
					$store: {
						auth: {
							setToken: vi.fn(),
							setRole: vi.fn()
						},
						data: {
							currentSelection: {
								status: 'unread',
								categoryId: '%',
								feedId: '%',
								smartFolderId: null,
								tag: null
							},
							categories: [
								{ id: 10, name: 'Tech', feeds: [] },
								{ id: 20, name: 'News', feeds: [] }
							],
							smartFolders: [],
							topTags: [],
							unreadCount: 0,
							readCount: 0,
							starCount: 0,
							hotCount: 0,
							clickedCount: 0,
							unreadsSinceLastUpdate: 0,
							fetchTopTags: vi.fn().mockResolvedValue({}),
							fetchSmartFolders: vi.fn().mockResolvedValue({}),
							setShowModal: vi.fn(),
							setSelectedStatus: vi.fn(),
							setSelectedCategoryId: vi.fn(),
							setSelectedFeedId: vi.fn(),
							setSmartFolder: vi.fn(),
							setTag: vi.fn()
						}
					}
				}
			}
		});

		wrapper.vm.updateSortOrder();

		expect(updateCategoryOrder).toHaveBeenCalledWith([10, 20]);
	});
});
