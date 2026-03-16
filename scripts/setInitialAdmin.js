#!/usr/bin/env node

/**
 * Set Initial Admin Script
 * 
 * Promotes a user to admin role in Firestore.
 * Usage: node scripts/setInitialAdmin.js <email>
 * 
 * This script requires Firebase Admin SDK credentials.
 * Set up a service account and download the JSON key file.
 * Then set the GOOGLE_APPLICATION_CREDENTIALS environment variable:
 * export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
  console.error('❌ Error: Email address is required');
  console.log('\nUsage: node scripts/setInitialAdmin.js <email>');
  console.log('Example: node scripts/setInitialAdmin.js admin@example.com');
  process.exit(1);
}

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  console.error('❌ Error: Invalid email format');
  process.exit(1);
}

async function setAdminRole() {
  try {
    // Initialize Firebase Admin
    console.log('🔧 Initializing Firebase Admin SDK...');
    
    // Check for service account credentials
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!serviceAccountPath) {
      console.error('❌ Error: GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
      console.log('\nPlease set it to the path of your Firebase service account key:');
      console.log('export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"');
      console.log('\nTo create a service account key:');
      console.log('1. Go to Firebase Console > Project Settings > Service Accounts');
      console.log('2. Click "Generate New Private Key"');
      console.log('3. Save the JSON file securely');
      process.exit(1);
    }

    // Load service account
    const serviceAccount = JSON.parse(readFileSync(resolve(serviceAccountPath), 'utf8'));
    
    initializeApp({
      credential: cert(serviceAccount),
    });

    const auth = getAuth();
    const db = getFirestore();

    // Find user by email
    console.log(`🔍 Looking up user: ${email}`);
    let user;
    try {
      user = await auth.getUserByEmail(email);
    } catch (error) {
      console.error(`❌ Error: User with email ${email} not found`);
      console.log('\nMake sure the user has signed in at least once.');
      process.exit(1);
    }

    console.log(`✓ Found user: ${user.displayName || user.email} (${user.uid})`);

    // Get current user profile from Firestore
    const userRef = db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log('⚠️  User profile not found in Firestore. Creating...');
      
      // Create new profile with admin role
      await userRef.set({
        email: user.email,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        role: 'admin',
        permissions: [
          'admin.full_access',
          'users.view',
          'users.edit',
          'content.view',
          'content.edit',
          'content.delete',
        ],
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      console.log('✅ Created user profile with admin role');
    } else {
      // Update existing profile to admin
      const currentData = userDoc.data();
      
      if (currentData.role === 'admin') {
        console.log('ℹ️  User is already an admin');
        process.exit(0);
      }

      await userRef.update({
        role: 'admin',
        permissions: [
          'admin.full_access',
          'users.view',
          'users.edit',
          'content.view',
          'content.edit',
          'content.delete',
        ],
        updatedAt: new Date().toISOString(),
      });

      console.log(`✅ Promoted user from '${currentData.role}' to 'admin'`);
    }

    // Ensure securityConfig exists and records an ownerUid (first admin wins).
    const securityRef = db.collection('appConfig').doc('securityConfig');
    const securityDoc = await securityRef.get();

    if (!securityDoc.exists) {
      await securityRef.set({
        lockdownEnabled: false,
        allowlistEmails: [],
        allowlistUids: [],
        ownerUid: user.uid,
        updatedAt: new Date().toISOString(),
        updatedByUid: user.uid,
        updatedByEmail: user.email || null,
      });
    } else {
      const sec = securityDoc.data() || {};
      if (!sec.ownerUid) {
        await securityRef.set(
          {
            ownerUid: user.uid,
            updatedAt: new Date().toISOString(),
            updatedByUid: user.uid,
            updatedByEmail: user.email || null,
          },
          { merge: true }
        );
      }
    }

    console.log('\n🎉 Success! User is now an admin.');
    console.log('\nThe user can now:');
    console.log('  • Access the admin panel');
    console.log('  • Manage user roles and permissions');
    console.log('  • View all users');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
setAdminRole();
