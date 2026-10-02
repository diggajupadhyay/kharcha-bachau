// Metro configuration.
//
// Only one change from the Expo default, and it applies to the web platform only.
// `getDefaultConfig` sets no alias from `react-native` to `react-native-web`, so on a
// web build Metro resolved `react-native` to the real native core. That pulls in
// BatchedBridge, TurboModuleRegistry and NativeComponentRegistry, and the app dies
// on load with "__fbBatchedBridgeConfig is not set". Forcing the alias collapses the
// whole native tree out of the bundle and leaves react-native-web, which is the
// implementation that actually exists in a browser.
//
// The native platforms are deliberately untouched: the `platform` guard means an
// Android build resolves `react-native` exactly as it always did, which matters
// because the Play release is already signed and verified.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const defaultResolver = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'react-native' || moduleName.startsWith('react-native/'))) {
    // react-native-web mirrors the public API but not react-native's internal file
    // layout, so a deep path has no equivalent. Those imports only exist to reach
    // internals of a package that is already aliased; resolving them through the same
    // alias keeps the bundle consistent instead of resurrecting the native core.
    return context.resolveRequest(context, 'react-native-web', platform);
  }
  return defaultResolver
    ? defaultResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;