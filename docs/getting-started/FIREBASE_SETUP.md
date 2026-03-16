# Firebase Authentication Setup Guide

## Overview
Firebase Authentication with Google OAuth has been successfully integrated into Bridge Companion. This guide will help you configure Firebase and test the authentication flow.

## Prerequisites
- Node.js 18+ and npm 9+ installed
- A Google account for Firebase Console access

## Step 1: Firebase Project Setup

### 1.1 Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard (you can disable Google Analytics if not needed)

### 1.2 Register Web App
1. In your Firebase project, click the **</>** (web) icon to add a web app
2. Give it a nickname (e.g., "Bridge Companion")
3. **Don't** check "Set up Firebase Hosting" (we'll deploy separately)
4. Click "Register app"
5. Copy the Firebase configuration object - you'll need these values next

### 1.3 Enable Google Authentication
1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Click on **Google** provider
3. Toggle "Enable" switch
4. Set support email (your email)
5. Click "Save"

### 1.4 Add Authorized Domains
1. In **Authentication** > **Settings** > **Authorized domains**
2. Localhost should already be there for development
3. When you deploy, add your production domain (e.g., `your-app.netlify.app`)

## Step 2: Configure Environment Variables

### 2.1 Create .env file
Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

### 2.2 Add Firebase Credentials
Open `.env` and replace the placeholder values with your actual Firebase configuration:

```env
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Where to find these values:**
- In Firebase Console, go to **Project Settings** (gear icon)
- Scroll to "Your apps" section
- Click on your web app
- Copy values from the config object

### 2.3 Verify .env is Gitignored
The `.env` file is already in `.gitignore` and will NOT be committed. This is correct - never commit credentials!

## Step 3: Install Dependencies & Run

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:5173`

## Step 4: Test Authentication Flow

### 4.1 Initial Load
- App should show **login screen** with Google sign-in button
- If you see Firebase configuration errors, double-check your `.env` file

### 4.2 Sign In
1. Click "Sign in with Google"
2. Google OAuth popup should appear
3. Select your Google account
4. Grant perfaith-based learning
5. You should be redirected to the main app

### 4.3 Verify User Profile
- **Desktop:** Check sidebar (left side) - you should see your profile photo, name, and sign-out button at the bottom
- **Mobile/Tablet:** Open hamburger menu - profile should appear at the bottom

### 4.4 Test Persistence
1. Refresh the page (F5 or Cmd+R)
2. You should remain signed in (no login screen)
3. Firebase stores auth token in browser IndexedDB

### 4.5 Test Offline Mode
1. While signed in, open DevTools (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Check "Offline" mode
4. Refresh page
5. App should still load with your profile (content accessible offline)

### 4.6 Sign Out
1. Click "Sign Out" button in profile section
2. You should be redirected to login screen
3. Auth token is cleared from browser

### 4.7 Test Offline Sign-In Attempt
1. Enable offline mode (DevTools)
2. Try to sign in
3. Should show error: "Internet connection required to sign in"

## Architecture Overview

### Component Hierarchy
```
App (wrapped with AuthProvider)
└── AuthProvider (manages auth state)
    ├── [Not authenticated] → LoginScreen
    └── [Authenticated]
        ├── Database initialization (SQLite)
        ├── MobileHeader
        ├── HamburgerMenu (+ UserProfile)
        ├── Sidebar (+ UserProfile)
        └── Main Content (Home/CategoryView)
```

### Key Files Created
- `src/config/firebase.ts` - Firebase initialization
- `src/contexts/AuthContext.tsx` - Auth state management
- `src/hooks/useAuth.ts` - Hook to access auth context
- `src/utils/auth.ts` - Sign-in/sign-out functions
- `src/types/user.ts` - User model and error types
- `src/types/env.d.ts` - TypeScript environment variable types
- `src/components/Auth/LoginScreen.tsx` - Login UI
- `src/components/Auth/UserProfile.tsx` - User profile display
- `.env.example` - Environment variable template

### Auth State Flow
1. App loads → AuthProvider initializes
2. Firebase checks for existing auth token (IndexedDB)
3. If authenticated → load user, show app
4. If not authenticated → show login screen
5. User signs in → Firebase handles OAuth flow
6. Auth state change triggers → user object updates in context
7. All components using `useAuth()` automatically re-render

## Troubleshooting

### "Missing required Firebase environment variables"
- Check that `.env` file exists in project root
- Verify all `VITE_FIREBASE_*` variables are set
- Restart dev server after changing `.env`

### "This domain is not authorized for sign-in"
- Go to Firebase Console → Authentication → Settings → Authorized domains
- Add `localhost` for development
- Add your deployment domain for production

### "Pop-up was blocked by your browser"
- Allow pop-ups for localhost in browser settings
- Alternative: Firebase also supports redirect-based auth (requires code changes)

### "User sees login screen even after signing in"
- Check browser console for errors
- Verify Firebase config values are correct
- Clear browser cache and IndexedDB
- Try incognito/private browsing mode

### Build Errors
```bash
# Run type checker
npm run type-check

# Run linter
npm run lint
```

Note: There are some pre-existing TypeScript warnings in the codebase (unrelated to auth). The auth system itself compiles cleanly.

## Production Deployment

### Before Deploying
1. **Add production domain** to Firebase authorized domains
2. **Set environment variables** in your hosting provider:
   - Netlify: Site settings → Environment variables
   - Vercel: Project settings → Environment Variables
   - GitHub Pages: Use GitHub Secrets + Actions

### Security Notes
- Firebase API keys are **safe to expose** client-side (they're meant for browser use)
- Domain restrictions protect your Firebase project
- Never commit `.env` to version control
- Use environment variables for production

## Future Enhancements

### Potential Features (Not Yet Implemented)
- User preferences stored per-account (currently local only)
- Bookmarks synced via Firebase Firestore
- Notes/annotations tied to user account
- Multi-device sync for reading progress
- Admin dashboard for content management

### Database Integration
Currently, user authentication and SQLite content database are separate:
- **Auth:** Firebase (user accounts)
- **Content:** SQLite in browser (apologetics content)

To add per-user data:
1. Enable Firestore in Firebase Console
2. Create collections keyed by `user.uid`
3. Add Firestore queries in relevant components

## Support
For issues with this authentication integration, check:
1. Browser console (F12) for errors
2. Firebase Console → Authentication → Users (verify user created)
3. DevTools → Application → IndexedDB → firebaseLocalStorage

## Quick Reference Commands

```bash
# Development
npm run dev              # Start dev server with HMR
npm run build            # Build for production
npm run preview          # Preview production build locally

# Code Quality
npm run type-check       # TypeScript type checking
npm run lint             # ESLint

# Database
npm run db:create        # Create new SQLite database
npm run migrate          # Run database migrations
npm run seed             # Seed database with content
```

---

**Congratulations!** Your Bridge Companion app now has secure Firebase authentication with Google OAuth. Users must sign in to access the offline content and apologetics resources.
