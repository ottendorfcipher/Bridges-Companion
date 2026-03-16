# Quick Start - Fix White Screen

The white screen you're seeing is **expected behavior** because Firebase isn't configured yet. The app now shows a helpful error message instead of a blank screen.

## Fix in 3 Steps

### Step 1: Create .env file
```bash
cp .env.example .env
```

### Step 2: Get Firebase Credentials

1. Go to https://console.firebase.google.com/
2. Create a new project (or use existing)
3. Click the **</>** icon to add a web app
4. Copy the configuration values

### Step 3: Add Credentials to .env

Open `.env` and paste your Firebase config:

```env
VITE_FIREBASE_API_KEY=your_actual_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123
```

### Step 4: Restart Dev Server

```bash
# Stop the current server (Ctrl+C)
npm run dev
```

## What You'll See Now

**Before configuring Firebase:**
- Login screen with error message
- Instructions showing you need to set up Firebase
- Links to setup documentation

**After configuring Firebase:**
- Login screen with "Sign in with Google" button
- Click button → Google OAuth popup
- After signing in → main app with your profile

## Still Need Help?

See the detailed setup guide:
```bash
open FIREBASE_SETUP.md
# or
cat FIREBASE_SETUP.md
```

## Why This Happened

The authentication system requires Firebase credentials to work. Without them, the app can't initialize Firebase SDK. We've now updated the error handling to show you exactly what's needed instead of a white screen.

## Next Steps

1. Configure Firebase (steps above)
2. Enable Google OAuth in Firebase Console
3. Test the authentication flow
4. Deploy your app

---

**TL;DR:** Copy `.env.example` to `.env`, add Firebase credentials, restart server.
