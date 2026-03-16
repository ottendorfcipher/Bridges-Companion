import { useEffect, useId, useMemo, useState } from 'react';
import { markdownToHtml } from '@utils/markdown';
import { isLikelyUnschemedExternalUrl, normalizeHrefForNavigation } from '@utils/links';
import { ScriptureList } from '@components/ScriptureList/ScriptureList';
import styles from './ReferenceDrawer.module.css';

type ReferenceDrawerTab = {
  key: string;
  label: string;
  /**
   * Original authored content (typically markdown). Kept for backward compatibility.
   */
  markdown?: string;
  /**
   * Edited/render-ready HTML (preferred when present).
   */
  html?: string;
};

type ReferenceDrawerLink = {
  label: string;
  url: string;
};

function isScriptureLink(link: ReferenceDrawerLink): boolean {
  const rawUrl = String(link?.url || '').trim();
  const rawLabel = String(link?.label || '').trim();

  const normalized = rawUrl ? normalizeHrefForNavigation(rawUrl) : null;
  const href = normalized || rawUrl;

  let host = '';
  try {
    host = href ? new URL(href).hostname.toLowerCase() : '';
  } catch {
    host = '';
  }

  if (host === 'quran.com' || host.endsWith('.quran.com')) return true;
  if (host === 'biblegateway.com' || host.endsWith('.biblegateway.com')) return true;
  if (host === 'sunnah.com' || host.endsWith('.sunnah.com')) return true;

  const labelLower = rawLabel.toLowerCase();
  if (labelLower.startsWith("qur'an") || labelLower.startsWith('quran ')) return true;
  if (labelLower.includes('biblegateway')) return true;

  return false;
}

export type ReferenceDrawerPayload = {
  version: number;
  kind: 'reference-drawer';
  title: string;
  tabs: ReferenceDrawerTab[];
  links?: ReferenceDrawerLink[];
};

export const REFERENCE_PAYLOAD_PREFIX = '<!-- reference-drawer:v1 -->';

export function serializeReferencePayload(payload: ReferenceDrawerPayload): string {
  return `${REFERENCE_PAYLOAD_PREFIX}\n${JSON.stringify(payload)}`;
}

export function parseReferencePayload(content: string): ReferenceDrawerPayload | null {
  if (!content) return null;

  const trimmed = content.trimStart();
  if (!trimmed.startsWith(REFERENCE_PAYLOAD_PREFIX)) return null;

  const raw = trimmed.slice(REFERENCE_PAYLOAD_PREFIX.length).trimStart();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.kind !== 'reference-drawer') return null;
    if (!Array.isArray(parsed.tabs)) return null;
    return parsed as ReferenceDrawerPayload;
  } catch {
    return null;
  }
}

type ReferenceDrawerScripture = {
  id?: any;
  source?: string;
  reference?: string;
  text?: string;
  url?: string | null;
  emphasis?: string;
};

function mapTabKeyToSource(tabKey: string): string | null {
  // Our tabs are keyed by source.
  if (tabKey === 'quran') return 'quran';
  if (tabKey === 'bible') return 'bible';
  if (tabKey === 'hadith') return 'hadith';
  if (tabKey === 'tafsir') return 'tafsir';
  if (tabKey === 'other') return 'other';
  return null;
}

interface ReferenceDrawerProps {
  payload: ReferenceDrawerPayload;
  scriptures?: ReferenceDrawerScripture[];
}

