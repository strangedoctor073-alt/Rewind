import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist-daemon`, `dist-electron`, and `extension/assets` are build outputs
  globalIgnores(['dist', 'dist-daemon', 'dist-electron', 'extension/assets']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The daemon is a Node process, not browser code.
    files: ['daemon/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Hand-written JavaScript: Electron main/preload, CLI, extension scripts.
    // Previously never linted, which is how dead code and unused imports built up.
    files: ['desktop/**/*.{js,cjs}', 'bin/**/*.js', 'extension/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser, chrome: 'readonly' },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
])
