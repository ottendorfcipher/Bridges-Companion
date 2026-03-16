import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { useEditMode } from '@contexts/EditModeContext';
import { getPageIdBySlug } from '@utils/database';
import { getEffectivePageDetailForRender } from '@utils/contentPages';
import { getCurrentVersionKey, getDraftVersionKey } from '@utils/versionManagement';
import { applyContentEdits, getPageContentEdits, saveContentEdit } from '@utils/contentManagement';
import { markdownToHtml } from '@utils/markdown';
import { normalizeHrefForNavigation } from '@utils/links';
import {
  parseReferencePayload,
  serializeReferencePayload,
  type ReferenceDrawerPayload,
} from '@components/ReferenceDrawer/ReferenceDrawer';
import { ReferenceDrawer } from '@components/ReferenceDrawer/ReferenceDrawer';
import { ScriptureList } from '@components/ScriptureList/ScriptureList';
import { RichTextEditor } from '@components/RichTextEditor/RichTextEditor';
import styles from './ReferenceEditor.module.css';

interface ReferenceEditorProps {
  moduleSlug: string;
  basePageSlug: string;
  basePageTitle: string;
  /**
   * If true, enable editing even when global Edit Mode is off.
   * Intended for Admin CMS views.
   */
  forceEditMode?: boolean;
  /**
   * If true, hide the entire component when there are no references for the viewer.
   * (Admins can still see the editor controls.)
   */
  hideWhenEmpty?: boolean;
}

const DEFAULT_TAB_ORDER: Array<{ key: string; label: string }> = [
  { key: 'quran', label: "Qur'an" },
  { key: 'tafsir', label: 'Tafsir' },
  { key: 'hadith', label: 'Hadith' },
  { key: 'bible', label: 'Bible' },
  { key: 'other', label: 'Sources' },
];

function ensureTabSet(payload: ReferenceDrawerPayload): ReferenceDrawerPayload {
  const byKey = new Map(payload.tabs.map((t) => [t.key, t]));
  const tabs = DEFAULT_TAB_ORDER.map((t) => {
    const existing = byKey.get(t.key);
    return {
      key: t.key,
      label: t.label,
      markdown: existing?.markdown ?? '',
      html: existing?.html,
    };
  });

  return { ...payload, tabs };
}

function toEnDashRanges(raw: string): string {
  return raw.replace(/(\d)-(\d)/g, '$1–$2');
}

function inferScriptureFromLink(link: { url?: string; label?: string }): {
  source: 'quran' | 'bible' | 'hadith' | 'tafsir' | 'other';
  reference: string;
  url: string;
} | null {
  const rawUrl = String(link?.url || '').trim();
  if (!rawUrl) return null;

  const normalized = normalizeHrefForNavigation(rawUrl) || rawUrl;

  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();

  if (host === 'quran.com' || host.endsWith('.quran.com')) {
    const segs = u.pathname.split('/').filter(Boolean);
    const surah = segs[0] || '';
    const ayahSeg = segs[1] || '';

    if (/^\d+$/.test(surah) && ayahSeg && /^\d+(?:-\d+)?$/.test(ayahSeg)) {
      const ref = `Qur'an ${surah}:${toEnDashRanges(ayahSeg)}`;
      return { source: 'quran', reference: ref, url: u.toString() };
    }

    if (/^\d+$/.test(surah) && !ayahSeg) {
      const ref = `Qur'an ${surah}`;
      return { source: 'quran', reference: ref, url: u.toString() };
    }

    return { source: 'quran', reference: `Qur'an`, url: u.toString() };
  }

  if (host === 'biblegateway.com' || host.endsWith('.biblegateway.com')) {
    const search = u.searchParams.get('search');
    if (search) {
      const decoded = decodeURIComponent(search.replace(/\+/g, ' ')).trim();
      if (decoded) {
        return { source: 'bible', reference: toEnDashRanges(decoded), url: u.toString() };
      }
    }

    const label = String(link?.label || '').replace(/\s*\([^)]*\)\s*$/g, '').trim();
    if (label) {
      return { source: 'bible', reference: toEnDashRanges(label), url: u.toString() };
    }

    return { source: 'bible', reference: 'Bible', url: u.toString() };
  }

  if (host === 'sunnah.com' || host.endsWith('.sunnah.com')) {
    const seg = u.pathname.split('/').filter(Boolean)[0] || '';
    const m = seg.match(/^([a-z0-9_-]+):(\d+)$/i);
    if (m) {
      const collection = m[1].toLowerCase();
      const num = m[2];
      const labelMap: Record<string, string> = {
        bukhari: 'Sahih Bukhari',
        muslim: 'Sahih Muslim',
        tirmidhi: 'Jami` at-Tirmidhi',
        nasai: "Sunan an-Nasa'i",
        abudawud: 'Sunan Abi Dawud',
        ibnmajah: 'Sunan Ibn Majah',
        malik: "Muwatta Malik",
        riyadussalihin: 'Riyad as-Salihin',
      };
      const name = labelMap[collection] || collection;
      return { source: 'hadith', reference: `${name} ${num}`, url: u.toString() };
    }

    const label = String(link?.label || '').replace(/\s*\([^)]*\)\s*$/g, '').trim();
    if (label) {
      return { source: 'hadith', reference: label, url: u.toString() };
    }

    return { source: 'hadith', reference: 'Hadith', url: u.toString() };
  }

  return null;
}

