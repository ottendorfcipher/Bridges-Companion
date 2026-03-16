import { useEffect, useMemo, useState } from 'react';
import { usePermissions } from '@hooks/usePermissions';
import { getEffectiveCategoriesForRender } from '@utils/contentCatalog';
import { getEffectiveModulesForRender } from '@utils/contentCatalog';
import { getEffectivePagesForModuleSlug } from '@utils/contentPages';
import { ReferenceEditor } from '@components/ReferenceEditor/ReferenceEditor';
import { Icon } from '@components/Icon/Icon';
import styles from './ReferencesView.module.css';

type ReferenceIndexItem = {
  referencePageId: number;
  referencePageSlug: string;
  moduleSlug: string;
  moduleTitle: string;
  categoryName: string;
  basePageSlug: string;
  basePageTitle: string;
  pageNumber: number | null;
  displayOrder: number | null;
};

interface ReferencesViewProps {
  onNavigateHome?: () => void;
}

export function ReferencesView({ onNavigateHome }: ReferencesViewProps) {
  const permissions = usePermissions();
  const includeDraft = permissions.canEditContent();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReferenceIndexItem[]>([]);

  const [selected, setSelected] = useState<ReferenceIndexItem | null>(null);

  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadIndex();
  }, [includeDraft]);

  const loadIndex = async () => {
    setLoading(true);
    setError(null);

    const [catsRes, modsRes] = await Promise.all([
      getEffectiveCategoriesForRender({ includeDraft, includeHidden: true }),
      getEffectiveModulesForRender({ includeDraft, includeHidden: true }),
    ]);

    if (!catsRes.success || !catsRes.data) {
      setError(catsRes.error || 'Failed to load categories');
      setLoading(false);
      return;
    }

    if (!modsRes.success || !modsRes.data) {
      setError(modsRes.error || 'Failed to load modules');
      setLoading(false);
      return;
    }

    const categories = catsRes.data as any[];
    const modules = modsRes.data as any[];

    const catById = new Map<number, any>();
    for (const c of categories) {
      if (typeof c.id === 'number') catById.set(c.id, c);
    }

    const all: ReferenceIndexItem[] = [];

    for (const m of modules) {
      const pagesRes = await getEffectivePagesForModuleSlug({
        moduleSlug: String(m.slug),
        includeDraft,
        includeHidden: true,
        includeDeleted: false,
      });

      if (!pagesRes.success || !pagesRes.data) continue;

      const allPages = pagesRes.data as any[];
      const baseBySlug = new Map<string, any>();
      for (const p of allPages) {
        if (p.isHidden === true) continue;
        const slug = String(p.slug || '');
        if (!slug) continue;
        baseBySlug.set(slug, p);
      }

      const catName = (catById.get(m.category_id)?.name as string) || 'Category';

      for (const p of allPages) {
        const slug = String(p.slug || '');
        if (!slug.startsWith('layer2-')) continue;

        const baseSlug = slug.slice('layer2-'.length);
        const base = baseBySlug.get(baseSlug);

        all.push({
          referencePageId: p.id,
          referencePageSlug: slug,
          moduleSlug: String(m.slug),
          moduleTitle: String(m.title || m.slug),
          categoryName: catName,
          basePageSlug: baseSlug,
          basePageTitle: String(base?.title || baseSlug),
          pageNumber: typeof base?.page_number === 'number' ? base.page_number : null,
          displayOrder: typeof base?.display_order === 'number' ? base.display_order : null,
        });
      }
    }

    all.sort((a, b) => {
      if (a.categoryName !== b.categoryName) return a.categoryName.localeCompare(b.categoryName);
      if (a.moduleTitle !== b.moduleTitle) return a.moduleTitle.localeCompare(b.moduleTitle);
      const an = a.pageNumber ?? 9999;
      const bn = b.pageNumber ?? 9999;
      if (an !== bn) return an - bn;
      return a.basePageTitle.localeCompare(b.basePageTitle);
    });

    setItems(all);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.categoryName} ${it.moduleTitle} ${it.basePageTitle}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const originLabel = (it: ReferenceIndexItem) => {
    return `${it.categoryName} → ${it.moduleTitle} → ${it.basePageTitle}`;
  };


  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeleton}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadIndex}>Retry</button>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => {
              setSelected(null);
            }}
            aria-label="Back"
          >
            <Icon name="chevron-left" size={20} />
            Back
          </button>
        </div>

        <div className={styles.origin}>
          <div className={styles.originLabel}>Origin</div>
          <div className={styles.originValue}>{originLabel(selected)}</div>
        </div>

        <ReferenceEditor
          moduleSlug={selected.moduleSlug}
          basePageSlug={selected.basePageSlug}
          basePageTitle={selected.basePageTitle}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>References</h1>
        {onNavigateHome && (
          <button type="button" className={styles.secondaryButton} onClick={onNavigateHome}>
            Home
          </button>
        )}
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          placeholder="Search references…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>No references found.</div>
      ) : (
        <div className={styles.list}>
          {filtered.map((it) => (
            <button
              key={it.referencePageId}
              type="button"
              className={styles.row}
              onClick={() => {
                setSelected(it);
              }}
            >
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>{it.basePageTitle}</div>
                <div className={styles.rowMeta}>{originLabel(it)}</div>
              </div>
              <Icon name="chevron-right" size={18} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
