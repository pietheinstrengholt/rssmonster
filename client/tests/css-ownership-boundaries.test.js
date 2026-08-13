import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import appSource from '../src/App.vue?raw';
import appShellSource from '../src/AppShell.vue?raw';
import articleSource from '../src/components/articles/Article.vue?raw';
import articleActionsSource from '../src/components/articles/ArticleActionsMenu.vue?raw';
import articleContentSource from '../src/components/articles/ArticleContent.vue?raw';
import articleEndStateSource from '../src/components/articles/ArticleEndState.vue?raw';
import articleHeaderSource from '../src/components/articles/ArticleHeader.vue?raw';
import articleHeadlineSource from '../src/components/articles/ArticleHeadlineRow.vue?raw';
import articleMetaSource from '../src/components/articles/ArticleMeta.vue?raw';
import articlePreviewFallbackSource from '../src/components/articles/ArticlePreviewFallback.vue?raw';
import articleRefreshStateSource from '../src/components/articles/ArticleRefreshState.vue?raw';
import articleTagsSource from '../src/components/articles/ArticleTagsScores.vue?raw';
import articleListSource from '../src/components/articles/ArticleListView.vue?raw';
import articleReaderSource from '../src/components/articles/ArticleReaderLayout.vue?raw';
import chatAssistantSource from '../src/components/assistant/ChatAssistant.vue?raw';
import connectivityStatusSource from '../src/components/shared/ConnectivityStatus.vue?raw';
import desktopToolbarSource from '../src/components/shell/DesktopToolbar.vue?raw';
import mobileToolbarSource from '../src/components/shell/MobileToolbar.vue?raw';
import settingsActionsSource from '../src/components/settings/SettingsActions.vue?raw';
import settingsFeedsSource from '../src/components/settings/SettingsFeedsOverview.vue?raw';
import settingsUsersSource from '../src/components/settings/SettingsManageUsers.vue?raw';
import appDropdownSource from '../src/components/shared/AppDropdown.vue?raw';

const articleOverrides = readFileSync(
  resolve(process.cwd(), 'src/components/articles/articleContentOverrides.css'),
  'utf8'
);
const globalStyles = readFileSync(resolve(process.cwd(), 'src/assets/scss/global.scss'), 'utf8');
const settingsStyles = readFileSync(resolve(process.cwd(), 'src/assets/css/settings.css'), 'utf8');

