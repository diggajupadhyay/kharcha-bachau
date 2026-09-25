#!/usr/bin/env bash
# Rebuild the Android TWA (AAB + APK). Run from anywhere.
#
# Bumps: edit appVersionCode/appVersionName in twa-manifest.json first, then
# run this script. The checksum file is regenerated so bubblewrap doesn't
# think the manifest was edited by hand.
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
echo ""
echo "Outputs: app-release-bundle.aab (Play Store) · app-release-signed.apk (direct install)"
