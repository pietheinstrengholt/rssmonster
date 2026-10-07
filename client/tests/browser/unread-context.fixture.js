import { createApp, h, nextTick } from 'vue';
import { createFocusedStores } from '../helpers/focusedStores.js';
import UnreadSelectionContext from '../../src/components/articles/UnreadSelectionContext.vue';
import NewArticlesBanner from '../../src/components/articles/NewArticlesBanner.vue';
import ArticleBulkActionMenu from '../../src/components/articles/ArticleBulkActionMenu.vue';
import BootstrapIcon from '../../src/components/shared/BootstrapIcon.vue';
import '../../src/assets/scss/global.scss';
import '../../src/assets/styles/theme.css';

const stores = createFocusedStores({ selection: { currentSelection: { status: 'unread', smartFolderId: null, search: '' } } });
const pane = document.querySelector('#app');
pane.style.display = 'grid';
pane.style.alignContent = 'start';
pane.style.container = 'headline-topbars / inline-size';
const app = createApp({
  render: () => [h(NewArticlesBanner, { headlineMode: true, count: 55 }), h(UnreadSelectionContext, {
    headlineMode: true,
    hideSaveSmartFolder: window.innerWidth <= 767,
    articleCount: 4281,
    sourceCount: 41,
    oldestPublishedAt: '2020-01-01',
    articles: [{ id: 1, publishedAt: '2026-10-06T12:00:00Z' }]
  }, window.innerWidth <= 767 ? { actions: () => h(ArticleBulkActionMenu, { articleCount: 1 }) } : undefined)]
});
app.use(stores.pinia).component('BootstrapIcon', BootstrapIcon).mount(pane);
// The sticky-date composable connects on the next tick and then updates the rendered date.
await nextTick();
await nextTick();

const rows = [];
for (const search of ['', 'science']) {
  stores.selectionStore.currentSelection.search = search;
  await nextTick();
  for (const theme of ['light', 'dark']) {
    document.documentElement.dataset.theme = theme;
    for (const width of [...(window.innerWidth >= 1250 ? [window.innerWidth - 308] : []), 1600, 1300, 1230, 1201, 1200, 1199, 1100, 1000, 918, 883, 882, 881, 875, 874, 767, 600, 480, 460, 459, 440, 414, 390, 375, 360, 343, 320, 304, 288, 260, 200]) {
      if (window.innerWidth >= 1250 && width < window.innerWidth - 308) continue;
      pane.style.width = `${width}px`;
      await nextTick();
      const surface = pane.querySelector('.unread-selection-context__surface');
      const summary = pane.querySelector('.unread-selection-context__summary');
      const rect = surface.getBoundingClientRect();
      const overflow = [...surface.querySelectorAll('button, .unread-selection-context__meta, time')]
        .filter(element => element.getClientRects().length)
        .filter(element => {
          const bounds = element.getBoundingClientRect();
          return bounds.right > rect.right + 1 || bounds.left < rect.left - 1;
        }).map(element => element.textContent.trim());
      const date = summary.querySelector('time');
      const group = summary.querySelector('.unread-selection-context__date-group');
      const groupRect = group.getBoundingClientRect();
      const summaryRect = summary.getBoundingClientRect();
      const menuRect = surface.querySelector('[aria-label="More actions"]')?.getBoundingClientRect();
      const surfaceStyle = getComputedStyle(surface);
      const controlCenters = [...group.querySelectorAll('button')]
        .filter(button => button.getClientRects().length)
        .map(button => {
          const bounds = button.getBoundingClientRect();
          return (bounds.top + bounds.bottom) / 2;
        });
      const banner = pane.querySelector('.new-articles-banner');
      const bannerRect = banner.getBoundingClientRect();
      const bannerOverflow = [...banner.querySelectorAll('button, strong')].some(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.right > bannerRect.right + 1 || bounds.left < bannerRect.left - 1;
      });
      rows.push({
        search, theme, width, height: rect.height,
        bannerHeight: bannerRect.height,
        bannerParts: [...banner.querySelectorAll('.new-articles-banner__copy, .new-articles-banner__actions, button, strong')].map(element => ({ text: element.textContent.trim(), width: element.getBoundingClientRect().width })),
        bannerContextVisible: getComputedStyle(banner.querySelector('.new-articles-banner__context')).display !== 'none',
        bannerOverflow,
        rowSpread: Math.max(...controlCenters) - Math.min(...controlCenters),
        metaVisible: Boolean(summary.querySelector('.unread-selection-context__meta')?.getClientRects().length),
        dateVisible: Boolean(date?.getClientRects().length),
        menuRightOffset: menuRect ? Math.abs(menuRect.right - rect.right + parseFloat(surfaceStyle.paddingRight) + parseFloat(surfaceStyle.borderRightWidth)) : 0,
        leftOffset: Math.abs(groupRect.left - summaryRect.left),
        rightOffset: Math.abs(groupRect.right - summaryRect.right),
        centerOffset: Math.abs((groupRect.left + groupRect.right - summaryRect.left - summaryRect.right) / 2),
        overflow,
        scrollOverflow: surface.scrollWidth > surface.clientWidth + 1
      });
    }
  }
}
const failures = rows.filter(row => row.overflow.length || row.scrollOverflow || row.bannerOverflow
  || row.bannerContextVisible !== (row.width >= 882)
  || (row.width >= 304 && Math.abs(row.bannerHeight - 50) > 1)
  || row.metaVisible !== (window.innerWidth > 767)
  || row.dateVisible !== (window.innerWidth >= 1250)
  || (window.innerWidth <= 767 ? row.leftOffset > 1 || row.menuRightOffset > 1 : window.innerWidth >= 1250 ? row.centerOffset > 1 : row.rightOffset > 1)
  || (row.width >= 320 && (Math.abs(row.height - 54) > 1 || row.rowSpread > 1)));
document.querySelector('#result').textContent = JSON.stringify({ viewportWidth: window.innerWidth, cases: rows.length, failures });
