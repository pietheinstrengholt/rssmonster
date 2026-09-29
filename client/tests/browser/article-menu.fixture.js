import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import Article from '../../src/components/articles/Article.vue';
import BootstrapIcon from '../../src/components/shared/BootstrapIcon.vue';
import { useSelectionStore } from '../../src/store/selection.js';
import '../../src/assets/styles/theme.css';
import '../../src/assets/scss/global.scss';

const pinia = createPinia();
const selection = useSelectionStore(pinia);
const params = new URLSearchParams(location.search);
selection.currentSelection.viewMode = params.get('mode') || 'expanded';
selection.currentSelection.grouping = 'none';
document.documentElement.dataset.theme = params.get('theme') || 'light';

const app = createApp({
  render: () => [1, 2, 3, 4].map(id => h(Article, {
    id,
    title: `Article ${id}`,
    content: '<p>A short article preview.</p>',
    feed: { feedName: 'Example feed' },
    onToggleMinimalReadStatus: () => { document.body.dataset.selectedArticle = String(id); }
  }))
});
app.use(pinia);
app.component('BootstrapIcon', BootstrapIcon);
app.mount('#articles');
