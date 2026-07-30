import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const auditedFiles = [
  '../src/components/Article.vue',
  '../src/components/ArticleFeed.vue',
  '../src/components/articles/articleActions.js',
  '../src/components/DesktopToolbar.vue',
  '../src/components/MobileToolbar.vue',
  '../src/components/MobileMenuOverlay.vue',
  '../src/components/Sidebar.vue',
  '../src/components/model/NewCategory.vue',
  '../src/components/model/RenameCategory.vue',
  '../src/components/model/DeleteCategory.vue',
  '../src/components/model/NewFeed.vue',
  '../src/components/model/DeleteFeed.vue',
  '../src/components/model/UpdateFeed.vue',
  '../src/components/model/SettingsScores.vue',
  '../src/components/onboarding/InitialFeeds.vue'
];

const forbiddenMutations = [
  /\$store\.data\.categories\s*=(?!=)/,
  /\$store\.data\.categories\.push\(/,
  /\$store\.data\.categories\[[^\]]+\]\.feeds(?:\.push\(|\s*=)/,
  /\$store\.data\.(?:favoriteCount|unreadCount|readCount)\s*(?:\+\+|--|[+\-]?=(?!=))/,
  /\$store\.data\.currentSelection\.[A-Za-z]+\s*=(?!=)/,
  /\$store\.data\.(?:searchQuery|chatAssistantOpen)\s*=(?!=)/,
  /v-model="\$store\.data\.(?:categories|searchQuery)"/
];

// This function loads an audited client source file relative to this regression test.
const readAuditedFile = relativePath => readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8'
);

describe('Pinia domain mutation boundaries', () => {
  it.each(auditedFiles)('%s requests store mutations through actions', relativePath => {
    const source = readAuditedFile(relativePath);

    for (const pattern of forbiddenMutations) {
      expect(source).not.toMatch(pattern);
    }
  });
});
