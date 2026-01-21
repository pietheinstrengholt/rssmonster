import globals from 'globals';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default [
  {
    files: ['**/*.vue'],

    ignores: [
      'node_modules/**',
      'dist/**',
      'public/**'
    ],

    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.browser,
        ...globals.es2022
      }
    },

    plugins: {
      vue
    },

    rules: {
      // ---- Core sanity rules
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',

      // ---- Vue essentials (minimal but solid)
      'vue/no-unused-components': 'warn',
      'vue/no-mutating-props': 'warn',
      'vue/require-v-for-key': 'error',
      'vue/require-valid-default-prop': 'error',

      // ---- Style (aligned with server)
      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'arrow-body-style': ['error', 'as-needed'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],

      // ---- Pragmatic relaxations
      'vue/multi-word-component-names': 'off'
    }
  },

  {
    files: ['**/*.js'],

    ignores: [
      'node_modules/**',
      'dist/**',
      'public/**'
    ],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022
      }
    },

    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',

      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'arrow-body-style': ['error', 'as-needed'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never']
    }
  }
];