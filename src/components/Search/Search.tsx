import { useState } from 'react';
import { Icon } from '../Icon/Icon';
// import { searchSections } from '@utils/database'; // Not yet implemented
import styles from './Search.module.css';

interface SearchResult {
  id: number;
  title: string;
  content: string;
  categoryName: string;
  categorySlug: string;
}

interface SearchProps {
  onResultClick?: (sectionId: number, categorySlug: string) => void;
}

/**
 * Search Component - Fast local search across all content
 * Implements "Rapid Retrieval" for high-pressure situations
 */
export function Search({ onResultClick }: SearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);
    
    if (searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    
    // TODO: Implement actual database search
    // For now, mock results
    setTimeout(() => {
      setResults([]);
      setIsSearching(false);
    }, 300);
  };

  const handleResultClick = (result: SearchResult) => {
    if (onResultClick) {
      onResultClick(result.id, result.categorySlug);
    }
    setQuery('');
    setResults([]);
  };

  return (
    <div className={styles.search}>
      <div className={styles.searchInput}>
        <Icon name="search" size={20} />
        <input
          type="search"
          placeholder="Search topics..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className={styles.input}
        />
      </div>

      {query && results.length > 0 && (
        <div className={styles.results}>
          {results.map((result) => (
            <button
              key={result.id}
              className={styles.resultItem}
              onClick={() => handleResultClick(result)}
            >
              <div className={styles.resultTitle}>{result.title}</div>
              <div className={styles.resultCategory}>{result.categoryName}</div>
              <div className={styles.resultSnippet}>{result.content}</div>
            </button>
          ))}
        </div>
      )}

      {query && !isSearching && results.length === 0 && (
        <div className={styles.noResults}>No results found for "{query}"</div>
      )}
    </div>
  );
}
