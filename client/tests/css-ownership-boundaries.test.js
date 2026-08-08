import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import appSource from '../src/App.vue?raw';
import appShellSource from '../src/AppShell.vue?raw';
import articleSource from '../src/components/articles/Article.vue?raw';
import articleActionsSource from '../src/components/articles/ArticleActionsMenu.vue?raw';
import articleContentSource from '../src/components/articles/ArticleContent.vue?raw';
import articleHeaderSource from '../src/components/articles/ArticleHeader.vue?raw';
import articleHeadlineSource from '../src/components/articles/ArticleHeadlineRow.vue?raw';
import articleMetaSource from '../src/components/articles/ArticleMeta.vue?raw';
import articlePreviewFallbackSource from '../src/components/articles/ArticlePreviewFallback.vue?raw';
import articleTagsSource from '../src/components/articles/ArticleTagsScores.vue?raw';
import chatAssistantSource from '../src/components/assistant/ChatAssistant.vue?raw';
import settingsActionsSource from '../src/components/settings/SettingsActions.vue?raw';
import settingsFeedsSource from '../src/components/settings/SettingsFeedsOverview.vue?raw';
import settingsUsersSource from '../src/components/settings/SettingsManageUsers.vue?raw';

const articleOverrides = readFileSync(
  resolve(process.cwd(), 'src/components/articles/articleContentOverrides.css'),
  'utf8'
);
const globalStyles = readFileSync(resolve(process.cwd(), 'src/assets/scss/global.scss'), 'utf8');

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

  // Verifies the Settings components no longer carry a second unscoped dark-mode override block.
  it('keeps targeted Settings theme rules in one scoped style block', () => {
    for (const source of [settingsActionsSource, settingsFeedsSource, settingsUsersSource]) {
      expect(source.match(/<style/g)).toHaveLength(1);
      expect(source).toContain('<style scoped>');
    }
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