export function ReferenceEditor({
  moduleSlug,
  basePageSlug,
  basePageTitle,
  forceEditMode = false,
  hideWhenEmpty = false,
}: ReferenceEditorProps) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const { editModeEnabled } = useEditMode();
  const includeDraft = permissions.canEditContent();

  const canEdit = permissions.canEditContent() && (editModeEnabled || forceEditMode);

  const referencePageSlug = useMemo(() => `layer2-${basePageSlug}`, [basePageSlug]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [referencePageId, setReferencePageId] = useState<number | null>(null);
  const [originalContent, setOriginalContent] = useState<string>('');
  const [effectiveContent, setEffectiveContent] = useState<string>('');
  const [scriptures, setScriptures] = useState<any[]>([]);

  const [isEditing, setIsEditing] = useState(false);
  const [activeEditKey, setActiveEditKey] = useState(DEFAULT_TAB_ORDER[0]?.key ?? 'quran');
  const [saving, setSaving] = useState(false);

  const payload = useMemo(() => {
    const parsed = parseReferencePayload(effectiveContent);
    if (!parsed) return null;
    return ensureTabSet(parsed);
  }, [effectiveContent]);

  const scripturesFromLinks = useMemo(() => {
    if (!payload?.links) return [] as any[];

    const out: any[] = [];

    for (const l of payload.links) {
      const rawUrl = String(l?.url || '').trim();
      const rawLabel = String(l?.label || '').trim();
      if (!rawUrl && !rawLabel) continue;

      const inferred = inferScriptureFromLink({ url: rawUrl, label: rawLabel });
      if (!inferred) continue;

      out.push({
        id: `link:${inferred.url}`,
        source: inferred.source,
        reference: inferred.reference,
        text: '',
        emphasis: 'callout',
        url: inferred.url,
      });
    }

    return out;
  }, [payload?.links]);

  const scripturesToShow = useMemo(() => {
    const merged: any[] = [];
    const seen = new Set<string>();

    const keyFor = (s: any) => {
      const rawUrl = String(s?.url || '').trim();
      const normalized = rawUrl ? normalizeHrefForNavigation(rawUrl) : null;
      const href = normalized || rawUrl;
      if (href) return `url:${href}`;
      return `ref:${String(s?.source || '')}:${String(s?.reference || '')}`;
    };

    for (const s of scriptures || []) {
      const k = keyFor(s);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(s);
    }

    for (const s of scripturesFromLinks || []) {
      const k = keyFor(s);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(s);
    }

    return merged;
  }, [scriptures, scripturesFromLinks]);

  const hasNonScriptureLinks = useMemo(() => {
    if (!payload?.links) return false;

    for (const l of payload.links) {
      const rawUrl = String(l?.url || '').trim();
      const rawLabel = String(l?.label || '').trim();
      if (!rawUrl && !rawLabel) continue;

      const normalized = rawUrl ? normalizeHrefForNavigation(rawUrl) : null;
      const href = normalized || rawUrl;

      let host = '';
      try {
        host = href ? new URL(href).hostname.toLowerCase() : '';
      } catch {
        host = '';
      }

      const isScripture =
        host === 'quran.com' ||
        host.endsWith('.quran.com') ||
        host === 'biblegateway.com' ||
        host.endsWith('.biblegateway.com') ||
        host === 'sunnah.com' ||
        host.endsWith('.sunnah.com');

      if (!isScripture) return true;
    }

    return false;
  }, [payload?.links]);

  const hasDrawerTabContent = useMemo(() => {
    if (!payload) return false;
    return payload.tabs.some((t) => {
      const hasHtml = typeof t.html === 'string' && t.html.trim().length > 0;
      const hasMd = typeof t.markdown === 'string' && t.markdown.trim().length > 0;
      return hasHtml || hasMd;
    });
  }, [payload]);

  const hasAnyReferenceContent = hasDrawerTabContent || hasNonScriptureLinks || scripturesToShow.length > 0;

  const editorInitialHtml = useMemo(() => {
    if (!payload) return '';
    const tab = payload.tabs.find((t) => t.key === activeEditKey) ?? payload.tabs[0];
    if (!tab) return '';
    if (typeof tab.html === 'string' && tab.html.trim()) return tab.html;
    return markdownToHtml(tab.markdown || '');
  }, [payload, activeEditKey]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    setEditError(null);

    const idRes = await getPageIdBySlug(referencePageSlug);
    const id = idRes.success && typeof idRes.data === 'number' ? idRes.data : null;
    setReferencePageId(id);

    if (!id) {
      setOriginalContent('');
      setEffectiveContent('');
      setScriptures([]);
      setLoading(false);
      return;
    }

    const detailRes = await getEffectivePageDetailForRender({
      moduleSlug,
      pageId: id,
      pageSlug: referencePageSlug,
      includeDraft,
    });

    if (!detailRes.success || !detailRes.data) {
      setLoadError(detailRes.error || 'Failed to load references');
      setOriginalContent('');
      setEffectiveContent('');
      setScriptures([]);
      setLoading(false);
      return;
    }

    setOriginalContent(detailRes.data.content || '');
    setScriptures((detailRes.data as any).scriptures || []);

    const currentKeyRes = await getCurrentVersionKey();
    const currentKey = currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

    const draftKeyRes = includeDraft ? await getDraftVersionKey() : null;
    const draftKey = includeDraft && draftKeyRes?.success && draftKeyRes.data ? draftKeyRes.data : null;

    const [currentEditsRes, draftEditsRes] = await Promise.all([
      getPageContentEdits(id, currentKey),
      draftKey ? getPageContentEdits(id, draftKey) : Promise.resolve(null),
    ]);

    const currentEdits = currentEditsRes?.success && currentEditsRes.data ? currentEditsRes.data : null;
    const draftEdits = draftEditsRes && draftEditsRes.success && draftEditsRes.data ? draftEditsRes.data : null;

    const baseForEdits = {
      id,
      title: detailRes.data.title,
      content: detailRes.data.content,
      purpose: detailRes.data.purpose || undefined,
    };

    const withPublished = applyContentEdits(baseForEdits, currentEdits);
    const withDraft = includeDraft ? applyContentEdits(withPublished, draftEdits) : withPublished;

    setEffectiveContent(withDraft.content || '');
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [moduleSlug, referencePageSlug, includeDraft]);

  const handleSaveTab = async (nextHtml: string) => {
    if (!user) return;
    if (!referencePageId) return;
    if (!payload) return;

    const nextPayload: ReferenceDrawerPayload = {
      ...payload,
      tabs: payload.tabs.map((t) => {
        if (t.key !== activeEditKey) return t;
        return {
          ...t,
          html: nextHtml,
        };
      }),
    };

    const nextContent = serializeReferencePayload(nextPayload);

    setSaving(true);

    const res = await saveContentEdit(
      referencePageId,
      moduleSlug,
      referencePageSlug,
      `${basePageTitle} (Reference)`,
      'content',
      originalContent,
      nextContent,
      user.uid,
      user.email || 'unknown',
      user.displayName || user.email || 'Unknown User'
    );

    if (!res.success) {
      setSaving(false);
      setEditError(res.error || 'Failed to save reference');
      return;
    }

    setSaving(false);
    setIsEditing(false);
    await load();
  };

  if (loading) {
    return <div className={styles.skeleton}>Loading…</div>;
  }

  if (loadError) {
    return (
      <div className={styles.error}>
        <p>{loadError}</p>
        <button type="button" onClick={load} className={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  if (!referencePageId) {
    return hideWhenEmpty && !canEdit ? null : <div className={styles.empty}>No references yet.</div>;
  }

  if (!payload) {
    return hideWhenEmpty && !canEdit ? null : <div className={styles.empty}>No references yet.</div>;
  }

  if (hideWhenEmpty && !canEdit && !hasAnyReferenceContent) {
    return null;
  }

  return (
    <div className={styles.container}>
      {canEdit && (
        <div className={styles.editorBar}>
          <button
            type="button"
            className={styles.editButton}
            onClick={() => {
              setEditError(null);
              setIsEditing((v) => !v);
            }}
          >
            {isEditing ? 'Done' : 'Edit'}
          </button>
        </div>
      )}

      {!isEditing && (
        <ReferenceDrawer
          payload={payload}
          scriptures={scripturesToShow as any}
        />
      )}

      {isEditing && (
        <div className={styles.inlineEditor}>
          {editError && <div className={styles.editError}>{editError}</div>}

          <div className={styles.tabRow} role="tablist" aria-label="Reference sections">
            {payload.tabs.map((t) => {
              const selected = t.key === activeEditKey;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`${styles.tabButton} ${selected ? styles.tabActive : ''}`}
                  onClick={() => setActiveEditKey(t.key)}
                  disabled={saving}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className={styles.editorBody}>
            <RichTextEditor
              key={activeEditKey}
              content={editorInitialHtml}
              onSave={handleSaveTab}
              onCancel={() => setIsEditing(false)}
              saving={saving}
            />

            {/* Show only scriptures relevant to the active tab while editing. */}
            {scripturesToShow.some((s: any) => s?.source === activeEditKey) && (
              <div className={styles.callouts}>
                <ScriptureList
                  scriptures={scripturesToShow.filter((s: any) => s?.source === activeEditKey) as any}
                  title={activeEditKey === 'other' ? 'Sources' : 'Scripture References'}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