describe('CSS ownership boundaries', () => {
  // Verifies chat styles cannot mutate article presentation and still reach rendered response HTML explicitly.
  it('contains ChatAssistant styles within the component', () => {
    expect(chatAssistantSource).toContain('<style scoped>');
    expect(chatAssistantSource).toContain(':deep(a)');
    expect(chatAssistantSource).not.toMatch(/\.article-(?:body|card|content-wrapper)/);
  });

  // Verifies document sizing and overscroll rules live in the global baseline instead of shell components.
  it('keeps document-global rules out of App and AppShell', () => {
    expect(appSource).toContain('<style scoped>');
    expect(appShellSource).toContain('<style scoped>');
    expect(appSource).not.toMatch(/\bhtml\s*[,\{]/);
    expect(appShellSource).not.toMatch(/\bhtml\s*[,\{]/);
    expect(globalStyles).toMatch(/html\s*\{[^}]*height:\s*100%;[^}]*overscroll-behavior-y:\s*none;/s);
    expect(globalStyles).toMatch(/#app\s*\{[^}]*height:\s*100%;/s);
  });

  // Verifies the persistent sidebar participates in shell layout instead of requiring synchronized offsets.
  it('uses grid flow for the persistent sidebar shell', () => {
    expect(appShellSource).toMatch(/\.app-shell-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--sidebar-width\) minmax\(0, 1fr\);/s);
    expect(appShellSource).toMatch(/\.app-shell__sidebar\s*\{[^}]*position:\s*sticky;[^}]*overflow-y:\s*auto;/s);
    expect(appShellSource).not.toContain('margin-left: var(--sidebar-width)');
    expect(appShellSource).not.toContain('width: calc(100% - var(--sidebar-width))');
    expect(appShellSource).not.toMatch(/\.app-shell__sidebar\s*\{[^}]*position:\s*fixed;/s);
  });

  // Verifies compact desktop toolbar controls remain in flow and search is anchored locally.
  it('keeps compact desktop toolbar geometry inside the toolbar', () => {
    expect(desktopToolbarSource).toMatch(/\.toolbar-search-control\s*\{[^}]*position:\s*relative;[^}]*display:\s*flex;/s);
    expect(desktopToolbarSource).toMatch(/@media \(min-width: 880px\) and \(max-width: 1199px\)[\s\S]*?\.toolbar-search\.toolbar-search-open\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(100% \+ 8px\);[^}]*right:\s*0;/s);
    expect(desktopToolbarSource).not.toContain('position: fixed');
    expect(desktopToolbarSource).not.toMatch(/right:\s*(?:108|124|156|180)px/);
    expect(desktopToolbarSource).not.toContain('margin-right: 128px');
  });

  // Verifies shell and Reader scroll surfaces use native styling without JavaScript visibility state.
  it('keeps native scrollbar presentation with each scroll owner', () => {
    expect(appShellSource).toMatch(/\.app-shell__sidebar\s*\{[^}]*scrollbar-color:\s*var\(--color-transparent\) var\(--color-transparent\);/s);
    expect(appShellSource).toMatch(/\.app-shell__sidebar:hover,[\s\S]*?\.app-shell__sidebar:focus-within\s*\{[^}]*scrollbar-color:\s*var\(--sidebar-scrollbar-thumb\) var\(--color-transparent\);/s);
    expect(appShellSource).toMatch(/@media \(min-width: 880px\)[\s\S]*?\.app-shell__main\s*\{[^}]*scrollbar-color:\s*var\(--main-scrollbar-thumb\) var\(--color-transparent\);[^}]*scrollbar-width:\s*thin;/s);
    expect(appShellSource).toMatch(/\.app-shell__main::\-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*var\(--main-scrollbar-thumb\);[^}]*border-radius:\s*999px;/s);
    expect(articleReaderSource).toMatch(/\.article-reader__list\s*\{[^}]*scrollbar-color:\s*var\(--article-list-scrollbar-thumb\) var\(--color-transparent\);/s);
    expect(articleReaderSource).toMatch(/\.article-reader__content\s*\{[^}]*scrollbar-color:\s*var\(--reader-article-panel-scrollbar-thumb\) var\(--color-transparent\);/s);
    expect(`${appShellSource}\n${articleReaderSource}`).not.toMatch(/ScrollTimeout|\.is-scrolling/);
  });

  // Verifies Reader presentation classes use one component-owned BEM vocabulary.
  it('keeps Reader item presentation under article-reader ownership', () => {
    for (const className of [
      'article-reader__item',
      'article-reader__item--selected',
      'article-reader__item-content',
      'article-reader__item-title',
      'article-reader__item-preview',
      'article-reader__item-kicker',
      'article-reader__item-badges',
      'article-reader__badge',
      'article-reader__thumbnail'
    ]) {
      expect(articleReaderSource).toContain(className);
    }

    expect(articleReaderSource).not.toMatch(/class="[^"]*readerArticle/);
    expect(articleReaderSource).not.toContain('.readerArticleList');
  });

  // Verifies shell overlays are aligned by the main-pane host rather than sidebar-width arithmetic.
  it('positions connectivity feedback through the shell overlay host', () => {
    expect(appShellSource).toContain('class="app-shell__overlay-host"');
    expect(appShellSource).toMatch(/\.app-shell__main-frame\s*\{[^}]*display:\s*grid;[^}]*grid-template-areas:\s*'main-pane';/s);
    expect(connectivityStatusSource).toMatch(/\.connectivity-status\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*680px;/s);
    expect(connectivityStatusSource).not.toContain('var(--sidebar-width)');
    expect(connectivityStatusSource).not.toContain('position: fixed');
  });

  // Verifies phone typography is width-driven instead of changing with viewport orientation.
  it('keeps phone typography stable through 767px', () => {
    expect(mobileToolbarSource).toMatch(/\.mobile-toolbar-brand\s*\{[^}]*font-size:\s*20px;/s);
    expect(mobileToolbarSource).toMatch(/\.mobile-toolbar-button\s*\{[^}]*font-size:\s*20px;/s);
    expect(articleSource).toMatch(/@media \(max-width: 767px\)\s*\{[^}]*\.article-card \.article-body\s*\{[^}]*--article-title-size:\s*18px;/s);
    expect(articleEndStateSource).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.article-end-state-icon\s*\{[^}]*font-size:\s*20px;[\s\S]*?\.article-end-state-title\s*\{[^}]*font-size:\s*17px;/s);
    expect(articleRefreshStateSource).toMatch(/@media \(max-width: 767px\)\s*\{[^}]*\.article-refresh-state-icon\s*\{[^}]*font-size:\s*28px;/s);
  });

  // Verifies the Settings components no longer carry a second unscoped dark-mode override block.
  it('keeps targeted Settings theme rules in one scoped style block', () => {
    for (const source of [settingsActionsSource, settingsFeedsSource, settingsUsersSource]) {
      expect(source.match(/<style/g)).toHaveLength(1);
      expect(source).toContain('<style scoped>');
    }
  });

  // Verifies list-tail and dropdown application styles remain with their markup owners.
  it('scopes remaining article-list and dropdown presentation', () => {
    expect(articleListSource.match(/<style scoped>/g)).toHaveLength(2);
    expect(articleListSource).not.toContain('<style>');
    expect(appDropdownSource).toContain('<style scoped>');
    expect(appDropdownSource).toContain(':deep(.app-dropdown__menu)');
  });

  // Verifies the feed overview owns its table presentation instead of settings.css.
  it('keeps feed-table presentation in SettingsFeedsOverview', () => {
    expect(settingsFeedsSource).toContain('.feeds-table-wrapper');
    expect(settingsFeedsSource).toContain('.feeds-table th');
    expect(settingsStyles).not.toContain('.settings-surface .feeds-table');
  });

  // Verifies publisher compatibility rules remain explicitly global and owned by Article.
  it('keeps publisher HTML compatibility at the article boundary', () => {
    expect(articleSource).toContain('<style src="./articleContentOverrides.css"></style>');
    expect(articleOverrides).toContain('Intentionally global compatibility rules');
    expect(articleOverrides).toContain('.article-card .article-full-content');
  });

  // Verifies application-owned article presentation follows the component that renders each selector.
  it('co-locates article child presentation with its markup owner', () => {
    for (const source of [articleSource, articleActionsSource, articleContentSource, articleHeaderSource, articleHeadlineSource, articleMetaSource, articlePreviewFallbackSource, articleTagsSource]) {
      expect(source).toContain('<style scoped');
    }

    expect(articleHeaderSource).toContain('.article-header-row');
    expect(articleMetaSource).toContain('.article-provenance');
    expect(articleTagsSource).toContain('.score.score-good');
    expect(articleContentSource).toContain('.article-content-wrapper');
    expect(articleActionsSource).toContain('.recommendation-action-item');
    expect(articleHeadlineSource).toContain('.article-list-row');
    expect(articlePreviewFallbackSource).toContain('.article-preview-empty');

    expect(articleSource).not.toContain('.article-header-row');
    expect(articleSource).not.toContain('.article-provenance');
    expect(articleSource).not.toContain('.mobile-score-icon');
    expect(articleSource).not.toContain('.article-tags .score');
    expect(articleSource).not.toContain('.article-list-row');
    expect(articleSource).not.toContain('.article-preview-empty');
  });

  // Verifies metadata children contribute their badges to one shared wrapping row at every width.
  it('flattens article metadata presentation wrappers', () => {
    const sharedMetadataRuleIndex = articleSource.indexOf('.article-card .meta-row :deep(.article-meta),');
    const mobileMetadataQueryIndex = articleSource.indexOf('@media (max-width: 879px) and (orientation: portrait)');

    expect(articleSource).toMatch(/\.meta-row :deep\(\.article-meta\),\s*\.article-card \.meta-row :deep\(\.article-tags\)\s*\{\s*display: contents;/s);
    expect(sharedMetadataRuleIndex).toBeGreaterThanOrEqual(0);
    expect(sharedMetadataRuleIndex).toBeLessThan(mobileMetadataQueryIndex);
  });
});
