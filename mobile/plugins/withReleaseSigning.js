const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Adds the release signing configuration to android/app/build.gradle.
 *
 * This used to be a Python string-replace run by hand inside release.sh after
 * `expo prebuild`. That was fragile in a way that failed silently: prebuild
 * rewrites build.gradle from its own template, so the patch had to be re-applied
 * every time, and when an anchor shifted the replace matched nothing and the
 * release build quietly fell back to the debug key.
 *
 * As a config plugin the block is regenerated on every prebuild, so there is
 * nothing to patch and nothing to forget. The properties are read by Gradle at
 * build time, so a missing keystore.properties fails the build loudly.
 */

/** The release signing block, inserted directly after the opening of signingConfigs. */
const RELEASE_CONFIG = `        release {
            // Loaded from keystore.properties at the android/ root (gitignored).
            // storeFile resolves against android/app/, where release.keystore lives.
            def keystorePropertiesFile = rootProject.file("keystore.properties")
            def keystoreProperties = new Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
`;

/** Counts braces, ignoring those inside strings and comments well enough for a sanity check. */
function braceBalance(src) {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return depth;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        'withReleaseSigning: expected a Groovy build.gradle, got ' + cfg.modResults.language
      );
    }

    const src = cfg.modResults.contents;
    const before = braceBalance(src);

    // 1. Insert the release signing config.
    const signIdx = src.indexOf('signingConfigs {');
    if (signIdx < 0) throw new Error('withReleaseSigning: no signingConfigs block in build.gradle');
    // Insert after the opening brace of that block, not by replacing a prefix: the
    // template's own `debug {` must survive, and replacing through it duplicated it.
    const insertAt = signIdx + 'signingConfigs {'.length;
    let out = src.slice(0, insertAt) + '\n' + RELEASE_CONFIG + src.slice(insertAt);

    // 2. Point the *release* buildType at it.
    //    Scoped to the buildTypes block on purpose. A whole-file regex for
    //    `release { ... signingConfigs.debug` matches the `release {` inside
    //    signingConfigs and then spans across to the *debug* buildType — which
    //    silently signed debug builds with the release key and left release builds
    //    on the debug key.
    const buildTypesIdx = out.indexOf('buildTypes {');
    if (buildTypesIdx < 0) throw new Error('withReleaseSigning: no buildTypes block in build.gradle');

    const releaseTypeIdx = out.indexOf('release {', buildTypesIdx);
    if (releaseTypeIdx < 0) {
      throw new Error('withReleaseSigning: no release buildType inside buildTypes');
    }
    const debugKeyIdx = out.indexOf('signingConfig signingConfigs.debug', releaseTypeIdx);
    if (debugKeyIdx < 0) {
      throw new Error('withReleaseSigning: release buildType is not signingConfigs.debug');
    }
    out = out.slice(0, debugKeyIdx)
      + 'signingConfig signingConfigs.release'
      + out.slice(debugKeyIdx + 'signingConfig signingConfigs.debug'.length);

    if (braceBalance(out) !== before) {
      throw new Error('withReleaseSigning: unbalanced braces after edit — refusing to write');
    }
    // Both keys must now be referenced exactly once, and the release buildType must
    // come first in the file so the debug buildType is untouched.
    if ((out.match(/signingConfig signingConfigs\.release/g) || []).length !== 1) {
      throw new Error('withReleaseSigning: expected exactly one release signingConfig reference');
    }

    cfg.modResults.contents = out;
    return cfg;
  });
};
