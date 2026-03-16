import { db } from './database';

/**
 * Migrate bookmarks with "Untitled" to use correct titles from database
 */
export async function migrateBookmarks(): Promise<void> {
  const BOOKMARKS_KEY = 'bridge_companion_bookmarks';
  const MIGRATION_KEY = 'bridge_companion_bookmarks_migrated_v2'; // Changed key to force re-run
  
  try {
    const stored = localStorage.getItem(BOOKMARKS_KEY);
    if (!stored) {
      localStorage.setItem(MIGRATION_KEY, 'true');
      return;
    }
    
    const bookmarks = JSON.parse(stored);
    let needsMigration = false;
    
    // Check if any bookmarks have missing/placeholder titles
    for (const bookmark of bookmarks) {
      const currentTitle = typeof bookmark.sectionTitle === 'string'
        ? bookmark.sectionTitle.replace(/<[^>]*>/g, '').trim()
        : '';

      if (!currentTitle || currentTitle === 'Untitled') {
        needsMigration = true;

        // Fetch the correct title from database
        const result = await db.getPageDetail(bookmark.sectionId);
        if (result.success && result.data) {
          const fixed = (result.data.title || 'Untitled').replace(/<[^>]*>/g, '').trim() || 'Untitled';
          bookmark.sectionTitle = fixed;
          console.log(`Migrated bookmark ${bookmark.sectionId}: "${fixed}"`);
        }
      }
    }
    
    if (needsMigration) {
      // Save the updated bookmarks
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
      console.log('Bookmark migration complete');
    }
    
    // Mark migration as complete
    localStorage.setItem(MIGRATION_KEY, 'true');
  } catch (error) {
    console.error('Error migrating bookmarks:', error);
  }
}
