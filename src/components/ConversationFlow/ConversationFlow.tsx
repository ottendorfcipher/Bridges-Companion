import { useState } from 'react';
// import { ConversationStep, ConversationStepType } from '@/types/layer1'; // Unused
import styles from './ConversationFlow.module.css';

export interface ConversationFlowProps {
  summary?: string;
  steps: Array<{
    id: string;
    whatYouHear: string;
    whatTheyMean: string;
    howToRespond: string;
    whenToPause?: string;
  }>;
}

/**
 * ConversationFlow - Layer 1 Type D (Conversation Guide)
 * 
 * Visual: Vertical step-progress line (Stepped Process)
 * Pattern: "Layer-Cake Pattern" (Headings) allows users to skip to 'Response' rapidly
 * 
 * Nodes:
 * 1. Quick Summary box (grey background) - Visual Anchors (core_changes PDF page 4)
 * 2. "What you hear" (Quote bubble)
 * 3. "What they mean" (Text block) 
 * 4. "How to respond" (Action block)
 * 5. "When to pause" (Optional)
 * 
 * Interaction: Tapping a step highlights it and dims others (Focus Mode)
 * From core_changes_ui_12_28_25.pdf page 3 - Logical Sequencing
 */
export function ConversationFlow({ summary, steps }: ConversationFlowProps) {
  const [focusedStep, setFocusedStep] = useState<string | null>(null);

  return (
    <div className={styles.conversationFlow}>
      {/* Layer 1: Quick Summary Box (grey background) - Visual Anchor */}
      {/* Every Type D page must start with this per core_changes PDF page 4 */}
      {summary && (
        <div className={styles.quickSummary} role="region" aria-label="Quick summary">
          <h3 className={styles.summaryTitle}>Quick Summary</h3>
          <p className={styles.summaryText}>{summary}</p>
        </div>
      )}

      {/* Conversation Steps */}
      <div className={styles.stepsContainer}>
        {steps.map((step, index) => {
          const isFocused = focusedStep === step.id;
          
          return (
            <div 
              key={step.id}
              className={`${styles.step} ${isFocused ? styles.focused : ''}`}
              onClick={() => setFocusedStep(isFocused ? null : step.id)}
              role="article"
              aria-label={`Step ${index + 1}`}
            >
              {/* Progress Indicator */}
              <div className={styles.progressLine}>
                <div className={styles.progressNode}>
                  <span className={styles.stepNumber}>{index + 1}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className={styles.connector} />
                )}
              </div>

              {/* Step Content - Focus Mode: tapping highlights and dims others */}
              <div className={styles.stepContent}>
                {/* Node 1: What you hear (Quote bubble) */}
                <div className={styles.section}>
                  <h4 className={styles.sectionHeading}>
                    <span className={styles.icon} aria-hidden="true">💬</span>
                    What You May Hear
                  </h4>
                  <div className={styles.quoteBubble}>
                    <p>{step.whatYouHear}</p>
                  </div>
                </div>

                {/* Node 2: What they mean (Text block) */}
                <div className={styles.section}>
                  <h4 className={styles.sectionHeading}>
                    <span className={styles.icon} aria-hidden="true">🤔</span>
                    What People Often Mean
                  </h4>
                  <div className={styles.textBlock}>
                    <p>{step.whatTheyMean}</p>
                  </div>
                </div>

                {/* Node 3: How to respond (Action block) */}
                <div className={styles.section}>
                  <h4 className={styles.sectionHeading}>
                    <span className={styles.icon} aria-hidden="true">💡</span>
                    Ways to Respond Respectfully
                  </h4>
                  <div className={styles.actionBlock}>
                    <p>{step.howToRespond}</p>
                  </div>
                </div>

                {/* Node 4: When to pause (Optional) */}
                {step.whenToPause && (
                  <div className={styles.section}>
                    <h4 className={styles.sectionHeading}>
                      <span className={styles.icon} aria-hidden="true">⏸️</span>
                      When to Pause
                    </h4>
                    <div className={styles.cautionBlock}>
                      <p>{step.whenToPause}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
