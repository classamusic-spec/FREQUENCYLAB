// Metro configuration for the FREQUENCY LAB monorepo.
//
// The app consumes @frequencylab/dsp-core straight from TypeScript source, so
// there is no build step between editing the DSP and hearing it. That is why
// `resolverMainFields` puts `react-native` first — the package points that
// field at src/index.ts while `main` keeps pointing at the compiled output for
// Node (tests, offline rendering, CI).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
