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
const dspSourceRoot = path.join(workspaceRoot, 'packages', 'dsp-core', 'src');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.unstable_enablePackageExports = true;

const defaultResolveRequest = config.resolver.resolveRequest;

/**
 * The DSP core is authored as standards-compliant ESM, which means its relative
 * imports carry explicit `.js` extensions even though the files on disk are
 * `.ts`. Node and `tsc` both understand that convention; Metro does not, and
 * would look for a `.js` file that never exists.
 *
 * Rewriting the extension only for requests that originate inside the DSP
 * source keeps the rest of the app's resolution completely untouched.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath ?? '';
  if (moduleName.startsWith('.') && moduleName.endsWith('.js') && origin.startsWith(dspSourceRoot)) {
    const withoutExtension = moduleName.slice(0, -'.js'.length);
    return context.resolveRequest(context, withoutExtension, platform);
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
