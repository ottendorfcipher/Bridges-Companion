import { ScrollPosition } from '@/types/layer1';

/**
 * State Preservation - Layer 1 KLM-GOMS Optimization
 * 
 * Target: < 1 second for context switching
 * From core_changes_ui_12_28_25.pdf page 3-4
 * 
 * "If user leaves 'Compare' tab to check 'Scripture', returning to 'Compare' 
 * must restore exact scroll position"
 */

const SCROLL_POSITIONS_KEY = 'bridge_companion_scroll_positions';
const MAX_STORED_POSITIONS = 50; // Limit storage size
const POSITION_TTL = 3600000; // 1 hour in milliseconds

/**
 * Get all stored scroll positions
 */
function getStoredPositions(): Map<string, ScrollPosition> {
  try {
    const stored = localStorage.getItem(SCROLL_POSITIONS_KEY);
    if (!stored) return new Map();
    
    const positions: Array<[string, ScrollPosition]> = JSON.parse(stored);
    return new Map(positions);
  } catch (error) {
    console.error('Failed to load scroll positions:', error);
    return new Map();
  }
}

/**
 * Save scroll positions to localStorage
 */
function savePositions(positions: Map<string, ScrollPosition>): void {
  try {
    // Clean up old positions
    const now = Date.now();
    const cleaned = new Map<string, ScrollPosition>();
    
    for (const [key, pos] of positions.entries()) {
      if (now - pos.timestamp < POSITION_TTL) {
        cleaned.set(key, pos);
      }
    }
    
    // Limit size
    if (cleaned.size > MAX_STORED_POSITIONS) {
      const sorted = Array.from(cleaned.entries()).sort((a, b) => 
        b[1].timestamp - a[1].timestamp
      );
      const limited = new Map(sorted.slice(0, MAX_STORED_POSITIONS));
      localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(Array.from(limited.entries())));
    } else {
      localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(Array.from(cleaned.entries())));
    }
  } catch (error) {
    console.error('Failed to save scroll positions:', error);
  }
}

/**
 * Save scroll position for a page
 * Target: < 50ms execution time
 */
export function saveScrollPosition(pageId: number, element?: HTMLElement): void {
  const scrollY = element ? element.scrollTop : window.scrollY;
  const positions = getStoredPositions();
  
  positions.set(`page-${pageId}`, {
    pageId,
    scrollY,
    timestamp: Date.now()
  });
  
  savePositions(positions);
}

/**
 * Save scroll position for a category/module view
 */
export function saveCategoryScrollPosition(categorySlug: string, moduleSlug?: string): void {
  const key = moduleSlug ? `${categorySlug}-${moduleSlug}` : categorySlug;
  const scrollY = window.scrollY;
  const positions = getStoredPositions();
  
  positions.set(key, {
    pageId: 0, // Not a page, just a view
    scrollY,
    timestamp: Date.now()
  });
  
  savePositions(positions);
}

/**
 * Restore scroll position for a page
 * Target: < 100ms execution time (< 1 sec total for full restoration)
 */
export function restoreScrollPosition(pageId: number, element?: HTMLElement): boolean {
  const positions = getStoredPositions();
  const position = positions.get(`page-${pageId}`);
  
  if (!position) return false;
  
  // Use requestAnimationFrame for smooth restoration
  requestAnimationFrame(() => {
    if (element) {
      element.scrollTop = position.scrollY;
    } else {
      window.scrollTo({
        top: position.scrollY,
        behavior: 'auto' // Instant for < 1 sec target
      });
    }
  });
  
  return true;
}

/**
 * Restore scroll position for a category/module view
 */
export function restoreCategoryScrollPosition(categorySlug: string, moduleSlug?: string): boolean {
  const key = moduleSlug ? `${categorySlug}-${moduleSlug}` : categorySlug;
  const positions = getStoredPositions();
  const position = positions.get(key);
  
  if (!position) return false;
  
  requestAnimationFrame(() => {
    window.scrollTo({
      top: position.scrollY,
      behavior: 'auto'
    });
  });
  
  return true;
}

/**
 * Clear scroll position for a page
 */
export function clearScrollPosition(pageId: number): void {
  const positions = getStoredPositions();
  positions.delete(`page-${pageId}`);
  savePositions(positions);
}

/**
 * Clear all scroll positions
 */
export function clearAllScrollPositions(): void {
  try {
    localStorage.removeItem(SCROLL_POSITIONS_KEY);
  } catch (error) {
    console.error('Failed to clear scroll positions:', error);
  }
}

/**
 * Navigation state preservation
 */
const NAV_STATE_KEY = 'bridge_companion_nav_state';

export interface NavigationState {
  activeCategory: string | null;
  activeModule: string | null;
  activePage: string | null;
  lastVisited: number;
}

/**
 * Save navigation state
 */
export function saveNavigationState(state: Partial<NavigationState>): void {
  try {
    const current = getNavigationState();
    const updated = {
      ...current,
      ...state,
      lastVisited: Date.now()
    };
    localStorage.setItem(NAV_STATE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save navigation state:', error);
  }
}

/**
 * Get navigation state
 */
export function getNavigationState(): NavigationState {
  try {
    const stored = localStorage.getItem(NAV_STATE_KEY);
    if (!stored) {
      return {
        activeCategory: null,
        activeModule: null,
        activePage: null,
        lastVisited: Date.now()
      };
    }
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load navigation state:', error);
    return {
      activeCategory: null,
      activeModule: null,
      activePage: null,
      lastVisited: Date.now()
    };
  }
}

/**
 * Clear navigation state
 */
export function clearNavigationState(): void {
  try {
    localStorage.removeItem(NAV_STATE_KEY);
  } catch (error) {
    console.error('Failed to clear navigation state:', error);
  }
}

/**
 * React hook for automatic scroll position management
 */
export function useScrollPreservation(pageId: number, ref?: React.RefObject<HTMLElement>) {
  // This would be implemented as a React hook in actual use
  // For now, providing the utility functions
  return {
    save: () => saveScrollPosition(pageId, ref?.current ?? undefined),
    restore: () => restoreScrollPosition(pageId, ref?.current ?? undefined),
    clear: () => clearScrollPosition(pageId)
  };
}