export function ReferenceDrawer({ payload, scriptures = [] }: ReferenceDrawerProps) {
  const tabsetId = useId();
  const tabs = payload.tabs || [];

  const defaultKey = (() => {
    for (const t of tabs) {
      const hasHtml = typeof t.html === 'string' && t.html.trim().length > 0;
      const hasMd = typeof t.markdown === 'string' && t.markdown.trim().length > 0;
      if (hasHtml || hasMd) return t.key;

      const src = mapTabKeyToSource(t.key);
      if (src && scriptures.some((s) => s?.source === src)) return t.key;
    }
    return tabs[0]?.key ?? 'quran';
  })();

  const [activeKey, setActiveKey] = useState<string>(defaultKey);

  // Reset tab selection when the payload changes.
  useEffect(() => {
    setActiveKey(defaultKey);
  }, [payload, tabs, defaultKey]);

  const activeTab = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  const scripturesForActiveTab = useMemo(() => {
    const src = mapTabKeyToSource(activeKey);
    if (!src) return [];
    return (scriptures || []).filter((s) => s?.source === src);
  }, [scriptures, activeKey]);

  const activeHtml = useMemo(() => {
    const html = activeTab?.html;
    if (typeof html === 'string' && html.trim()) {
      return html;
    }

    const md = activeTab?.markdown ?? '';
    return markdownToHtml(md);
  }, [activeTab?.html, activeTab?.markdown]);

  const suppressActiveBody = useMemo(() => {
    // When we already show scripture callouts for the active tab, hide redundant "Key themes" / "passages" blocks
    // that are effectively just another scripture list.
    if (scripturesForActiveTab.length === 0) return false;

    const raw = `${String(activeTab?.markdown || '')}\n${String(activeTab?.html || '')}`.toLowerCase();
    if (!raw.trim()) return false;

    const needles = ['key themes', 'representative passages', 'relevant passages'];
    return needles.some((n) => raw.includes(n));
  }, [activeTab?.markdown, activeTab?.html, scripturesForActiveTab.length]);

  const isAllTabsEmpty = useMemo(() => {
    return tabs.every((t) => {
      const hasHtml = typeof t.html === 'string' && t.html.trim().length > 0;
      const hasMd = typeof t.markdown === 'string' && t.markdown.trim().length > 0;
      return !hasHtml && !hasMd;
    });
  }, [tabs]);

  const hasAnyScriptures = useMemo(() => {
    return Array.isArray(scriptures) && scriptures.length > 0;
  }, [scriptures]);

  const { nonScriptureLinks } = useMemo(() => {
    const links = payload.links || [];
    const filtered = links.filter((l) => {
      const hasValue = String(l?.label || '').trim() || String(l?.url || '').trim();
      if (!hasValue) return false;
      return !isScriptureLink(l);
    });
    return { nonScriptureLinks: filtered };
  }, [payload.links]);

  const hasAnyLinks = useMemo(() => {
    return nonScriptureLinks.some((l) => String(l?.label || '').trim() || String(l?.url || '').trim());
  }, [nonScriptureLinks]);

  const isEmpty = isAllTabsEmpty && !hasAnyLinks && !hasAnyScriptures;

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

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (tabs.length === 0) return;

    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    e.preventDefault();

    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const nextIdx = (idx + dir + tabs.length) % tabs.length;
    setActiveKey(tabs[nextIdx].key);

    const btn = document.getElementById(`${tabsetId}-tab-${tabs[nextIdx].key}`);
    (btn as HTMLButtonElement | null)?.focus();
  };

  if (isEmpty) {
    return <div className={styles.empty}>No references yet.</div>;
  }

  return (
    <div className={styles.referenceDrawer} onClickCapture={handleLinkClickCapture}>
      <div className={styles.tabBar} role="tablist" aria-label="Reference sections">
        {tabs.map((t, idx) => {
          const selected = t.key === activeKey;
          const tabId = `${tabsetId}-tab-${t.key}`;
          const panelId = `${tabsetId}-panel-${t.key}`;

          return (
            <button
              key={t.key}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              className={`${styles.tabButton} ${selected ? styles.active : ''}`}
              onClick={() => setActiveKey(t.key)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${tabsetId}-panel-${activeTab?.key ?? 'unknown'}`}
        role="tabpanel"
        className={styles.panel}
        aria-label={activeTab?.label}
      >
        {!suppressActiveBody && activeHtml.trim() && (
          <div className={styles.panelBody} dangerouslySetInnerHTML={{ __html: activeHtml }} />
        )}

        {/* Scripture references are shown under the matching tab only. */}
        {scripturesForActiveTab.length > 0 && (
          <div className={styles.callouts}>
            <ScriptureList
              scriptures={scripturesForActiveTab as any}
              title={activeKey === 'other' ? 'Sources' : 'Scripture References'}
            />
          </div>
        )}

        {nonScriptureLinks.length > 0 && (
          <div className={styles.links}>
            <h3 className={styles.linksTitle}>Links</h3>
            <ul className={styles.linksList}>
              {nonScriptureLinks.map((l) => (
                <li key={`${l.label}:${l.url}`} className={styles.linksItem}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className={styles.linksAnchor}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
