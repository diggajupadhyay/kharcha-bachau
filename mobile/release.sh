#!/usr/bin/env bash
# Build the React Native app and ship a release. Run from anywhere.
#
# Release flow: bump expo.version + expo.android.versionCode in mobile/app.json,
# then run this script, then `npm run deploy:hosting` from the repo root.
set -euo pipefail
cd "$(dirname "$0")"   # mobile/

export JAVA_HOME="${JAVA_HOME:-$HOME/.bubblewrap/jdk/amazon-corretto-17.0.20.10.1-linux-x64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.bubblewrap/android-sdk}"

# Sync app.json (versionCode/versionName/icons) into the android project.
npx expo prebuild --platform android --no-install

# prebuild wipes unrecognized files at the android/ root — restore the signing
# material from mobile/keystore/ (the durable home, gitignored) and re-apply the
# build.gradle signing patch.
mkdir -p android/app
cp keystore/release.keystore android/app/release.keystore
cp keystore/keystore.properties android/keystore.properties

# The release signing config is a hand-applied patch to android/app/build.gradle —
# prebuild can rewrite that file, so re-apply it if it went missing.
if ! grep -q "signingConfig signingConfigs.release" android/app/build.gradle; then
  echo "Re-applying release signing config…"
  python3 - << 'PYEOF'
path = 'android/app/build.gradle'
src = open(path).read()
config_block = '''    signingConfigs {
        release {
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
        debug {'''
if 'keystorePropertiesFile' not in src:
    src = src.replace('    signingConfigs {\n        debug {', config_block)
if 'signingConfig signingConfigs.release' not in src:
    src = src.replace(
        'signingConfig signingConfigs.debug\n            def enableShrinkResources',
        'signingConfig signingConfigs.release\n            def enableShrinkResources')
open(path, 'w').write(src)
print('signing config ensured')
PYEOF
fi

cd android

# AAB for the Play Store (all ABIs — Play generates per-device downloads).
./gradlew bundleRelease --no-daemon

# APK for direct install at /release/ — arm64 only, covering all modern devices,
# keeps the download ~30 MB instead of ~80 MB.
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon

# Ship: render the download page (served by Firebase at /release/) and deploy the
# APK to Cloudflare Workers static assets (forced-download header included).
VERSION=$(node -pe "require('../app.json').expo.version")
SIZE=$(numfmt --to=iec --suffix=B "$(stat -c%s app/build/outputs/apk/release/app-release.apk)")
mkdir -p ../../public/release
sed -e "s/@@VERSION@@/$VERSION/g" -e "s/@@SIZE@@/$SIZE/g" ../../release-page.html > ../../public/release/index.html
mkdir -p ../../release-cf/dist
cp app/build/outputs/apk/release/app-release.apk ../../release-cf/dist/kharcha-bachau-latest.apk
printf '/kharcha-bachau-latest.apk\n  Content-Disposition: attachment; filename="kharcha-bachau-latest.apk"\n' > ../../release-cf/dist/_headers
(cd ../../release-cf && npx wrangler deploy)

echo ""
echo "Release shipped: v$VERSION ($SIZE)"
echo "Next: npm run deploy:hosting  (from the repo root)"
