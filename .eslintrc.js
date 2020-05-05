module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'prettier/@typescript-eslint',
  ],
  env: {
    node: true,
  },
  rules: {
    // '@typescript-eslint/no-empty-interface': ['off'],
    '@typescript-eslint/no-use-before-define': ['off'],
    // '@typescript-eslint/explicit-function-return-type': ['off'],
    // '@typescript-eslint/no-explicit-any': ['off'],
    // '@typescript-eslint/explicit-member-accessibility': ['off'],
  },
};
