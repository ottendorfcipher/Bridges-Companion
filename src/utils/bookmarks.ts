/**
 * Bookmark Management System
 * Implements spaced repetition and "Review Later" functionality
 */

export interface Bookmark {
  sectionId: number;
  categorySlug: string;
  sectionTitle: string;
  timestamp: number;
  reviewCount: number;
  lastReviewed: number | null;
}

const BOOKMARKS_KEY = 'bridge_companion_bookmarks';
const REVIEW_COUNTS_KEY = 'bridge_companion_review_counts';

/**
 * Get all bookmarks from localStorage
 */
export function getBookmarks(): Bookmark[] {
  try {
    const stored = localStorage.getItem(BOOKMARKS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    return [];
  }
}

/**
 * Check if a section is bookmarked
 */
export function isBookmarked(sectionId: number): boolean {
  const bookmarks = getBookmarks();
  return bookmarks.some(b => b.sectionId === sectionId);
}

/**
 * Add a bookmark
 */
export function addBookmark(bookmark: Omit<Bookmark, 'timestamp' | 'reviewCount' | 'lastReviewed'>): void {
  const bookmarks = getBookmarks();
  
  // Don't add duplicate
  if (bookmarks.some(b => b.sectionId === bookmark.sectionId)) {
    return;
  }
  
  const newBookmark: Bookmark = {
    ...bookmark,
    timestamp: Date.now(),
    reviewCount: 0,
    lastReviewed: null
  };
  
  bookmarks.push(newBookmark);
  saveBookmarks(bookmarks);
}

/**
 * Remove a bookmark
 */
export function removeBookmark(sectionId: number): void {
  const bookmarks = getBookmarks();
  const filtered = bookmarks.filter(b => b.sectionId !== sectionId);
  saveBookmarks(filtered);
}

/**
 * Toggle bookmark status
 */
export function toggleBookmark(bookmark: Omit<Bookmark, 'timestamp' | 'reviewCount' | 'lastReviewed'>): boolean {
  if (isBookmarked(bookmark.sectionId)) {
    removeBookmark(bookmark.sectionId);
    return false;
  } else {
    addBookmark(bookmark);
    return true;
  }
}

/**
 * Record a review (for spaced repetition tracking)
 */
export function recordReview(sectionId: number): void {
  const bookmarks = getBookmarks();
  const bookmark = bookmarks.find(b => b.sectionId === sectionId);
  
  if (bookmark) {
    bookmark.reviewCount++;
    bookmark.lastReviewed = Date.now();
    saveBookmarks(bookmarks);
  }
}

/**
 * Get bookmarks sorted by review priority
 * (Less reviewed items + older items = higher priority)
 */
export function getBookmarksByPriority(): Bookmark[] {
  const bookmarks = getBookmarks();
  
  return bookmarks.sort((a, b) => {
    // Sort by review count first (less reviewed = higher priority)
    if (a.reviewCount !== b.reviewCount) {
      return a.reviewCount - b.reviewCount;
    }
    
    // Then by last reviewed (older = higher priority)
    const aLastReviewed = a.lastReviewed || a.timestamp;
    const bLastReviewed = b.lastReviewed || b.timestamp;
    return aLastReviewed - bLastReviewed;
  });
}

/**
 * Get bookmarks that haven't been reviewed recently (for spaced repetition)
 */
export function getBookmarksForReview(daysSinceReview: number = 3): Bookmark[] {
  const bookmarks = getBookmarks();
  const cutoffTime = Date.now() - (daysSinceReview * 24 * 60 * 60 * 1000);
  
  return bookmarks.filter(b => {
    const lastTime = b.lastReviewed || b.timestamp;
    return lastTime < cutoffTime;
  });
}

/**
 * Save bookmarks to localStorage
 */
function saveBookmarks(bookmarks: Bookmark[]): void {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  } catch (error) {
    console.error('Error saving bookmarks:', error);
  }
}

/**
 * Clear all bookmarks (utility function)
 */
export function clearAllBookmarks(): void {
  localStorage.removeItem(BOOKMARKS_KEY);
  localStorage.removeItem(REVIEW_COUNTS_KEY);
}

/**
 * Export bookmarks (for backup/sharing)
 */
export function exportBookmarks(): string {
  const bookmarks = getBookmarks();
  return JSON.stringify(bookmarks, null, 2);
}

/**
 * Import bookmarks (from backup/sharing)
 */
export function importBookmarks(jsonString: string): boolean {
  try {
    const bookmarks = JSON.parse(jsonString);
    if (Array.isArray(bookmarks)) {
      saveBookmarks(bookmarks);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error importing bookmarks:', error);
    return false;
  }
}
