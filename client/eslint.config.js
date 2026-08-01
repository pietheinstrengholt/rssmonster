import globals from 'globals';
import vue from 'eslint-plugin-vue';
import noPiniaDomainStateMutation from './eslint-rules/no-pinia-domain-state-mutation.js';

const localRules = {
  rules: {
    'no-pinia-domain-state-mutation': noPiniaDomainStateMutation
  }
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/public/**'
    ]
  },

  ...vue.configs['flat/essential'],

  {
    files: ['src/**/*.{js,vue}'],
    plugins: {
      local: localRules
    },
    rules: {
      'local/no-pinia-domain-state-mutation': 'error'
    }
  },

  {
    files: [
      'src/store/auth.js',
      'src/store/overview.js',
      'src/store/selection.js',
      'src/store/ui.js'
    ],
    rules: {
      'local/no-pinia-domain-state-mutation': 'off'
    }
  },

  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.browser,
        ...globals.es2022
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',

      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'arrow-body-style': ['error', 'as-needed'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],

      'vue/multi-word-component-names': 'off'
    }
  },

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',

      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'arrow-body-style': ['error', 'as-needed'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never']
    }
  }
];
