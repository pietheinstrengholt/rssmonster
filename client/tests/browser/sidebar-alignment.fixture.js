import { createApp, h, nextTick } from 'vue';
import SidebarFeedItem from '../../src/components/sidebar/SidebarFeedItem.vue';
import SidebarCategoryGroup from '../../src/components/sidebar/SidebarCategoryGroup.vue';
import SidebarNavItem from '../../src/components/sidebar/SidebarNavItem.vue';
import BootstrapIcon from '../../src/components/shared/BootstrapIcon.vue';
import sprite from 'virtual:bootstrap-icons-sprite';
import '../../src/assets/styles/theme.css';
import '../../src/assets/scss/global.scss';

const symbols = document.createElement('div');
symbols.hidden = true;
symbols.innerHTML = sprite;
document.body.prepend(symbols);
const app = createApp({
  render: () => h('div', { style: { width: '250px' } }, [
    ...['0', '9/109', '1.2K'].flatMap((count, index) => [
      h(SidebarNavItem, { icon: 'tag-fill', title: 'A long tag title that truncates', count, selected: index === 1 }),
      h(SidebarCategoryGroup, { category: { id: index, name: 'Category title', feeds: [] }, selectedCategoryId: index, selectedFeedId: '%', count, countResolver: () => count }),
      h(SidebarFeedItem, { feed: { id: index, feedName: 'Feed with RSS icon' }, count, selected: index === 1 }),
      h(SidebarFeedItem, { feed: { id: index, feedName: 'Feed with favicon', favicon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="gray"/></svg>' }, count, shortcut: true }),
      h(SidebarFeedItem, { feed: { id: index, feedName: 'Feed without icon' }, count, showFeedFavicons: false })
    ])
  ])
});
app.component('BootstrapIcon', BootstrapIcon);
app.mount('#sidebar-alignment');
await nextTick();
await document.fonts.ready;
const results = [];
for (const theme of ['light', 'dark']) {
  document.documentElement.dataset.theme = theme;
  for (const size of [14, 16]) {
    document.querySelector('#sidebar-alignment').style.fontSize = `${size}px`;
    for (const row of document.querySelectorAll('.sidebar-feed-select, .sidebar-category-select, .sidebar-item')) {
      const bounds = row.getBoundingClientRect();
      const center = bounds.top + bounds.height / 2;
      const parts = [...row.querySelectorAll('.sidebar-icon, .sidebar-item-title, .sidebar-item-title-text, .sidebar-count, .sidebar-count-value')];
      const offsets = parts.map(part => {
        const rect = part.getBoundingClientRect();
        return Math.abs(rect.top + rect.height / 2 - center);
      });
      const textOffsets = ['.sidebar-item-title-text', '.sidebar-count-value'].map(selector => {
        const range = document.createRange();
        range.selectNodeContents(row.querySelector(selector));
        const rect = range.getBoundingClientRect();
        return { selector, offset: rect.top + rect.height / 2 - center };
      });
      results.push({ theme, size, label: row.textContent.trim(), maxOffset: Math.max(...offsets), textOffsetDifference: Math.abs(textOffsets[0].offset - textOffsets[1].offset) });
    }
  }
}
const failures = results.filter(result => result.maxOffset > 0.01 || result.textOffsetDifference > 0.01);
window.sidebarAlignmentResults = { passed: failures.length === 0, cases: results.length, maxOffset: Math.max(...results.map(result => result.maxOffset)), maxTextOffsetDifference: Math.max(...results.map(result => result.textOffsetDifference)), failures };
document.querySelector('#alignment-result').textContent = JSON.stringify(window.sidebarAlignmentResults);
