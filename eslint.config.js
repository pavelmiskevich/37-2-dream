import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const nondeterminism = 'dream-core must stay deterministic: use the seeded RNG / simulation clock (D-005).';

export default defineConfig(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.remember/**', '**/.venv/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/dream-core/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: nondeterminism },
        { object: 'Date', property: 'now', message: nondeterminism },
        { object: 'performance', property: 'now', message: nondeterminism },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: nondeterminism },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'performance', message: nondeterminism },
        { name: 'window', message: 'dream-core must not depend on the DOM.' },
        { name: 'document', message: 'dream-core must not depend on the DOM.' },
        { name: 'localStorage', message: 'dream-core must not read storage (D-004).' },
        { name: 'sessionStorage', message: 'dream-core must not read storage (D-004).' },
      ],
    },
  },
);
