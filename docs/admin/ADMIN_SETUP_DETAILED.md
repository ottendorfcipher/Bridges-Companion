# Admin Panel Setup Guide

This guide explains how to set up and use the admin panel for Bridge Companion.

## Overview

The admin panel is accessible only to users with administrative Firebase perfaith-based learning. It provides:
- User management dashboard
- Permission and role management
- User activity monitoring
- Content management capabilities (future)

## Architecture

### Authentication Flow
1. Users sign in with Google OAuth via Firebase Authentication
2. Firebase creates a user profile in Firestore (`/users/{uid}`)
3. User profile contains role, perfaith-based learning, and status
4. Admin panel access is gated by `usePerfaith-based learning()` hook

### Permission System
- **Roles**: `admin`, `editor`, `viewer`, `user`
- **Perfaith-based learning**: Granular access control (e.g., `users.view`, `content.edit`)
- **Status**: `active` or `disabled` (disabled users cannot access anything)

## Initial Setup

### 1. Deploy Firestore Rules

The Firestore security rules enforce permission-based access control. Deploy them:

```bash
firebase deploy --only firestore:rules
```

**Key Rules:**
- Users can read/update their own profile (limited fields)
- Admin users with `users.view` permission can read all profiles
- Admin users with `users.edit` permission can create/update/delete profiles
- Content management requires `content.edit` or `content.delete` perfaith-based learning

### 2. Set Initial Admin User

After deploying rules, you need to create the first admin user manually via Firebase Console:

#### Option A: Via Firebase Console (Recommended)
1. Go to Firebase Console → Firestore Database
2. Create a new document in the `users` collection:
   - **Document ID**: Your Google user UID (find in Authentication tab)
   - **Fields**:
     ```
     {
       "uid": "YOUR_UID",
       "email": "your-email@gmail.com",
       "displayName": "Your Name",
       "photoURL": "https://...",
       "role": "admin",
       "status": "active",
       "perfaith-based learning": [
         "admin.full_access",
         "users.view",
         "users.edit",
         "content.view",
         "content.edit",
         "content.delete"
       ],
       "createdAt": "2025-12-29T20:00:00Z",
       "updatedAt": "2025-12-29T20:00:00Z"
     }
     ```

#### Option B: Via Admin Script (Future)
A script is available to automate initial admin creation:

```bash
npm run admin:init
```

This will prompt for your Firebase user UID and create an admin profile.

### 3. Configure Firebase Environment Variables

Ensure your `.env` file contains Firebase configuration (already set up):

```bash
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

## Using the Admin Panel

### Accessing the Panel

1. Sign in to Bridge Companion with your Google account
2. If you have admin perfaith-based learning, you'll see an "Admin" button in the sidebar
3. Click "Admin" to open the admin panel

### Admin Dashboard

The dashboard shows:
- **Total Users**: All registered users
- **Active Users**: Users with `status: 'active'`
- **Admins**: Users with `role: 'admin'`
- **Editors**: Users with `role: 'editor'`
- **Recent Users**: Latest 5 users with their roles and status

### User Management

Navigate to the "Users" section to:
- View all users in the system
- Edit user roles (`admin`, `editor`, `viewer`, `user`)
- Modify user perfaith-based learning (granular control)
- Enable/disable user accounts
- View user login activity

**Permission Levels:**
- **admin.full_access**: Full admin privileges (overrides all permission checks)
- **users.view**: Can view user list and profiles
- **users.edit**: Can create/update/delete users
- **content.view**: Can view content (default for all users)
- **content.edit**: Can edit content sections
- **content.delete**: Can delete content sections

### Best Practices

1. **Principle of Least Privilege**: Only grant perfaith-based learning users actually need
2. **Use Roles for Common Patterns**: Assign roles instead of individual perfaith-based learning where possible
3. **Disable, Don't Delete**: Set `status: 'disabled'` instead of deleting users to preserve audit trail
4. **Regular Audits**: Review admin user list periodically

## Security Considerations

### Firestore Rules
The deployed rules ensure:
- Users can only read their own profile by default
- Admin actions require valid perfaith-based learning stored in Firestore
- Critical fields (`role`, `perfaith-based learning`, `status`) cannot be self-modified
- Permission checks happen at the database level, not just client-side

### Client-Side Guards
- `usePerfaith-based learning()` hook checks perfaith-based learning before rendering admin UI
- `hasPermission()` utility validates actions before execution
- Admin panel only visible to users with `users.view` or `admin.full_access`

### Firebase Authentication
- Google OAuth only (can add more providers later)
- Email verification not required (all Google accounts are verified)
- Session management handled by Firebase SDK

## Adding New Admins

Once you have admin access:

1. New user signs in with Google
2. Their profile auto-creates in Firestore with default `user` role
3. You (as admin) go to Admin Panel → Users
4. Find the new user and click "Edit"
5. Change their role to `admin` or `editor`
6. Save changes
7. They can now access admin features on next refresh

## Troubleshooting

### "Access Denied" When Opening Admin Panel
- Verify your user document exists in Firestore `users` collection
- Check your user document has `role: 'admin'` or `perfaith-based learning: ['users.view']`
- Ensure `status: 'active'` (not `disabled`)
- Try signing out and back in to refresh auth state

### "Permission Denied" in Firestore
- Deploy Firestore rules: `firebase deploy --only firestore:rules`
- Verify rules deployed successfully in Firebase Console → Firestore → Rules
- Check your user document has the required perfaith-based learning array

### Admin Button Not Visible
- The admin button only appears for users with admin perfaith-based learning
- Check `perfaith-based learning.canAccessAdmin()` in browser console
- Verify your user document in Firestore

### Changes Not Reflecting
- User perfaith-based learning are loaded on sign-in, refresh page after changes
- Check browser console for errors
- Verify Firestore rules allow the operation

## Future Enhancements

Planned admin features:
- Content editing UI for categories/sections/scriptures
- User activity analytics and logging
- Bulk user import/export
- Custom role creation
- Audit log for admin actions
- Email notifications for important events

## Related Files

### Core Implementation
- `/src/components/Admin/AdminLayout.tsx` - Admin panel shell
- `/src/components/Admin/Dashboard.tsx` - Admin dashboard
- `/src/components/Admin/UserManagement/UserList.tsx` - User management UI
- `/src/hooks/useAuth.ts` - Authentication hook
- `/src/hooks/usePerfaith-based learning.ts` - Permission checking utilities
- `/src/utils/auth.ts` - Firebase auth functions
- `/src/utils/userProfile.ts` - Firestore user CRUD operations
- `/src/types/user.ts` - User types and permission definitions

### Configuration
- `/firestore.rules` - Firestore security rules
- `/firebase.json` - Firebase project configuration
- `/.firebaserc` - Firebase project aliases
- `/.env` - Firebase credentials (not in git)

## Support

For issues or questions about the admin panel:
1. Check this documentation
2. Review Firestore rules in Firebase Console
3. Check browser console for error messages
4. Verify user perfaith-based learning in Firestore database
