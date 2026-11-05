import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Архитектура (CLAUDE.md): core — чистая логика, время только через Clock.
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['electron', 'node:*', 'fs', 'path', 'os', 'child_process', 'koffi'] },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[object.name='Date'][property.name='now']", message: 'Только через Clock.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Только через Clock.' },
        { selector: "CallExpression[callee.name=/^(setTimeout|setInterval)$/]", message: 'Таймеры — в main, core получает tick(now).' },
      ],
    },
  },
);
