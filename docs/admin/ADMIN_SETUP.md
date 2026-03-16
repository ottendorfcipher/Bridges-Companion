# Admin Panel Setup Guide

This guide explains how to set up and use the admin control panel with Firebase user perfaith-based learning.

## Features

- **Role-Based Access Control**: Users can be assigned roles (admin, editor, viewer, user)
- **Permission System**: Granular perfaith-based learning for different operations
- **User Management**: View, edit roles, and manage user status
- **Dashboard**: Overview statistics of users and activity
- **Firestore Integration**: User profiles stored in Firestore with security rules

## Initial Setup

### 1. Firebase Configuration

Make sure your Firebase project has:
- **Authentication**: Google OAuth enabled
- **Firestore**: Database created
- **Security Rules**: Deployed (see step 4)

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `firebase` - Client SDK
- `firebase-admin` - Admin SDK for setup scripts

### 3. Environment Variables

Ensure your `.env` file has all Firebase credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 4. Deploy Firestore Security Rules

Deploy the security rules to protect user data:

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase (if not done)
firebase init firestore

# Deploy security rules
firebase deploy --only firestore:rules
```

The `firestore.rules` file contains security rules that:
- Allow users to read their own profile
- Allow admins to read all profiles
- Allow users to create their own profile (default 'user' role)
- Allow admins/editors to update user roles
- Prevent privilege escalation

### 5. Create First Admin User

After signing in for the first time with your Google account:

1. **Get Service Account Key**:
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file securely (e.g., `serviceAccountKey.json`)

2. **Set Environment Variable**:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
   ```

3. **Run Admin Setup Script**:
   ```bash
   npm run admin:init your-email@example.com
   ```

This will promote your account to admin role with full perfaith-based learning.

## User Roles

### Admin
- Full access to all features
- Can view and edit all users
- Can promote/demote other users
- Can disable/enable accounts

### Editor
- Can view users
- Can edit content (future feature)
- Cannot modify user roles

### Viewer
- Read-only access to content
- Cannot edit anything

### User (Default)
- Basic content access
- No admin privileges

## Perfaith-based learning

| Permission | Description | Default Roles |
|-----------|-------------|---------------|
| `admin.full_access` | Superuser access | admin |
| `users.view` | View user list | admin, editor |
| `users.edit` | Edit user roles | admin |
| `content.view` | View content | all |
| `content.edit` | Edit content | admin, editor |
| `content.delete` | Delete content | admin |

## Using the Admin Panel

### Accessing the Panel

1. Sign in with an admin or editor account
2. Click the "Admin Panel" button in the sidebar
3. Navigate using the admin sidebar

### Dashboard

- View total users, active users, admins, and editors
- See recently joined users
- Quick stats overview

### User Management

- **Search Users**: Filter by name, email, or role
- **Change Roles**: Select new role from dropdown (for other users)
- **Toggle Status**: Disable/enable user accounts
- **View Details**: See user profile info and perfaith-based learning

### Managing Users

To change a user's role:
1. Go to Admin Panel → Users
2. Find the user in the list
3. Select new role from the dropdown
4. Changes are saved immediately

To disable a user:
1. Go to Admin Panel → Users
2. Find the user
3. Click the disable button (🚫)
4. User will be logged out and unable to access the app

## Security Considerations

### Service Account Key

- **Never commit** the service account key to version control
- Store it securely outside the project directory
- Rotate keys periodically
- Only use for admin setup, not in production code

### Firestore Rules

The security rules ensure:
- Users can only create profiles with 'user' role
- Only admins can elevate privileges
- Admins can't be created through the app (must use admin script)
- All admin operations require authentication

### Admin Script

The `setInitialAdmin.js` script:
- Requires Firebase Admin SDK credentials
- Should only be run locally by authorized personnel
- Can promote existing users or create new admin profiles
- Validates email format before making changes

## Troubleshooting

### "User profile not found" Error

After sign-in, if you see this error:
1. Check Firestore rules are deployed
2. Verify user signed in successfully
3. Check browser console for detailed errors

### "Permission denied" in Firestore

This means:
1. Security rules aren't deployed, or
2. User doesn't have required perfaith-based learning
3. Run `firebase deploy --only firestore:rules`

### Admin Button Not Showing

The admin button only shows for users with:
- Role of `admin` or `editor`, AND
- At least `users.view` permission

Check the user's role in Firestore:
```bash
firebase firestore:get users/USER_UID
```

### Can't Promote User to Admin

Make sure:
1. Service account credentials are set
2. User exists in Firebase Auth (has signed in)
3. Running script with correct email

## Development

### Running Locally

```bash
npm run dev
```

The admin panel is accessible at the same localhost URL after signing in with an admin account.

### Testing Different Roles

1. Create test accounts with different emails
2. Sign in with each account
3. Use admin script to assign different roles
4. Test permission boundaries

### Adding New Perfaith-based learning

1. Add permission to `Permission` type in `src/types/user.ts`
2. Update `ROLE_PERMISSIONS` mapping
3. Add permission check using `usePerfaith-based learning()` hook
4. Update Firestore rules if needed

## Production Deployment

Before deploying:

1. **Deploy Firestore Rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Set Admin Users**: Use the admin script for each admin

3. **Secure Service Account**: Don't deploy service account key

4. **Test Perfaith-based learning**: Verify all role/permission combinations

5. **Monitor Firestore**: Set up alerts for unusual activity

## Support

For issues or questions:
1. Check browser console for errors
2. Verify Firestore rules are deployed
3. Check user perfaith-based learning in Firestore
4. Review this documentation

## Next Steps

Future enhancements:
- Content management through admin panel
- Bulk user operations
- Activity logs and audit trail
- User invitation system
- Role customization UI
