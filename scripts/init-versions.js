/**
 * Initialize Version Configuration in Firestore
 * 
 * This script sets up the initial version configuration with:
 * - currentVersion: '0.1.0' (published)
 * - draftVersion: '0.1.1' (draft for new edits)
 * 
 * Run this once after deploying Firestore rules.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// Firebase config - same as in src/config/firebase.ts
const firebaseConfig = {
  apiKey: "AIzaSyCMGjMxzs8H0K-WNJQ5SG0YgcN_o9EQR2I",
  authDomain: "bridge-companion.firebaseapp.com",
  projectId: "bridge-companion",
  storageBucket: "bridge-companion.firebasestorage.app",
  messagingSenderId: "785549933084",
  appId: "1:785549933084:web:5bbc8c14a4b1a0f6c2b2ca"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function initializeVersions() {
  try {
    console.log('🚀 Initializing version configuration...');
    
    // Check if config already exists
    const configRef = doc(db, 'appConfig', 'versionConfig');
    const configSnap = await getDoc(configRef);
    
    if (configSnap.exists()) {
      console.log('⚠️  Version config already exists:', configSnap.data());
      console.log('Skipping initialization to avoid overwriting existing data.');
      return;
    }
    
    // Create initial version config
    const initialConfig = {
      currentVersion: '0.1.0',
      draftVersion: '0.1.1',
      updatedAt: new Date().toISOString(),
    };
    
    await setDoc(configRef, initialConfig);
    console.log('✅ Version config created:', initialConfig);
    
    // Create initial published version document
    const currentVersionRef = doc(db, 'versions', '0.1.0');
    const currentVersionData = {
      versionId: '0.1.0',
      status: 'published',
      createdAt: new Date().toISOString(),
      createdBy: 'system',
      createdByName: 'system',
      publishedAt: new Date().toISOString(),
      publishedBy: 'system',
      publishedByName: 'system',
      description: 'Initial published version',
      changes: [],
      changeCount: 0,
    };
    
    await setDoc(currentVersionRef, currentVersionData);
    console.log('✅ Initial version 0.1.0 created');
    
    // Create initial draft version document
    const draftVersionRef = doc(db, 'versions', '0.1.1');
    const draftVersionData = {
      versionId: '0.1.1',
      status: 'draft',
      createdAt: new Date().toISOString(),
      createdBy: 'system',
      createdByName: 'system',
      publishedAt: null,
      publishedBy: null,
      publishedByName: null,
      description: 'Draft version for new edits',
      changes: [],
      changeCount: 0,
    };
    
    await setDoc(draftVersionRef, draftVersionData);
    console.log('✅ Initial draft version 0.1.1 created');
    
    console.log('');
    console.log('🎉 Version management system initialized successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Make edits in the app (as admin/editor with edit mode enabled)');
    console.log('2. View draft changes in Admin Panel > Versions');
    console.log('3. Publish the draft version to make changes live for all users');
    
  } catch (error) {
    console.error('❌ Error initializing versions:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the initialization
initializeVersions();
