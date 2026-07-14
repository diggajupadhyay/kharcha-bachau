# Kharcha Bachau v0.4-beta - Smart Expense Tracker 🇳🇵

**App Name:** Kharcha Bachau (खर्च बचाउ)  
**Status:** Production Ready / Free  

Kharcha Bachau is a simple, smart, and free expense tracker designed for Nepal. Track your daily spending, manage monthly budgets, and analyze where your money goes.

---

## 🚀 Features

*   **100% Free:** No subscriptions, no hidden fees.
*   **Offline First:** Works perfectly without internet (Guest Mode).
*   **Cloud Sync:** Optional login to sync data across devices via Firebase.
*   **Smart Analytics:** Monthly comparisons and category breakdowns.

---

## 🛠 Deployment Guide (Firebase Hosting)

This app is optimized for **Firebase Hosting** (Free Spark Plan).

### Prerequisites
1.  **Node.js**: Installed on your machine.
2.  **Firebase CLI**: `npm install -g firebase-tools`
3.  **Firebase Project**: Create a project at [Firebase Console](https://console.firebase.google.com/)

### Step 1: Environment Setup

1. Create a `.env` file in the root directory with the following variables:
   ```bash
   # Firebase Configuration
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

2. Fill in your Firebase configuration:
   - Get your Firebase config from: Firebase Console > Project Settings > General > Your apps
   - Add your web app or use existing credentials
   - Replace all placeholder values with your actual Firebase project credentials
   - **Note**: All environment variables are required. The app will not start without them.

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Deploy Firestore Security Rules & Indexes
Deploy security rules and indexes to protect and optimize your database:
```bash
# Deploy rules only
npm run deploy:rules

# Deploy indexes only
npm run deploy:indexes

# Deploy both rules and indexes
npm run deploy:firestore
```
Or manually:
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only firestore
```

**Important**: Firestore indexes are required for queries. If you see "index required" errors, deploy indexes using the commands above.

### Step 4: Build
Compile the TypeScript/React code for production.
```bash
npm run build
```

### Step 5: Deploy
Upload to Firebase Hosting.
```bash
firebase login
npm run deploy
```
Or deploy only hosting:
```bash
npm run deploy:hosting
```

Your app will be live at `https://<your-project-id>.web.app`.

### Environment Variables

The app uses environment variables for Firebase configuration. In production, you can:

1. **Local Development**: Use `.env` file (gitignored)
2. **Firebase Hosting**: Set environment variables in Firebase Console > Hosting > Environment variables (if using build-time injection)
3. **CI/CD**: Set environment variables in your CI/CD pipeline

**Note**: Firebase config keys are public in client-side apps. Security is handled by Firestore Security Rules.

---

## 🔧 Troubleshooting

### Common Issues

#### 1. "Missing required Firebase environment variables" Error
**Problem**: App fails to start with environment variable error.

**Solution**:
- Ensure `.env` file exists in the root directory
- Verify all `VITE_FIREBASE_*` variables are set
- Check that variable names match exactly (case-sensitive)
- Restart the dev server after creating/updating `.env`

#### 2. "Permission denied" Error in Firestore
**Problem**: Cannot read/write data to Firestore.

**Solution**:
- Verify Firestore security rules are deployed: `npm run deploy:rules`
- Check that user is authenticated (not in guest mode)
- Ensure user's UID is in the `members` array for the wallet
- Review `firestorerules.txt` to understand access rules

#### 3. "Index required" Error
**Problem**: Query fails with "The query requires an index" error.

**Solution**:
- Deploy Firestore indexes: `npm run deploy:indexes`
- Or click the link in the error message to create the index in Firebase Console
- Wait for index creation to complete (can take a few minutes)

#### 4. Data Not Syncing Across Devices
**Problem**: Changes made on one device don't appear on another.

**Solution**:
- Ensure user is logged in (not in guest mode)
- Check internet connection
- Verify Firestore rules allow access
- Check browser console for errors

#### 5. "Network error" or "Unavailable" Errors
**Problem**: Firestore operations fail with network errors.

**Solution**:
- Check internet connection
- Verify Firebase project is active in Firebase Console
- Check if Firebase service is experiencing outages
- Try again after a few moments

#### 6. Google Sign-In Not Working
**Problem**: Cannot sign in with Google.

**Solution**:
- Verify Google Sign-In provider is enabled in Firebase Console
- Ensure the authorized domains list includes your hosting domain
- Check browser console for specific error messages
- Verify `VITE_FIREBASE_*` environment variables are correct
- Check that Google Sign-In is not blocked by a popup blocker

#### 7. Guest Data Not Syncing After Sign-In
**Problem**: Guest expenses don't appear after signing in with Google.

**Solution**:
- Data sync happens automatically on first sign-in
- If sync fails, guest data remains in localStorage
- Try signing out and back in to trigger sync again
- Check browser console for sync errors

### Debug Mode

In development mode, the app logs detailed information to the browser console:
- Firestore operations (create, read, update, delete)
- Authentication state changes
- Error details with error codes
- Data sync operations

Open browser DevTools (F12) and check the Console tab for debugging information.

### Getting Help

If you encounter issues not covered here:
1. Check browser console for error messages
2. Verify all deployment steps were completed
3. Review Firebase Console for service status
4. Ensure Firestore rules and indexes are deployed

---

## 👨‍💻 Tech Stack

*   **Frontend:** React 18, TypeScript, Tailwind CSS
*   **Build:** Vite
*   **Backend:** Firebase (Auth, Firestore)
*   **Charts:** Recharts
*   **Icons:** Lucide React

---

**© 2024 Kharcha Bachau**