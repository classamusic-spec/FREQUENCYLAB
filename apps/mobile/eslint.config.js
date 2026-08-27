const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'ios/*', 'android/*'],
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
