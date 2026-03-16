import { useState, useEffect } from 'react';
import { RevealCard } from '../RevealCard/RevealCard';
import styles from './Practice.module.css';

export interface PracticeItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  lastReviewed?: Date;
  reviewCount?: number;
}

export interface PracticeProps {
  items?: PracticeItem[];
}

/**
 * Practice View - Active Retrieval & Spaced Repetition
 * Implements the Testing Effect (Roediger/Karpicke)
 * 
 * Features:
 * - RevealCard components for active recall
 * - Spaced repetition tracking in localStorage
 * - "Review Later" bookmarking system
 */
export function Practice({ items = [] }: PracticeProps) {
  const [practiceItems, setPracticeItems] = useState<PracticeItem[]>(items);
  const [reviewStats, setReviewStats] = useState({ gotIt: 0, review: 0 });

  useEffect(() => {
    // Load practice items from localStorage if none provided
    if (items.length === 0) {
      const saved = localStorage.getItem('bridge-practice-items');
      if (saved) {
        try {
          setPracticeItems(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load practice items:', e);
        }
      }
    }
  }, [items]);

  const handleFeedback = (id: string, gotIt: boolean) => {
    // Update review stats
    setReviewStats(prev => ({
      gotIt: prev.gotIt + (gotIt ? 1 : 0),
      review: prev.review + (gotIt ? 0 : 1)
    }));

    // Update item review count and timestamp
    const updatedItems = practiceItems.map(item => {
      if (item.id === id) {
        return {
          ...item,
          lastReviewed: new Date(),
          reviewCount: (item.reviewCount || 0) + 1
        };
      }
      return item;
    });

    setPracticeItems(updatedItems);
    
    // Save to localStorage for spaced repetition
    try {
      localStorage.setItem('bridge-practice-items', JSON.stringify(updatedItems));
      
      // Also track which items need review
      if (!gotIt) {
        const reviewList = JSON.parse(localStorage.getItem('bridge-review-list') || '[]');
        if (!reviewList.includes(id)) {
          reviewList.push(id);
          localStorage.setItem('bridge-review-list', JSON.stringify(reviewList));
        }
      }
    } catch (e) {
      console.error('Failed to save practice data:', e);
    }
  };

  if (practiceItems.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>🎯</div>
        <h2>No Practice Items Yet</h2>
        <p>
          As you explore content, bookmark topics to add them to your practice queue.
          Active retrieval strengthens memory and understanding.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.practice}>
      <div className={styles.header}>
        <h1>Practice</h1>
        <p className={styles.subtitle}>
          Test your knowledge through active recall
        </p>
        
        {(reviewStats.gotIt > 0 || reviewStats.review > 0) && (
          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{reviewStats.gotIt}</span>
              <span className={styles.statLabel}>Got it</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{reviewStats.review}</span>
              <span className={styles.statLabel}>Review</span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.cards}>
        {practiceItems.map((item) => (
          <RevealCard
            key={item.id}
            id={item.id}
            question={item.question}
            answer={item.answer}
            onFeedback={handleFeedback}
          />
        ))}
      </div>
    </div>
  );
}
