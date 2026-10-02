# Publishing Kharcha Bachau to Google Play — step by step

This is the complete path from the code in this repository to a live listing on Google Play,
written for someone who has never done it before. Budget a few hours the first time. Review
usually takes 1–3 days after you submit.

Read [Part 0](#part-0-what-you-already-have) first so you do not rebuild things that are already
finished.

---

## Part 0: What you already have

Everything below is already done and verified. You do **not** need to change any of it.

| Thing | Where | Status |
|---|---|---|
| The uploadable file | `mobile/android/app/build/outputs/bundle/release/app-release.aab` | Built, 29 MB, all 4 CPU types |
| The app icon (512×512) | `mobile/assets/icon.png` | Ready for upload |
| Store screenshots | `store-assets/01-…` to `08-…` | 8 images, exactly 1080×1920 (9:16) |
| Feature graphic | `store-assets/play-feature-graphic.png` | 1024×500, ready |
| Privacy policy page | `pages/Privacy.tsx`, live at `/privacy` | Updated |
| Version | `1.0.0`, version code `1` | Correct for a first release |
| Permissions the app asks for | 8, all standard | Audited — see the README |

**Two things you must confirm before you start:**

1. **The privacy policy is live at a real, public URL.** Play rejects a policy it cannot open.
   Whatever domain you publish the site on, the URL must load for Google without a login.
2. **The developer contact email works.** The privacy policy currently lists
   `dcozupadhyay@gmail.com`. Change it in `pages/Privacy.tsx` if you would rather use another
   address, and make sure someone reads it.

---

## Part 1: Create your Google Play developer account

This is a one-time cost of **US$25**. You only pay once, for life.

1. Go to <https://play.google.com/console>
2. Sign in with the Google account that should *own* the app. Use a personal account, not a
   company one you might lose.
3. Fill in the developer profile: your name, a public contact email, and a contact phone.
4. Pay the $25 by card.
5. Accept the Developer Program Agreement.

> **A warning that matters more than it looks.** Play verification checks your identity and may
> ask for documents (a driver's licence, a passport, a bank statement, or proof of business
> registration). This can take days. Do it first, before building anything, so it does not
> delay your launch.

---

## Part 2: Create the app in Play Console

1. In Play Console, click **Create app**.
2. Fill in:
   - **App name:** `Kharcha Bachau`
   - **Default language:** English
   - **App or game:** App
   - **Free or paid:** Free
3. Accept the declarations and click **Create app**.

Next to "App availability", choose **Closed** while you fill everything in. This hides the app
from the public but keeps it editable. You cannot edit the name, icon or some privacy answers
after your first release — get those right now.

---

## Part 3: Fill in the store listing

In Play Console: **Grow → Store presence → Main store listing**.

| Field | What to enter |
|---|---|
| App name | `Kharcha Bachau` (max 30 characters) |
| Short description | Max 80 characters. Suggested: *Track every expense offline. Split with friends and settle up. Built in Nepal.* |
| Full description | Max 4000 characters — the text below |
| App icon | Upload `store-assets/` — use `mobile/assets/icon.png` (512×512) |
| Feature graphic | Upload `store-assets/play-feature-graphic.png` (1024×500) |
| Phone screenshots | Upload at least 2; we have 8 ready in `store-assets/` |

### Full description to paste

```
Track what you spend, the way it actually happens — fast, offline, and in Nepali rupees.

Kharcha Bachau (खर्च बचाउ) is a small, fast expense tracker. Log an expense in a few taps, see
what you have left this month, and know at a glance whether you are on track.

WHAT IT DOES
• Add an expense with an amount, a category and an optional note
• See this month's total, your budget, and what is left
• Filter by today, this week, this month, last month, this year, or all time
• Search your past expenses by amount, category or note
• Create separate wallets for home, a trip, or anything else
• Split a bill with friends and see who owes whom
• Settle up with one tap, and undo if you change your mind
• Make your own categories with your own emoji

WORKS OFFLINE
The app does not need the internet. Everything you type is saved on your phone straight away.
Sign in when you want to and your data syncs across your devices.

SYNC IS OPTIONAL
You do not need an account to use this app. Stay signed out and your data stays on your phone,
where only you can see it. Sign in with Google and it syncs to the cloud so you can use more
than one device. Signing out never deletes your cloud data — there is a separate, clearly
labelled Delete my account button if you want that.

YOUR DATA IS YOURS
No ads. No analytics. No tracking. The app asks for no permissions beyond what it needs to talk
to the cloud, and you can delete everything with one tap in Settings.

BUILT IN NEPAL
Made in Nepal, usable anywhere.
```

### Screenshot captions

Play does not let you caption screenshots, so their order matters. Upload them in this order so
the first three tell the whole story:

1. `01-home-light.png` — the main screen with a budget and recent expenses
2. `02-add-expense-category.png` — picking a category
3. `03-add-expense-amount.png` — entering the amount
4. `04-wallets.png` — managing wallets
5. `05-settings.png` — settings
6. `06-export-and-restore.png` — export and restore
7. `07-home-dark.png` — dark theme
8. `08-add-category-dark.png` — dark theme

---

## Part 4: Answer the privacy questions

Play requires two separate things. Both must agree with each other and with the real app.

### 4a. Privacy policy URL

**Policy → App content → Privacy policy.** Paste the URL where your policy is live, for example
`https://your-domain.example/privacy`.

### 4b. Data safety form

**Policy → App content → Data safety.** Click **Start now** and answer honestly.

The app genuinely collects:

| Play question | Your answer |
|---|---|
| Does your app collect or share any user data? | **Yes** |
| Is any data collected encrypted in transit? | **Yes** |
| Do you provide a way to request data deletion? | **Yes** — Settings → Delete my account |
| Is data shared with third parties? | **Yes** — Google Firebase, for sign-in and sync |
| Is data collected for tracking or ads? | **No** |

For the data types, declare:

| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Personal info → Email address | Yes | Yes | App functionality | No |
| Personal info → Name | Yes | Yes | App functionality | No |
| Financial info → Purchase history | Yes | Yes | App functionality | No |
| App activity → Other in-app activity | Yes | Yes | App functionality | No |

**Do not claim** advertising ID, location, contacts, photos, audio, health or diagnostics —
the app requests none of these.

> Play compares your answers against the app's actual behaviour and against your privacy policy.
> If they disagree, you get a rejection. The answers above match `pages/Privacy.tsx`.

---

## Part 5: Set the target audience and content rating

### 5a. Target audience and content

**Policy → App content → Target audience and content.** You decide the age groups. The app has
no ads, no chat and no user-generated content, so if you choose an age group that includes
children you take on extra obligations (a Families Policy, stricter data rules).

**Recommended:** select **13 and over** only. That matches the privacy policy, which says the app
is intended for users aged 13 and over.

### 5b. News app declaration

**Policy → App content → News app.** Answer **No**. This is an expense tracker, not a news app.

### 5c. Content rating questionnaire

**Policy → App content → Content ratings.** Complete the IARC questionnaire.

Almost every question is "no" — no violence, no sexuality, no profanity, no gambling, no user
interaction beyond sharing with people you invite, no location sharing. The result will be
**Everyone** / PEGI 3 / ESRB Everyone, which is what you want.

---

## Part 6: Upload the app bundle

**Grow → Release → Testing → Internal testing** (start here — it is the fastest and needs no
review).

1. Click **Create new release**.
2. Drag in `mobile/android/app/build/outputs/bundle/release/app-release.aab`.
3. Play shows "App bundle uploaded". Click **Continue**.

### About signing — read this once

- The AAB in this repository is signed with your **release key**
  (`mobile/keystore/release.keystore`).
- If you leave **Play App Signing** switched **on** (the default), Google generates its own app
  signing key and uses yours only as an *upload* key. This is the recommended setup.
- **Never turn Play App Signing off without reading what you are doing.** If it is off, your
  release key becomes the permanent app key, and losing it means you can never update the app.

> **The single most important thing on this page:** back up
> `mobile/keystore/release.keystore` and `mobile/keystore/keystore.properties` somewhere safe
> and permanent. They are deliberately not in git. If you lose them you cannot publish an update
> to an existing app, and Play cannot restore them for you.

4. Enter release notes. Suggested text for v1.0.0:

   ```
   First release.

   • Log expenses with an amount, category and note
   • Monthly budget with progress and what is left
   • Filter by day, week, month or year, and search your history
   • Multiple wallets, splitting with friends, and settling up
   • Works offline; sign in with Google to sync across devices
   • Light and dark themes
   • Export to CSV, and restore from a JSON backup
   ```

5. Click **Save**, then **Start rollout to Internal testing**.

### Setting up the internal testing testers

Internal testing is limited to up to 100 testers and is **not** public, so it is the safe place
to make sure the upload really works.

1. **Testing → Internal testing → Testingers → Create email list.**
2. Add your own email address (and anyone else who should try it).
3. Open the opt-in link from the email you receive and click **Become a tester**.
4. Install the app from the Play link on your phone.

Install it and click through the app once. If it launches and your data loads, the bundle is
good.

---

## Part 7: Pre-launch report (optional but recommended)

**Release → Pre-launch report.** Play automatically tests your app on many real devices for a few
hours and flags crashes. It costs nothing and has caught real problems. Run it before you promote
the release.

---

## Part 8: Publish to production

Once internal testing has looked right:

1. **Testing → Internal testing → your release → Promote release.**
2. Choose **Production**.
3. Play shows the production pre-launch report and any outstanding declarations.
4. **Release → Production → Create new release.** Use the same `.aab`, or promote the internal
   build directly.
5. Add the release notes, click **Review release**, then **Start rollout to Production**.

### Roll out gradually — do not skip this

Instead of sending it to everyone at once, roll out to **10% → 50% → 100%**, waiting a day or
two at each step. Watch **Statistics** and **Vitals → Crashes / ANRs**. If crash rate climbs,
pause the rollout by setting the percentage back to 0.

### Production review

The first release goes through Google review, typically 1–3 days. Common reasons for rejection:

- Privacy policy URL does not load, or disagrees with the Data Safety form
- Screenshots that do not match what the app does
- Missing content rating or target audience
- An app that crashes during review

If you are rejected, the email tells you the exact reason and Play Console shows it under
**Policy → App content**. Fix it and press **Resubmit**.

---

## Part 9: Publishing future updates

For every update after the first one:

1. In `mobile/app.json`, **increment `versionCode`** — this is what Play orders releases by. It
   must go up every time, and it can never go back down.

   ```jsonc
   "android": {
     "versionCode": 2        // was 1
   }
   ```

2. Optionally bump `"version"` too (1.0.1, 1.1.0, …).
3. Rebuild and upload as in Part 6.

To rebuild:

```bash
cd mobile
./release.sh
```

That script regenerates the Android project, restores your signing files, builds both the `.aab`
and the `.apk`, and **verifies the signing certificate** before it lets the artifact be used — it
refuses to hand you a debug-signed build. Note that the script also uploads the APK to your
Cloudflare download page; if you only want the Play artifacts, run the Gradle command directly:

```bash
cd mobile/android
./gradlew bundleRelease
```

The new bundle lands in `mobile/android/app/build/outputs/bundle/release/`.

---

## Part 10: Quick troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Your bundle is invalid" | You uploaded the `.apk` instead of the `.aab`. Use the `.aab`. |
| "Version code 1 has already been used" | You already uploaded it. Increment `versionCode` in `app.json` and rebuild. |
| "App bundle targets a lower API level" | Not an issue here — the build targets API 36. |
| Privacy policy rejected | The URL did not load for Google, or contradicts the Data Safety form. |
| New version will not install over the old one | Different signing key. You must sign with the same key the app was first published with. |
| "You cannot edit this field" | Some fields lock after the first release. Only the title, icon and some privacy answers do. |
| Testers cannot see the app | Internal testers must accept the opt-in email, and the tester list must include them. |

---

## Where things are

| Path | What it is |
|---|---|
| `mobile/android/app/build/outputs/bundle/release/app-release.aab` | The file you upload to Play |
| `mobile/android/app/build/outputs/apk/release/app-release.apk` | Direct-install APK, for your website |
| `mobile/keystore/release.keystore` | Your signing key — **back this up** |
| `mobile/keystore/keystore.properties` | Your key passwords — **back this up** |
| `store-assets/` | Icon, feature graphic and screenshots |
| `pages/Privacy.tsx` | The privacy policy Play will read |
| `mobile/release.sh` | Builds both artifacts and verifies the signature |