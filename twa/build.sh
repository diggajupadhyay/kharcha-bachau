#!/usr/bin/env bash
# Rebuild the Android TWA (AAB + APK) and ship the release. Run from anywhere.
#
# Release flow: bump appVersionCode/appVersionName in twa-manifest.json, then
# run this script, then `npm run deploy:hosting` from the repo root.
#
# The APK downloads from Cloudflare (twa/release-cf) — Firebase Hosting's free
# plan forbids executable files, so it must NOT be inside public/.
set -euo pipefail
cd "$(dirname "$0")"

# Passwords live in keystore.properties (gitignored) — never commit them.
export BUBBLEWRAP_KEYSTORE_PASSWORD=$(grep '^storePassword=' keystore.properties | cut -d= -f2-)
export BUBBLEWRAP_KEY_PASSWORD=$(grep '^keyPassword=' keystore.properties | cut -d= -f2-)

NPMROOT=$(npm root -g)
node -e "
const shared = require('$NPMROOT/@bubblewrap/cli/dist/lib/cmds/shared.js');
const fs = require('fs');
fs.writeFileSync('manifest-checksum.txt', shared.computeChecksum(fs.readFileSync('twa-manifest.json')));
"

bubblewrap build --skipPwaValidation

# Ship: render the download page (served by Firebase at /release/) and deploy
# the APK to Cloudflare Workers static assets (forced-download header included).
VERSION=$(node -pe "require('./twa-manifest.json').appVersionName")
SIZE=$(numfmt --to=iec --suffix=B "$(stat -c%s app-release-signed.apk)")
mkdir -p ../public/release
sed -e "s/@@VERSION@@/$VERSION/g" -e "s/@@SIZE@@/$SIZE/g" release-page.html > ../public/release/index.html
mkdir -p release-cf/dist
cp app-release-signed.apk release-cf/dist/kharcha-bachau-latest.apk
printf '/kharcha-bachau-latest.apk\n  Content-Disposition: attachment; filename="kharcha-bachau-latest.apk"\n' > release-cf/dist/_headers
(cd release-cf && npx wrangler deploy)

echo ""
echo "Release shipped: v$VERSION ($SIZE)"
echo "Next: npm run deploy:hosting  (from the repo root)"
