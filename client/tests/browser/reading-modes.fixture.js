import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import DesktopToolbar from '../../src/components/shell/DesktopToolbar.vue';
import MobileMenuOverlay from '../../src/components/shell/MobileMenuOverlay.vue';
import ArticleListView from '../../src/components/articles/ArticleListView.vue';
import ArticleReaderLayout from '../../src/components/articles/ArticleReaderLayout.vue';
import BootstrapIcon from '../../src/components/shared/BootstrapIcon.vue';
import bootstrapIconsSprite from 'virtual:bootstrap-icons-sprite';
import { injectBootstrapIcons } from '../../src/services/bootstrapIcons.js';
import { useSelectionStore } from '../../src/store/selection.js';
import '../../src/assets/styles/theme.css';
import '../../src/assets/scss/global.scss';

const params = new URLSearchParams(location.search);
const pinia = createPinia();
const selection = useSelectionStore(pinia);
selection.setCurrentSelection({ viewMode: params.get('storedMode') || 'full', AIEnabled: true, status: 'read' });
document.documentElement.dataset.theme = params.get('theme') || 'light';
const mobile = window.matchMedia('(max-width: 879px)').matches;
const optionsOpen = ref(false);
const activeHeadlinesArticleId = ref(null);
const articles = [{
  id: 42, title: 'Reading mode article', status: 'read', feed: { feedName: 'Example source' },
  contentHtml: '<p>Rich article body for reading.</p>', contentText: 'Plain article preview for scanning.',
  contentSummaryBullets: ['First summary point', 'Second summary point'], aiAnalysisStatus: 'completed'
}];
const app = createApp({
  render: () => {
    const mode = selection.currentSelection.viewMode;
    return [
      h('output', { 'aria-label': 'Selected reading mode' }, mode),
      mobile ? h('button', { onClick: () => { optionsOpen.value = true; } }, 'Reading options') : h(DesktopToolbar),
      mobile ? h(MobileMenuOverlay, { mobile: optionsOpen.value, onMobile: () => { optionsOpen.value = false; } }) : null,
      h(mode === 'reader' && window.matchMedia('(min-width: 1024px)').matches ? ArticleReaderLayout : ArticleListView, {
        articles, container: [42], viewMode: mode, collectionSummary: { totalCount: 1 },
        collectionProgress: { hasLoadedContent: true, isCollectionEmpty: false },
        activeHeadlinesArticleId: activeHeadlinesArticleId.value,
        onHeadlinesArticleOpened: ({ id }) => { activeHeadlinesArticleId.value = id; },
        onHeadlinesArticleClosed: () => { activeHeadlinesArticleId.value = null; }
      })
    ];
  }
});
app.use(pinia);
app.component('BootstrapIcon', BootstrapIcon);
injectBootstrapIcons(bootstrapIconsSprite);
app.mount('#reading-modes');
