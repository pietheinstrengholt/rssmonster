import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import UnreadSelectionContext from '../../src/components/articles/UnreadSelectionContext.vue';
import ArticleExplanationPopover from '../../src/components/articles/ArticleExplanationPopover.vue';
import ArticleStorySourcesPopover from '../../src/components/articles/ArticleStorySourcesPopover.vue';
import ArticleQualityExplanation from '../../src/components/articles/ArticleQualityExplanation.vue';
import BootstrapIcon from '../../src/components/shared/BootstrapIcon.vue';
import { useSelectionStore } from '../../src/store/selection.js';
import '../../src/assets/styles/theme.css';
import '../../src/assets/scss/global.scss';
const pinia = createPinia();
createApp({ render: () => h('main', [
  h(UnreadSelectionContext, { articleCount: 12, sourceCount: 3 }),
  h('section', { 'aria-label': 'Article badge references' }, [
    h(ArticleExplanationPopover, { triggerLabel: 'Reference Recommended', ariaLabel: 'Reference Recommended', dialogTitle: 'Recommended', triggerClass: 'recommended-badge', items: [] }),
    h(ArticleStorySourcesPopover, { sourceCount: 3, articleId: 1 }),
    h(ArticleQualityExplanation, { quality: 0.8, advertisementScore: 80, sentimentScore: 80, qualityScore: 80 })
  ])
]) }).use(pinia).component('BootstrapIcon', BootstrapIcon).mount('#app');
useSelectionStore(pinia).currentSelection.search = 'title:"A long search phrase to test wrapping in the preview" author:"Ada Lovelace" language:nl quality:>=0.80 event:true firstSeen:7d';

useSelectionStore(pinia).currentSelection.sort = 'recommended';
useSelectionStore(pinia).currentSelection.grouping = 'event';
