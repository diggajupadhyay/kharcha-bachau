# Deploying

One codebase, two builds. There is no separate web application — the web version is
the same React Native source as Android, run through `react-native-web`, so the two are
identical by construction rather than by discipline. Anything genuinely
platform-specific lives behind a `.web.tsx` twin of a native module, so each build
carries only its own half and neither has conditionals littered through shared code.

```
kharchabachau.web.app/            landing page (Vite, repo root)
kharchabachau.web.app/app         the app, web build of the React Native source
kharchabachau.web.app/release     APK download page, stamped with the commit
<workers>.dev/kharcha-bachau-<sha>.apk
```

---

## What is different on web, and why

Five modules have no browser implementation. Each is a `.web.tsx` twin rather than a
branch inside the app:

| Module | On a phone | In a browser |
|---|---|---|
| Google sign-in | Credential Manager (`react-native-nitro-google-signin`) | `firebase/auth` popup |
| Export / restore | share sheet + `expo-file-system` | Blob download + `fetch` |
| Date picker | `@react-native-community/datetimepicker` | `<input type="date">` |
| Sign-in button | the library's native view | an equivalent built from the same tokens |
| Firebase app | reads `google-services.json` from the APK | `EXPO_PUBLIC_*` config at build time |

One build-level change matters more than all of them: **Expo's Metro config sets no
alias from `react-native` to `react-native-web`.** Without one, a web build resolves
`react-native` to the real native core, pulling in BatchedBridge and
TurboModuleRegistry, and the app dies on load with
`__fbBatchedBridgeConfig is not set`. `mobile/metro.config.js` forces the alias, guarded
to the `web` platform so an Android build resolves `react-native` exactly as before.

`mobile/src/lib/cloud.ts` also resolves its Firebase handles on first use instead of at
import. That is correct on a phone — a guest with no account should not start a cloud
client — and it is required in a browser, where initialisation is asynchronous and a
module-scope `getAuth` would run before the app exists and cache a broken client for the
life of the page.

---

## Running it locally

### The app, on a phone or emulator

```bash
cd mobile
npx expo start          # then press 'a' for Android
```

### The app, in a browser

```bash
cd mobile
npx expo start          # then press 'w'
```

### Building the web bundle

```bash
# Firebase config is optional; without it the build runs in guest mode.
npm run build:webapp        # writes dist/app
npm run build:all           # landing page first, then the web app
```

`build-webapp.sh` reads the repo-root `.env` and maps `VITE_FIREBASE_*` onto
`EXPO_PUBLIC_FIREBASE_*`, so the landing page and the app share one config file rather
than two that can drift apart.

### Two traps in that build, both of which fail silently

**Metro caches transforms, and `EXPO_PUBLIC_*` values are inlined at transform time.**
A module first built while the variables were unset keeps reading `process.env` at
runtime forever — where a browser has no `process`, so the config is simply `undefined`
and the app quietly runs as a guest with no cloud sync. There is no error anywhere.
`build-webapp.sh` therefore passes `--clear` to `expo export`. Keep it.

To confirm a build really has the config rather than trusting that it does:

```bash
grep -c "$(grep '^VITE_FIREBASE_PROJECT_ID=' .env | cut -d= -f2)" \
  dist/app/_expo/static/js/web/index-*.js
```

That must not be `0`. A `0` means the app shipped without cloud sync.

`build:all` runs them in that order on purpose: Vite empties `dist/` when it builds, so
the web app has to be written afterwards.

---

## Serving `/app` alongside the landing page

`firebase.json` rewrites, in order:

