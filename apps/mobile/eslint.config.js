const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    // Build output, never source. `.vercel` holds a deploy's prebuilt copy
    // of `dist`, which is a bundled Metro artefact and lints as thousands of
    // `var` and `__d` errors that mean nothing.
    ignores: ['dist/*', '.expo/*', 'ios/*', 'android/*', '.vercel/*'],
  },
  {
    rules: {
      // The audio path deliberately fires promises it does not await — a render
      // callback must never block — so the rule is opt-in via `void` instead.
      'no-void': 'off',
      'import/no-unresolved': 'off',
    },
  },
];
