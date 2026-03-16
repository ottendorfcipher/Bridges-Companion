import { useState } from 'react';
import { GlossaryEntry } from '@/types/layer1';
import styles from './Glossary.module.css';

export interface GlossaryProps {
  entries: GlossaryEntry[];
  onNavigateToPage?: (slug: string) => void;
}

/**
 * Glossary - Layer 1 Reference Section Component
 * 
 * From 02-tags-and-search.md:
 * - Alphabetical organization
 * - Short definitions
 * - Links to related concept pages
 * 
 * Implements progressive disclosure for large lists
 */
export function Glossary({ entries, onNavigateToPage }: GlossaryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  // Group entries by first letter
  const groupedEntries = entries.reduce((acc, entry) => {
    const letter = entry.sort_key.charAt(0).toUpperCase();
    if (!acc[letter]) {
      acc[letter] = [];
    }
    acc[letter].push(entry);
    return acc;
  }, {} as Record<string, GlossaryEntry[]>);

  // Get available letters
  const availableLetters = Object.keys(groupedEntries).sort();

  // Filter entries based on search
  const filteredEntries = searchTerm
    ? entries.filter(entry =>
        entry.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.definition.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : selectedLetter
    ? groupedEntries[selectedLetter] || []
    : entries;

  return (
    <div className={styles.glossary}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Glossary</h1>
        <p className={styles.subtitle}>
          Quick definitions of key terms and concepts
        </p>
      </div>

      {/* Search */}
      <div className={styles.searchContainer}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search terms..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search glossary"
        />
      </div>

      {/* Alphabet navigation */}
      {!searchTerm && (
        <nav className={styles.alphabetNav} aria-label="Filter by letter">
          <button
            className={`${styles.letterButton} ${!selectedLetter ? styles.active : ''}`}
            onClick={() => setSelectedLetter(null)}
          >
            All
          </button>
          {availableLetters.map((letter) => (
            <button
              key={letter}
              className={`${styles.letterButton} ${selectedLetter === letter ? styles.active : ''}`}
              onClick={() => setSelectedLetter(letter)}
            >
              {letter}
            </button>
          ))}
        </nav>
      )}

      {/* Entries */}
      <div className={styles.entriesList}>
        {filteredEntries.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No terms found matching "{searchTerm}"</p>
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <article key={entry.id} className={styles.entry} id={`term-${entry.id}`}>
              <dt className={styles.term}>{entry.term}</dt>
              <dd className={styles.definition}>
                {entry.definition}
                {entry.related_page_slug && entry.related_page_title && onNavigateToPage && (
                  <div className={styles.relatedLink}>
                    <button
                      className={styles.linkButton}
                      onClick={() => onNavigateToPage(entry.related_page_slug!)}
                    >
                      Learn more: {entry.related_page_title}
                    </button>
                  </div>
                )}
              </dd>
            </article>
          ))
        )}
      </div>

      {/* Count */}
      <div className={styles.count}>
        Showing {filteredEntries.length} of {entries.length} terms
      </div>
    </div>
  );
}
