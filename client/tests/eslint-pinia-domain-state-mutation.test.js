import { Linter } from 'eslint';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it } from 'vitest';
import noPiniaDomainStateMutation from '../eslint-rules/no-pinia-domain-state-mutation.js';

const plugin = {
  rules: {
    'no-pinia-domain-state-mutation': noPiniaDomainStateMutation
  }
};

// This function runs the repository mutation boundary rule against JavaScript fixtures.
const lintJavaScript = code => new Linter({ configType: 'flat' }).verify(code, [{
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: { local: plugin },
  rules: {
    'local/no-pinia-domain-state-mutation': 'error'
  }
}]);

// This function runs the repository mutation boundary rule against Vue template fixtures.
const lintVue = code => new Linter({ configType: 'flat' }).verify(code, [{
  languageOptions: {
    parser: vueParser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    }
  },
  plugins: { local: plugin },
  rules: {
    'local/no-pinia-domain-state-mutation': 'error'
  }
}]);

describe('Pinia domain state mutation lint rule', () => {
  // These fixtures cover assignment operators at direct and nested store state paths.
  it.each([
    'this.overviewStore.categories = [];',
    "this.selectionStore.currentSelection.status = 'read';",
    'this.uiStore.chatAssistantOpen = true;',
    'this.overviewStore.unreadCount += 2;',
    'this.selectionStore.currentSelection = nextSelection;'
  ])('rejects store-owned assignments: %s', source => {
    expect(lintJavaScript(source)).toEqual([
      expect.objectContaining({ messageId: 'useAction' })
    ]);
  });

  // These fixtures cover both prefix and postfix counter mutation operators.
  it.each([
    'this.overviewStore.unreadCount++;',
    '--this.overviewStore.readCount;'
  ])('rejects store-owned update expressions: %s', source => {
    expect(lintJavaScript(source)).toEqual([
      expect.objectContaining({ messageId: 'useAction' })
    ]);
  });

  // These fixtures cover mutating collection methods at direct and nested store paths.
  it.each([
    'this.overviewStore.categories.push(category);',
    'this.overviewStore.categories.splice(0, 1);',
    'this.overviewStore.categories.pop();',
    'this.overviewStore.categories.shift();',
    'this.overviewStore.categories.unshift(category);',
    'this.overviewStore.categories[0].feeds.push(feed);',
    'this.overviewStore.$patch({ categories: [] });'
  ])('rejects store-owned collection mutation: %s', source => {
    expect(lintJavaScript(source)).toEqual([
      expect.objectContaining({ messageId: 'useAction' })
    ]);
  });

  it('recognizes focused store instances created with Pinia hooks', () => {
    const messages = lintJavaScript(`
      import { useOverviewStore } from './store/overview.js';
      const navigation = useOverviewStore();
      navigation.categories.reverse();
    `);

    expect(messages).toEqual([
      expect.objectContaining({ messageId: 'useAction' })
    ]);
  });

  it('rejects Vue model bindings that write directly to focused store state', () => {
    const messages = lintVue(`
      <template><input v-model="uiStore.searchQuery"></template>
      <script>export default {}</script>
    `);

    expect(messages).toEqual([
      expect.objectContaining({ messageId: 'useAction' })
    ]);
  });

  it('allows actions and local component-owned state transitions', () => {
    const messages = lintJavaScript(`
      this.overviewStore.addCategory(category);
      this.overviewStore.add(category);
      this.selectionStore.setSelectedStatus('read');
      this.uiStore.set(true);
      this.uiStore.setChatAssistantOpen(true);
      this.form.status = 'ready';
      this.feeds.push(feed);
    `);

    expect(messages).toEqual([]);
  });
});
