import { useState } from 'react';
import styles from './RevealCard.module.css';

export interface RevealCardProps {
  id: string;
  question: string;
  answer: string;
  onFeedback?: (id: string, gotIt: boolean) => void;
}

/**
 * RevealCard - Layer 1 Active Retrieval Component
 * 
 * Implements "Active Retrieval" strategy (Testing Effect - Roediger/Karpicke)
 * Blur/Reveal Patterns: Key answers obscured until tapped to force memory recall
 * 
 * State: Default = Obscured (Blurred text or "Tap to Reveal" overlay)
 * Interaction: Tap to reveal
 * Feedback: "Got it" (Green check ✓) vs "Review" (Refresh icon ↻)
 * 
 * Used for Practice & Language Modules
 * From core_changes_ui_12_28_25.pdf page 1 & 3
 */
export function RevealCard({ id, question, answer, onFeedback }: RevealCardProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [feedback, setFeedback] = useState<'got-it' | 'review' | null>(null);

  const handleReveal = () => {
    setIsRevealed(true);
  };

  const handleFeedback = (gotIt: boolean) => {
    setFeedback(gotIt ? 'got-it' : 'review');
    if (onFeedback) {
      onFeedback(id, gotIt);
    }
    
    // Reset after animation
    setTimeout(() => {
      setIsRevealed(false);
      setFeedback(null);
    }, 1500);
  };

  return (
    <div className={styles.card}>
      {/* Question */}
      <div className={styles.question}>
        <p>{question}</p>
      </div>

      {/* Answer Section */}
      <div className={styles.answerSection}>
        {!isRevealed ? (
          // Obscured State - Blur/Reveal Pattern
          <button
            className={styles.revealButton}
            onClick={handleReveal}
            aria-label="Tap to reveal answer"
          >
            <div className={styles.obscured} aria-hidden="true">
              <div className={styles.blurredText}>{answer}</div>
            </div>
            <span className={styles.revealPrompt}>
              <span className={styles.tapIcon} aria-hidden="true">👆</span>
              Tap to Reveal
            </span>
          </button>
        ) : (
          // Revealed State
          <div className={styles.revealed}>
            <div className={styles.answerText}>
              <p>{answer}</p>
            </div>

            {/* Feedback Buttons */}
            {!feedback && (
              <div className={styles.feedbackButtons}>
                <button
                  className={`${styles.feedbackButton} ${styles.gotIt}`}
                  onClick={() => handleFeedback(true)}
                  aria-label="I got it"
                >
                  <span className={styles.feedbackIcon} aria-hidden="true">✓</span>
                  Got it
                </button>
                <button
                  className={`${styles.feedbackButton} ${styles.review}`}
                  onClick={() => handleFeedback(false)}
                  aria-label="Need to review"
                >
                  <span className={styles.feedbackIcon} aria-hidden="true">↻</span>
                  Review
                </button>
              </div>
            )}

            {/* Feedback Confirmation */}
            {feedback && (
              <div className={`${styles.feedbackConfirm} ${styles[feedback]}`}>
                {feedback === 'got-it' ? '✓ Great job!' : '↻ Will review later'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
