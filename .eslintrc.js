module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  env: {
    es2022: true,
    node: true,
  },
  globals: {
    __DEV__: 'readonly',
    React: 'readonly',
  },
  ignorePatterns: [
    'node_modules/',
    '.expo/',
    'backend/',
    'dist/',
    'build/',
    'android/',
    'ios/',
    'coverage/',
  ],
  rules: {
    // TypeScript-specific relaxations for existing codebase
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],

    // Disallow console.log/warn in production code — use logger utility instead.
    // console.error is still allowed for genuine error reporting.
    'no-console': ['warn', { allow: ['error'] }],

    // General code quality
    'no-debugger': 'error',
    'no-duplicate-imports': 'warn',
    'prefer-const': 'warn',
  },
  overrides: [
    {
      // Allow console in the logger utility itself
      files: ['src/utils/logger.ts'],
      rules: { 'no-console': 'off' },
    },
    {
      // Relax rules for config/test files
      files: ['*.config.js', '*.config.ts', 'jest.setup.*', '**/__tests__/**'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
};
