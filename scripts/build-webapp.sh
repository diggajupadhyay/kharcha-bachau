#!/usr/bin/env bash
# Builds the web version of the app into dist/app so Firebase Hosting serves it at
# /app, with the landing page still at the root.
#
# There is no separate web codebase. This is the same React Native source as the
# Android app — same screens, same components, same design tokens — run through
# react-native-web. Anything genuinely platform-specific lives behind a `.web.tsx`
# twin of a native module, so each build carries only its own half.
#
#   ./scripts/build-webapp.sh
#
# Firebase config: Expo inlines EXPO_PUBLIC_FIREBASE_* into the bundle at build time.
# Those are the same values the landing page reads as VITE_FIREBASE_*, so the two
# builds are kept on one source of truth by mapping them here. Anything already
# exported wins, which is what CI does.
#
# Without them the web build still runs, in guest mode with no cloud sync.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/app"

if [ -f "$ROOT/.env" ]; then
  set -a; . "$ROOT/.env"; set +a
fi
for key in API_KEY AUTH_DOMAIN PROJECT_ID STORAGE_BUCKET MESSAGING_SENDER_ID APP_ID; do
  expo_var="EXPO_PUBLIC_FIREBASE_$key"
  vite_var="VITE_FIREBASE_$key"
  if [ -z "${!expo_var:-}" ] && [ -n "${!vite_var:-}" ]; then
    export "$expo_var=${!vite_var}"
  fi
done

cd "$ROOT/mobile"

rm -rf "$OUT"
# --clear matters: Metro caches transforms, and a transform baked in while the
# EXPO_PUBLIC_* values were unset keeps reading process.env at runtime forever. The
# values are inlined at build time, so a stale cache silently ships a build with no
# Firebase config and no error.
npx expo export --platform web --output-dir "$OUT" --clear

# Expo has no base-path option, so the exported HTML points at /_expo/... from the
# site root — where the landing page lives. Rewrite those references to /app/_expo/...
# so the bundle loads from under /app instead. Only index.html carries them: the
# export is a single-page app with one HTML file.
node -e '
const fs = require("fs");
const file = process.argv[1] + "/index.html";
let html = fs.readFileSync(file, "utf8");
const before = html;
html = html.replace(/(["'\''])(\/_expo\/)/g, "$1/app$2");   // script/src/href on the bundle
html = html.replace(/href="\//g, "href=\"/app/");              // favicon and friends
if (html === before) {
  console.error("WARNING: no absolute asset paths found — the /app rewrite may not apply.");
} else {
  fs.writeFileSync(file, html);
  console.log("Rewrote asset paths to /app");
}
' "$OUT"

# Expo copies everything in public/ into the export, which drags the landing
# site's /release download page along to /app/release. Nothing serves it there.
rm -rf "$OUT/release"

echo "Web app built into dist/app"