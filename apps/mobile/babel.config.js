module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    // react-native-worklets/plugin must stay last: it rewrites the functions
    // that run on the audio and UI worklet runtimes, and it needs to see the
    // output of every other transform.
    plugins: ['react-native-worklets/plugin'],
  };
};
