module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'airbnb',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
  ],
  plugins: ['react', '@typescript-eslint', 'react-hooks'],
  rules: {
    'no-console': 'warn',
    'react/react-in-jsx-scope': 'off', // Not needed in Preact
    'react/jsx-uses-react': 'off', // Not needed in Preact
    'react/prop-types': 'off', // TypeScript handles this
    'react/jsx-filename-extension': 'off', // Allow JSX in .tsx files
    'import/no-unresolved': ['error', { ignore: ['^hono/'] }],
    'no-await-in-loop': 'off', // Allow await in loops for sequential operations
    'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'], // Allow for...of
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
      },
    },
  ],
};