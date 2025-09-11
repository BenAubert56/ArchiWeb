// back/eslint.config.js
import js from '@eslint/js';

export default [
  // ignore
  { ignores: ['node_modules', 'coverage', 'stored_pdfs', 'uploads'] },

  // base recommandé
  js.configs.recommended,

  // Node ESM
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    env: { node: true },
    rules: {
      // ajuste au besoin
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
    },
  },

  // Tests Jest
  {
    files: ['src/__tests__/**/*.js', '**/*.test.js'],
    env: { jest: true, node: true },
  },
];
