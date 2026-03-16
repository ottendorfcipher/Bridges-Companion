# Admin Panel Quick Start

## What You Need to Do Right Now

Your Firebase project is configured and Firestore rules are deployed! Now you need to create your first admin user.

## Step 1: Sign In to Get Your User ID

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:5173 in your browser

3. Click "Sign in with Google"

4. After signing in, open browser console (F12) and run:
   ```javascript
   firebase.auth().currentUser.uid
   ```

5. Copy your UID (looks like: `xYz123AbC456...`)

## Step 2: Create Admin User in Firestore

1. Go to Firebase Console: https://console.firebase.google.com/project/g-bridges/firestore

2. Click "Start collection" (or go to existing `users` collection)

3. Collection ID: `users`

4. Document ID: **Paste your UID from Step 1**

5. Add these fields:

   | Field | Type | Value |
   |-------|------|-------|
   | uid | string | Your UID (same as document ID) |
   | email | string | your-email@gmail.com |
   | displayName | string | Your Name |
   | photoURL | string | (your Google photo URL or leave empty) |
   | role | string | `admin` |
   | status | string | `active` |
   | perfaith-based learning | array | Add these strings:<br>• `admin.full_access`<br>• `users.view`<br>• `users.edit`<br>• `content.view`<br>• `content.edit`<br>• `content.delete` |
   | createdAt | string | `2025-12-29T20:00:00Z` |
   | updatedAt | string | `2025-12-29T20:00:00Z` |

6. Click "Save"

## Step 3: Verify Admin Access

1. Go back to http://localhost:5173

2. Refresh the page (to load your new perfaith-based learning)

3. You should now see an "Admin" button in the sidebar

4. Click "Admin" to open the admin panel

## What's Available in Admin Panel

### Dashboard
- View total users, active users, admins, and editors
- See recently registered users
- Quick overview of system status

### User Management
- View all users
- Edit user roles and perfaith-based learning
- Enable/disable accounts
- Manage access levels

## Next Steps

- **Add more admins**: Once you're in the admin panel, you can invite others to sign in and then promote them to admin/editor roles
- **Test perfaith-based learning**: Try signing in as different users to verify permission levels work correctly
- **Customize**: Review `/docs/ADMIN_SETUP.md` for advanced configuration

## Troubleshooting

**Admin button doesn't appear?**
- Make sure you created the user document with your exact UID
- Verify `role: 'admin'` and `status: 'active'`
- Refresh the page after creating the document

**"Permission denied" errors?**
- Firestore rules were just deployed, they should be active
- Check Firebase Console → Firestore → Rules to verify they deployed
- Check browser console for specific error messages

**Can't find your UID?**
- Go to Firebase Console → Authentication → Users
- Your email should be listed with a User UID

## Support

Full documentation: `/docs/ADMIN_SETUP.md`

Firebase Console: https://console.firebase.google.com/project/g-bridges
