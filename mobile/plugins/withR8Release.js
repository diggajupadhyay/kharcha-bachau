const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Turn on R8 code shrinking and resource shrinking for release builds.
 *
 * React Native's gradle template defaults both to off, and the cost is large: with
 * them off, the release APK carried 32 MiB of dex across four classes*.dex files,
 * which pushed the APK to 38 MiB. Cloudflare Workers refuses static assets over
 * 25 MiB, and Firebase's Spark plan refuses executables outright, so without this
 * there is nowhere to host the download at all.
 *
 * This is written through a config plugin rather than by editing
 * android/gradle.properties, because android/ is generated — `expo prebuild`
 * rewrites it, so a hand edit would silently disappear on the next build. A plugin
 * is committed and reapplies on every prebuild.
 *
 * R8 removes unused code, so it relies on reflection being declared. The React
 * Native template's rules cover the reanimated and turbomodule entry points, and
 * Firebase and Play services ship their own consumer rules, but a release built with
 * this on has been run on a device before being published.
 */
const PROPERTIES = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

module.exports = function withR8Release(config) {
  return withGradleProperties(config, (cfg) => {
    const existing = new Set(
      cfg.modResults
        .filter((p) => p.type === 'property')
        .map((p) => p.key)
    );

    cfg.modResults = cfg.modResults.map((p) =>
      p.type === 'property' && p.key in PROPERTIES
        ? { type: 'property', key: p.key, value: PROPERTIES[p.key] }
        : p
    );

    for (const [key, value] of Object.entries(PROPERTIES)) {
      if (!existing.has(key)) {
        cfg.modResults.push({ type: 'property', key, value });
      }
    }

    return cfg;
  });
};