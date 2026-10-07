import { createApp, h, nextTick } from 'vue';
import { createFocusedStores } from '../helpers/focusedStores.js';
import UnreadSelectionContext from '../../src/components/articles/UnreadSelectionContext.vue';
import ArticleBulkActionMenu from '../../src/components/articles/ArticleBulkActionMenu.vue';
import BootstrapIcon from '../../src/components/shared/BootstrapIcon.vue';
import '../../src/assets/scss/global.scss';
import '../../src/assets/styles/theme.css';

const stores = createFocusedStores({ selection: { currentSelection: { status: 'unread', smartFolderId: null, search: 'science' } } });
const pane = document.querySelector('#app');
const app = createApp({
  render: () => h(UnreadSelectionContext, {
    headlineMode: true,
    hideSaveSmartFolder: true,
    articleCount: 4281,
    sourceCount: 41,
    oldestPublishedAt: '2020-01-01',
    articles: [{ id: 1, publishedAt: '2026-10-06T12:00:00Z' }]
  }, { actions: () => h(ArticleBulkActionMenu, { articleCount: 1, selectedArticleId: 1, selectedArticleIndex: 0 }) })
});
app.use(stores.pinia).component('BootstrapIcon', BootstrapIcon).mount(pane);
await nextTick();
await nextTick();
const failures = [];
let cases = 0;
for (const theme of ['light', 'dark']) {
  document.documentElement.dataset.theme = theme;
  for (const width of [1600, 1200, 1000, 767, 480, 390, 320, 260, 200]) {
    pane.style.width = `${width}px`;
    await nextTick();
    const button = pane.querySelector('[aria-label="More actions"]');
    const surface = pane.querySelector('.unread-selection-context__surface').getBoundingClientRect();
    const bounds = button.getBoundingClientRect();
    const visible = button.getClientRects().length && bounds.width > 0;
    if (!visible || Math.abs(bounds.right - (surface.right - 17)) > 1) failures.push({ theme, width, visible, bounds, surface });
    button.click();
    await nextTick();
    const menu = pane.querySelector('[role="menu"]').getBoundingClientRect();
    const save = [...pane.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('Save as smart folder'));
    if (!save?.getClientRects().length) failures.push({ theme, width, saveHidden: true });
    if (menu.left < 0 || menu.right > window.innerWidth || menu.top < 0 || menu.bottom > window.innerHeight) failures.push({ theme, width, menu });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    cases++;
  }
}
document.querySelector('#result').textContent = JSON.stringify({ cases, failures });
