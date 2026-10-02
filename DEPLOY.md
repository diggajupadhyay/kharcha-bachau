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
github.com/diggajupadhyay/kharcha-bachau/releases   the APK and AAB themselves
```

The site and the app are both on Firebase Hosting. The APK is not, and cannot be —
see [Where the APK lives](#where-the-apk-lives).

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

Two jobs: `check` runs the typecheck and tests, and `deploy` publishes the site only if
they pass. The deploy step asserts that the web bundle really has its Firebase config
inlined before uploading, because the failure mode is a guest-only build that looks
perfectly healthy.

Android is deliberately not in this workflow. The release signing key is not in the
repository and not in these secrets, so nothing in CI can produce an installable build.
Signed artifacts are published by `mobile/release.sh` on a machine that holds the key,
and the Play Store upload stays a manual step — so a release is never pushed live by an
automated run without a human deciding to do it.

### Required repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | What it is |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | the service-account JSON for `firebase deploy` |
| `FIREBASE_PROJECT_ID` | `kharchabachau` — note the spelling, it is not the same as the repo name |

Set with:

```bash
gh secret set FIREBASE_PROJECT_ID --body kharchabachau
gh secret set FIREBASE_SERVICE_ACCOUNT < .secrets/firebase-adminsdk.json
```

There are no signing secrets, and that is a decision rather than an omission. Putting
`RELEASE_KEYSTORE_BASE64` in GitHub would let the workflow produce signed updates to a
published app, and a leak would mean asking Google to reset your Play upload key. CI
deploys the site; `release.sh` publishes the binary. The key never leaves the machine.

The repository's `.env` is read by the deploy job for the `EXPO_PUBLIC_FIREBASE_*`
values. Those are public Firebase client keys by design; the Firestore rules, not the
keys, are the security boundary.

## Where the APK lives

On GitHub Releases, attached to a release tagged with the app version. That was not the
first choice, and the reasoning is worth keeping so nobody re-litigates it:

- **Cloudflare Workers static assets** cap at 25 MiB. The APK is 30 MiB. R8 shrinking
  took it from 38 MiB, and the remaining 18.65 MiB of arm64 native libraries do not
  compress, so no amount of further shrinking reaches the limit for an app of this shape.
- **Cloudflare R2** would work and has no per-file limit, but R2 is not enabled on the
  account — it needs activating in the dashboard, which involves a payment method.
  `release-cf/` was removed rather than left as dead configuration.
- **Firebase Hosting** rejects it outright: `Executable files are forbidden on the Spark
  billing plan`. This is the one that cannot be worked around by any means.

GitHub Releases have no such ceiling, are versioned by tag for free, and let a download
be traced to the exact commit it came from.

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

`mobile/release.sh` builds, verifies the signing certificate, creates the GitHub Release
and renders the download page. It refuses to publish a debug-signed build, because such an
APK installs fine and then can never be updated in place — a problem that only surfaces
much later.

Artifacts are named `kharcha-bachau-<version>-<short commit>`, so a file someone is
holding is identifiable, and the page shows the same commit. The release tag is the app
version, which means `/releases/latest/` always resolves to the newest build.

```bash
cd mobile && ./release.sh          # needs `gh auth login`
npm run deploy:hosting             # from the repo root, publishes the page
```

### Losing the signing key

`mobile/keystore/release.keystore` is gitignored and has never been committed. Google
cannot restore it. If it is lost, ask Google Play support to reset your upload key —
possible, but slow and painful. Keep a backup somewhere durable.