import { ReadingPath, ReadingPathType } from '@/types/layer1';
import styles from './ReadingPaths.module.css';

export interface ReadingPathsProps {
  paths: ReadingPath[];
  onNavigate: (slug: string) => void;
}

/**
 * ReadingPaths - Layer 1 Navigation Component
 * 
 * For Type A (Overview) pages - Non-linear jumps through content
 * From 00-architecture.md:
 * - Reading paths jump users non-linearly
 * - Suggested Paths: Foundations, Deeper, Practice
 * 
 * Appears at bottom of Type A pages per 03-page-templates.md
 */
export function ReadingPaths({ paths, onNavigate }: ReadingPathsProps) {
  if (paths.length === 0) return null;

  // Group paths by type
  const pathsByType = paths.reduce((acc, path) => {
    if (!acc[path.path_type]) {
      acc[path.path_type] = [];
    }
    acc[path.path_type].push(path);
    return acc;
  }, {} as Record<ReadingPathType, ReadingPath[]>);

  const pathTypeLabels: Record<ReadingPathType, { label: string; description: string; icon: string }> = {
    foundations: {
      label: 'Foundations',
      description: 'Start with the basics',
      icon: '📚'
    },
    deeper: {
      label: 'Go Deeper',
      description: 'Explore in detail',
      icon: '🔍'
    },
    practice: {
      label: 'Put into Practice',
      description: "Apply what you've learned",
      icon: '💬'
    }
  };

  return (
    <section className={styles.readingPaths} aria-labelledby="reading-paths-title">
      <h2 id="reading-paths-title" className={styles.title}>
        Suggested Learning Paths
      </h2>
      <p className={styles.description}>
        Choose a path based on your learning goals
      </p>

      <div className={styles.pathsGrid}>
        {(Object.keys(pathsByType) as ReadingPathType[]).map((pathType) => {
          const pathInfo = pathTypeLabels[pathType];
          const pathLinks = pathsByType[pathType];

          return (
            <div key={pathType} className={styles.pathCard}>
              <div className={styles.pathHeader}>
                <span className={styles.pathIcon} aria-hidden="true">
                  {pathInfo.icon}
                </span>
                <div>
                  <h3 className={styles.pathLabel}>{pathInfo.label}</h3>
                  <p className={styles.pathDescription}>{pathInfo.description}</p>
                </div>
              </div>

              <ul className={styles.pathLinks}>
                {pathLinks
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((path) => (
                    <li key={path.id}>
                      <button
                        className={styles.pathLink}
                        onClick={() => onNavigate(path.target_page_slug!)}
                        aria-label={`Go to ${path.target_page_title}`}
                      >
                        <span className={styles.linkIcon} aria-hidden="true">→</span>
                        {path.target_page_title}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
