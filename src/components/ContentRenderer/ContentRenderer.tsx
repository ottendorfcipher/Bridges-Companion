import { useMemo } from 'react';
import { ContentRendererProps } from '@/types/components';
import { isLikelyUnschemedExternalUrl, normalizeHrefForNavigation } from '@utils/links';
import { ScriptureCallout } from '../Scripture/ScriptureCallout';
import { ScriptureInline } from '../Scripture/ScriptureInline';
// import { ContrastMatrix } from '../ContrastMatrix/ContrastMatrix'; // Unused
import styles from './ContentRenderer.module.css';

export function ContentRenderer({ content, scriptures }: ContentRendererProps) {
  // Check if online (simplified - in production use a proper hook)
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const handleLinkClickCapture = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const a = target?.closest('a') as HTMLAnchorElement | null;
    if (!a) return;

    const href = a.getAttribute('href') || '';
    if (!href) return;

    if (!isLikelyUnschemedExternalUrl(href)) return;

    const normalized = normalizeHrefForNavigation(href);
    if (!normalized) return;

    e.preventDefault();
    e.stopPropagation();
    window.open(normalized, '_blank', 'noopener,noreferrer');
  };

  const renderedContent = useMemo(() => {
    // Split content by scripture markers {{scripture:id}}
    const parts = content.split(/({{scripture:\d+}})/g);
    
    return parts.map((part, index) => {
      // Check if this part is a scripture marker
      const match = part.match(/{{scripture:(\d+)}}/);
      
      if (match) {
        const scriptureId = parseInt(match[1]);
        const scripture = scriptures.find(s => String(s.id) === String(scriptureId));
        
        if (!scripture) {
          // Scripture not found, return marker as-is for debugging
          return <span key={index} style={{ color: 'red' }}>{part}</span>;
        }
        
        // Render based on emphasis type
        if (scripture.emphasis === 'callout') {
          return <ScriptureCallout key={index} scripture={scripture} isOnline={isOnline} />;
        } else {
          return <ScriptureInline key={index} scripture={scripture} isOnline={isOnline} />;
        }
      }
      
      // Regular HTML content - render with dangerouslySetInnerHTML
      if (part.trim()) {
        return (
          <div 
            key={index} 
            dangerouslySetInnerHTML={{ __html: part }}
            style={{ display: 'inline' }}
          />
        );
      }
      
      return null;
    });
  }, [content, scriptures, isOnline]);

  return (
    <div className={styles.contentRenderer} onClickCapture={handleLinkClickCapture}>
      {renderedContent}
    </div>
  );
}
