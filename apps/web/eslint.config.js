import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'src/routeTree.gen.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettierConfig,
    ],
    plugins: {
      prettier: prettierPlugin,
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'prettier/prettier': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Boundary files where react-refresh's component-export hygiene can't be
    // satisfied and adds no value:
    //  - src/main.tsx — the app entry point has no exports (it calls
    //    createRoot) but defines a local <App>, hitting the "file has no
    //    exports" case.
    //  - src/routes/** — route files pair `export const Route` (a non-component)
    //    with a local route component; with no component export the rule flags
    //    the local component regardless of `allowExportNames`. Route HMR is
    //    handled by the TanStack Router plugin.
    files: ['src/main.tsx', 'src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
]);
