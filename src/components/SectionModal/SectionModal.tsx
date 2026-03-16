import { useEffect, useMemo, useState } from 'react';
import { getSectionDetail } from '@utils/database';
import { isMarkdown, markdownToHtml } from '@utils/markdown';
import type { SectionDetail } from '@/types/database';
import { ReferenceDrawer, parseReferencePayload } from '../ReferenceDrawer/ReferenceDrawer';
import { ScriptureList } from '../ScriptureList/ScriptureList';
import { Icon } from '../Icon/Icon';
import styles from './SectionModal.module.css';

interface SectionModalProps {
  sectionId: number;
  sectionTitle: string;
  onClose: () => void;
}


function SectionContent({ content }: { content: string }) {
  const htmlContent = useMemo(() => {
    if (isMarkdown(content)) {
      return markdownToHtml(content);
    }
    return content;
  }, [content]);

  return <div className={styles.body} dangerouslySetInnerHTML={{ __html: htmlContent }} />;
}

export function SectionModal({ sectionId, sectionTitle, onClose }: SectionModalProps) {
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSection();
  }, [sectionId]);

  const loadSection = async () => {
    setLoading(true);
    setError(null);

    const result = await getSectionDetail(sectionId);
    if (result.success && result.data) {
      setSection(result.data);
    } else {
      setError(result.error || 'Failed to load content');
    }
    setLoading(false);
  };

  const referenceDrawerPayload = useMemo(() => {
    if (!section?.content) return null;
    return parseReferencePayload(section.content);
  }, [section?.content]);

  const modalTitle = referenceDrawerPayload?.title
    ? referenceDrawerPayload.title
    : sectionTitle;

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>{modalTitle}</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            <Icon name="x" size={24} />
          </button>
        </div>

        <div className={styles.content}>
          {loading && (
            <div className={styles.loading}>
              <div className="loading-skeleton" style={{ width: '100%', height: '200px' }} />
            </div>
          )}

          {error && (
            <div className={styles.error}>
              <p>{error}</p>
              <button onClick={loadSection}>Retry</button>
            </div>
          )}

          {section && !loading && (
            <>
              {referenceDrawerPayload ? (
                <ReferenceDrawer payload={referenceDrawerPayload} />
              ) : (
                <SectionContent content={section.content} />
              )}

              {referenceDrawerPayload && section.scriptures && section.scriptures.length > 0 && (
                <div className={styles.scriptures}>
                  <ScriptureList scriptures={section.scriptures} title="Scripture References" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
