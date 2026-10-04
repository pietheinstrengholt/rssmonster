import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import ArticleListView from '../../src/components/articles/ArticleListView.vue';
import ArticleReaderLayout from '../../src/components/articles/ArticleReaderLayout.vue';
import BootstrapIcon from '../../src/components/shared/BootstrapIcon.vue';
import bootstrapIconsSprite from 'virtual:bootstrap-icons-sprite';
import { injectBootstrapIcons } from '../../src/services/bootstrapIcons.js';
import { useSelectionStore } from '../../src/store/selection.js';
import { useOverviewStore } from '../../src/store/overview.js';
import '../../src/assets/styles/theme.css';
import '../../src/assets/scss/global.scss';

const params = new URLSearchParams(location.search);
const pinia = createPinia();
const selection = useSelectionStore(pinia);
const overview = useOverviewStore(pinia);
const mode = params.get('mode') || 'full';
// Match the feed's desktop Reader eligibility; smaller screens use the stream.
const readerLayout = mode === 'reader' && window.matchMedia('(min-width: 1024px)').matches;
selection.currentSelection.viewMode = mode;
selection.currentSelection.status = 'read';
overview.topTags = [{ name: 'news', count: 4 }, { name: 'sports', count: 3 }];
document.documentElement.dataset.theme = params.get('theme') || 'light';
const articles = ref([{
  id: 42, title: 'An article to tag', status: 'read', feed: { feedName: 'Example source' },
  contentText: 'Article preview', contentHtml: '<p>Article preview</p>',
  tags: [{ id: 10, name: 'existing', tagType: 'rule' }]
}]);
const app = createApp({
  render: () => h(readerLayout ? ArticleReaderLayout : ArticleListView, {
    articles: articles.value, container: [42], viewMode: mode, collectionSummary: { totalCount: 1 },
    collectionProgress: { hasLoadedContent: true, isCollectionEmpty: false },
    onUpdateTags: ({ id, tags }) => {
      articles.value.find(article => article.id === id).tags = tags;
      document.body.dataset.articleTags = JSON.stringify(tags);
    }
  })
});
app.use(pinia);
app.component('BootstrapIcon', BootstrapIcon);
injectBootstrapIcons(bootstrapIconsSprite);
app.mount('#articles');
