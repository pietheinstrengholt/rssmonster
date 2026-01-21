import globals from 'globals';

export default [
  {
    files: ['**/*.js'],

    ignores: [
      'node_modules/**',
      'logs/**',
      'dist/**',
      'coverage/**'
    ],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },

    rules: {
      // Safety & correctness
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',

      // Style – compact & readable (your preference)
      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'arrow-body-style': ['error', 'as-needed'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never']
    }
  }
];