1. `/app` and `/app/**` → `/app/index.html`
2. everything else → `/index.html` (the landing page's SPA fallback)

Static files under `dist/app` are served before rewrites apply, so the bundle, fonts and
icons load normally and only unmatched paths fall through to `index.html`.

Expo has no base-path option, so `scripts/build-webapp.sh` rewrites the absolute `/_expo/`
references in the exported HTML to `/app/_expo/`. Without that the bundle would ask the
site root for its assets, where the landing page lives.

### Content Security Policy

The web build talks to Google endpoints and opens the sign-in popup, so the policy allows
more than the landing page needs:

- `connect-src` adds `securetoken.googleapis.com`, `firestore.googleapis.com`,
  `firebaseinstallations.googleapis.com` and `www.googleapis.com`
- `frame-src` adds `accounts.google.com`, which is the popup window itself

If sign-in fails in production with a blank popup, this policy is the first thing to check
— a blocked `frame-src` fails silently in the browser console.

---

## Continuous deployment

`.github/workflows/deploy.yml` runs on every push to the default branch (`master`).
Its jobs are deliberately ordered so nothing is published before it has been checked:

| Job | What it does |
|---|---|
| `check` | typecheck and the test suite |
| `web` | builds the landing page and the web app, uploads `dist/` |
| `deploy-hosting` | publishes `dist/` to Firebase Hosting |
| `android` | builds the `.aab` and `.apk`, uploads them as artifacts |
| `deploy-apk` | verifies the signing key, renders `/release/`, publishes the APK |

The APK is **not** uploaded to the Play Store by CI. That stays a manual step, so a
release is never pushed live by an automated run without a human deciding to do it.

### Required repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Required for | What it is |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | hosting | the service-account JSON for `firebase deploy` |
| `FIREBASE_PROJECT_ID` | hosting | e.g. `kharchabachau` |
| `CLOUDFLARE_API_TOKEN` | APK download | a Workers deploy token |
| `CLOUDFLARE_ACCOUNT_ID` | APK download | the Cloudflare account |
| `RELEASE_KEYSTORE_BASE64` | signed APK | `base64 -w0 mobile/keystore/release.keystore` |
| `KEYSTORE_PROPERTIES` | signed APK | the contents of `mobile/keystore/keystore.properties` |
| `GOOGLE_SERVICES_JSON` | signed APK | the contents of `mobile/google-services.json` |

**Read this before adding the signing secrets.** `RELEASE_KEYSTORE_BASE64` puts your
release signing key inside GitHub. That is the normal way to automate a release, and it is
why GitHub secrets are acceptable, but it is a real trade: anyone who can run the workflow
can produce a signed update to a published app, and a key leak means you must ask Google
for a reset. If you would rather keep the key off GitHub, leave the three signing secrets
unset — `android` still builds an unsigned bundle and uploads it as an artifact, and
`deploy-apk` is skipped. You then upload the signed build yourself.

The repository's `.env` is read by the `web` job for the `EXPO_PUBLIC_FIREBASE_*` values.
Those are public Firebase client keys by design; the Firestore rules, not the keys, are
the security boundary.

---

## Releasing a new Android version

1. Bump the version in `mobile/app.json`. **`versionCode` must increase every time** — Play
   rejects a repeat, and a code can never go back down.

   ```jsonc
   "android": { "versionCode": 2 }
   ```

2. Commit and push. CI builds `kharcha-bachau-<sha>.aab` and `.apk`.
3. Download the `android-release` artifact.
4. Upload the `.aab` to the Play Console — see [PLAY_STORE.md](PLAY_STORE.md).

### The `/release/` APK download

`mobile/release.sh` builds, verifies the signing certificate, renders the download page
and publishes the APK. It refuses to publish a debug-signed build, because such an APK
installs fine and then can never be updated in place — a problem that only surfaces much
later.

Every artifact is stamped with the short commit it was built from, and the page says so.
The APK is published under both its commit name and a `latest` alias, so links people have
already bookmarked keep working while the page links to the exact build.

```bash
cd mobile && ./release.sh
```

This also deploys to Cloudflare and prints a reminder to publish the hosting site.

### Losing the signing key

`mobile/keystore/release.keystore` is gitignored and has never been committed. Google
cannot restore it. If it is lost, ask Google Play support to reset your upload key —
possible, but slow and painful. Keep a backup somewhere durable.