import { useEffect, useState } from 'react';
import { getEffectiveCategoriesForRender, getEffectiveModulesForRender } from '@utils/contentCatalog';
import {
  getEffectivePageDetailForRender,
  getEffectivePagesForModuleSlug,
  type EffectivePageSummary,
} from '@utils/contentPages';
import { applyContentEdits, getModuleContentEdits, getPageContentEdits } from '@utils/contentManagement';
import { getDraftVersionKey, getCurrentVersionKey } from '@utils/versionManagement';
import { usePermissions } from '@hooks/usePermissions';
import type { CategoryWithSections, SectionDetail } from '@/types/database';
import { Accordion } from '../Accordion/Accordion';
import { EditableContent } from '../EditableContent/EditableContent';
import { ReferenceEditor } from '../ReferenceEditor/ReferenceEditor';
import styles from './CategoryView.module.css';

interface CategoryViewProps {
  slug: string;
  expandSectionId?: number | null;
  onNavigateHome?: () => void;
  onNavigateToCategory?: () => void;
}

export function CategoryView({ slug, expandSectionId, onNavigateHome, onNavigateToCategory }: CategoryViewProps) {
  const permissions = usePermissions();
  const canIncludeDraft = permissions.canEditContent();
  const [category, setCategory] = useState<CategoryWithSections | null>(null);
  const [originalCategory, setOriginalCategory] = useState<CategoryWithSections | null>(null);
  const [sectionDetails, setSectionDetails] = useState<Map<number, SectionDetail>>(new Map());
  const [originalSectionDetails, setOriginalSectionDetails] = useState<Map<number, SectionDetail>>(new Map());
  const [contentEdits, setContentEdits] = useState<Map<number, string>>(new Map());
  const [titleEdits, setTitleEdits] = useState<Map<number, string>>(new Map());
  const [remoteTitleEdits, setRemoteTitleEdits] = useState<Map<number, string>>(new Map());
  const [draftTitleEditedSectionIds, setDraftTitleEditedSectionIds] = useState<Set<number>>(new Set());
  const [draftEditFieldsByPage, setDraftEditFieldsByPage] = useState<
    Map<number, Set<'title' | 'content' | 'purpose'>>
  >(new Map());
  const [categoryDraftEditFields, setCategoryDraftEditFields] = useState<Set<'title' | 'content' | 'purpose'>>(
    new Set()
  );
  const [categoryTitleEditedLocally, setCategoryTitleEditedLocally] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCategory();
  }, [slug, canIncludeDraft]);

  useEffect(() => {
    const handler = () => {
      loadCategory();
    };

    window.addEventListener('bridge:content-catalog-changed', handler);
    window.addEventListener('bridge:content-pages-changed', handler);
    return () => {
      window.removeEventListener('bridge:content-catalog-changed', handler);
      window.removeEventListener('bridge:content-pages-changed', handler);
    };
  }, [slug, canIncludeDraft]);
  

  const loadCategory = async () => {
    setLoading(true);
    setError(null);
    setSectionDetails(new Map());
    setOriginalSectionDetails(new Map());
    setRemoteTitleEdits(new Map());
    setDraftTitleEditedSectionIds(new Set());
    setDraftEditFieldsByPage(new Map());
    setCategoryDraftEditFields(new Set());
    setCategoryTitleEditedLocally(false);

    // Determine versions:
    // - Everyone sees currentVersion edits as the base.
    // - Users with edit permissions see draftVersion edits layered on top.
    const includeDraft = canIncludeDraft;

    const [modulesRes, categoriesRes, pagesRes] = await Promise.all([
      getEffectiveModulesForRender({ includeDraft, includeHidden: true }),
      getEffectiveCategoriesForRender({ includeDraft, includeHidden: true }),
      getEffectivePagesForModuleSlug({ moduleSlug: slug, includeDraft, includeHidden: false }),
    ]);

    if (!modulesRes.success || !modulesRes.data) {
      setError(modulesRes.error || 'Failed to load module');
      setLoading(false);
      return;
    }

    const mod = modulesRes.data.find((m) => m.slug === slug);
    if (!mod) {
      setError('Module not found');
      setLoading(false);
      return;
    }

    const cats = categoriesRes.success && categoriesRes.data ? categoriesRes.data : [];
    const parentCategory = cats.find((c) => c.id === mod.category_id) || (mod.categorySlug ? cats.find((c) => c.slug === mod.categorySlug) : null);

    const pages = pagesRes.success && pagesRes.data ? pagesRes.data : [];

    const originalData = {
      id: mod.id,
      category_id: mod.category_id,
      title: mod.title,
      slug: mod.slug,
      description: mod.description ?? null,
      icon: mod.icon ?? null,
      display_order: mod.display_order ?? 0,
      created_at: (mod as any).created_at ?? new Date().toISOString(),
      pages: pages as EffectivePageSummary[],
      category_name: parentCategory?.name,
      category_slug: parentCategory?.slug,
    } as unknown as CategoryWithSections;

    setOriginalCategory(originalData); // Store base (overlay-applied) for undo

    if (originalData) {

      const currentKeyRes = await getCurrentVersionKey();
      const currentKey = currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

      const draftKeyRes = includeDraft ? await getDraftVersionKey() : null;
      const draftKey = includeDraft && draftKeyRes?.success && draftKeyRes.data ? draftKeyRes.data : '0.1.1';

      const [currentEditsResult, draftEditsResult] = await Promise.all([
        getPageContentEdits(originalData.id, currentKey),
        includeDraft ? getPageContentEdits(originalData.id, draftKey) : Promise.resolve(null),
      ]);

      const currentEdits = currentEditsResult?.success && currentEditsResult.data ? currentEditsResult.data : null;
      const draftEdits = draftEditsResult && draftEditsResult.success && draftEditsResult.data ? draftEditsResult.data : null;

      // Track active draft edits for the category title so the undo button only appears for
      // current draft changes (not historical/published ones).
      const categoryDraftFields = new Set<'title' | 'content' | 'purpose'>();
      if (includeDraft && draftEdits) {
        for (const [field, edit] of draftEdits.entries()) {
          if (edit.status !== 'active') continue;
          if (field === 'title' || field === 'content' || field === 'purpose') {
            categoryDraftFields.add(field);
          }
        }
      }
      setCategoryDraftEditFields(categoryDraftFields);

      // Apply current (published) edits first, then draft edits (if any)
      const baseCategory = applyContentEdits(
        { id: originalData.id, title: originalData.title },
        currentEdits
      );
      const categoryWithEdits = includeDraft
        ? applyContentEdits(baseCategory, draftEdits)
        : baseCategory;

      setCategory({
        ...originalData,
        title: categoryWithEdits.title || originalData.title,
      });


      // Prefetch section title edits so accordion headers reflect changes before expansion.
      // Try the efficient module-level query first; fall back to per-page queries if the
      // module query needs a Firestore index.
      const sections = (originalData as any).pages || (originalData as any).sections || [];
      const sectionIds: number[] = sections.map((s: any) => s.id).filter((id: any) => typeof id === 'number');

      const buildTitleMapFromPageEdits = async (
        versionKeyOrId: string
      ): Promise<{ titleMap: Map<number, string>; activeTitleIds: Set<number> }> => {
        const results = await Promise.all(sectionIds.map((id) => getPageContentEdits(id, versionKeyOrId)));
        const titleMap = new Map<number, string>();
        const activeTitleIds = new Set<number>();

        results.forEach((res, idx) => {
          if (!res.success || !res.data) return;
          const titleEdit = res.data.get('title');
          if (titleEdit?.editedValue) {
            titleMap.set(sectionIds[idx], titleEdit.editedValue);
            if (titleEdit.status === 'active') {
              activeTitleIds.add(sectionIds[idx]);
            }
          }
        });

        return { titleMap, activeTitleIds };
      };

      const buildTitleMapFromModuleEdits = async (
        versionKeyOrId: string
      ): Promise<{ titleMap: Map<number, string>; activeTitleIds: Set<number> } | null> => {
        const moduleEditsResult = await getModuleContentEdits(originalData.slug || slug, versionKeyOrId);
        if (!moduleEditsResult.success || !moduleEditsResult.data) {
          return null;
        }

        const titleMap = new Map<number, string>();
        const activeTitleIds = new Set<number>();
        for (const edit of moduleEditsResult.data) {
          if (edit.field !== 'title') continue;
          if (!sectionIds.includes(edit.pageId)) continue;
          titleMap.set(edit.pageId, edit.editedValue);
          if (edit.status === 'active') {
            activeTitleIds.add(edit.pageId);
          }
        }
        return { titleMap, activeTitleIds };
      };

      const currentTitleResult = (await buildTitleMapFromModuleEdits(currentKey))
        ?? (await buildTitleMapFromPageEdits(currentKey));

      const draftTitleResult = includeDraft
        ? ((await buildTitleMapFromModuleEdits(draftKey)) ?? (await buildTitleMapFromPageEdits(draftKey)))
        : null;

      const merged = new Map<number, string>(currentTitleResult.titleMap);
      if (includeDraft && draftTitleResult) {
        for (const [id, val] of draftTitleResult.titleMap.entries()) {
          merged.set(id, val);
        }
        setDraftTitleEditedSectionIds(draftTitleResult.activeTitleIds);
      } else {
        setDraftTitleEditedSectionIds(new Set());
      }

      setRemoteTitleEdits(merged);
    }

    setLoading(false);
  };

  const loadSectionContent = async (sectionId: number, options?: { force?: boolean }) => {
    // Only load if not already loaded.
    const hasMain = sectionDetails.has(sectionId);
    if (!options?.force && hasMain) {
      return;
    }

    const sections = (category as any)?.pages || (category as any)?.sections || [];
    const section = sections.find((s: any) => s.id === sectionId) as (EffectivePageSummary & { slug?: string }) | undefined;

    const pageSlug = section?.slug || `page-${(section as any)?.page_number || sectionId}`;

    // Determine versions:
    // - Everyone sees currentVersion edits as the base.
    // - Users with edit permissions see draftVersion edits layered on top.
    const includeDraft = canIncludeDraft;

    const result = await getEffectivePageDetailForRender({
      moduleSlug: slug,
      pageId: sectionId,
      pageSlug,
      includeDraft,
    });

    if (result.success && result.data) {
      // Store original (unedited) data
      const originalData = { ...result.data };
      setOriginalSectionDetails(prev => new Map(prev).set(sectionId, originalData));


      const currentKeyRes = await getCurrentVersionKey();
      const currentKey = currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

      const draftKeyRes = includeDraft ? await getDraftVersionKey() : null;
      const draftKey = includeDraft && draftKeyRes?.success && draftKeyRes.data ? draftKeyRes.data : '0.1.1';

      const [currentEditsResult, draftEditsResult] = await Promise.all([
        getPageContentEdits(sectionId, currentKey),
        includeDraft ? getPageContentEdits(sectionId, draftKey) : Promise.resolve(null),
      ]);

      const currentEdits = currentEditsResult?.success && currentEditsResult.data ? currentEditsResult.data : null;
      const draftEdits = draftEditsResult && draftEditsResult.success && draftEditsResult.data ? draftEditsResult.data : null;

      // Track active draft fields for this page so the undo button only appears for current draft changes.
      const activeDraftFields = new Set<'title' | 'content' | 'purpose'>();
      if (includeDraft && draftEdits) {
        for (const [field, edit] of draftEdits.entries()) {
          if (edit.status !== 'active') continue;
          if (field === 'title' || field === 'content' || field === 'purpose') {
            activeDraftFields.add(field);
          }
        }
      }
      setDraftEditFieldsByPage((prev) => new Map(prev).set(sectionId, activeDraftFields));

      // Apply edits to the page data (convert null to undefined for purpose)
      const dataForEdits = {
        id: result.data.id,
        title: result.data.title,
        content: result.data.content,
        purpose: result.data.purpose || undefined,
      };

      const basePage = applyContentEdits(dataForEdits, currentEdits);
      const pageWithEdits = includeDraft
        ? applyContentEdits(basePage, draftEdits)
        : basePage;

      // Merge back with full section detail
      const mergedData: SectionDetail = {
        ...result.data,
        title: pageWithEdits.title || result.data.title,
        content: pageWithEdits.content || result.data.content,
        purpose: pageWithEdits.purpose || result.data.purpose,
      };
      
      setSectionDetails(prev => new Map(prev).set(sectionId, mergedData));
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeleton}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadCategory}>Retry</button>
        </div>
      </div>
    );
  }

  if (!category) {
    return null;
  }

  const handleContentSave = (pageId: number, newContent: string) => {
    // Update local state with edited content
    setContentEdits(prev => new Map(prev).set(pageId, newContent));
  };

  const handleTitleSave = (pageId: number, newTitle: string) => {
    // Update local state with edited title
    setTitleEdits(prev => new Map(prev).set(pageId, newTitle));
    
    // Also update the sectionDetails map to reflect the new title
    const detail = sectionDetails.get(pageId);
    if (detail) {
      setSectionDetails(prev => new Map(prev).set(pageId, { ...detail, title: newTitle }));
    }
  };
  
  const handleTitleUndo = (pageId: number) => {
    // Remove the edit from local state
    setTitleEdits((prev) => {
      const newMap = new Map(prev);
      newMap.delete(pageId);
      return newMap;
    });

    // Restore original title in sectionDetails
    const originalDetail = originalSectionDetails.get(pageId);
    const currentDetail = sectionDetails.get(pageId);
    if (originalDetail && currentDetail) {
      setSectionDetails((prev) => new Map(prev).set(pageId, { ...currentDetail, title: originalDetail.title }));
    }

    // Reload the section to get fresh data from Firestore
    loadSectionContent(pageId, { force: true });
  };
  
  const handleContentUndo = (pageId: number) => {
    // Remove the edit from local state
    setContentEdits(prev => {
      const newMap = new Map(prev);
      newMap.delete(pageId);
      return newMap;
    });
    
    // Reload the section to get fresh data from Firestore
    loadSectionContent(pageId, { force: true });
  };
  

  // Create accordion items with dynamic content loading
  // Use pages (new) or sections (legacy) depending on what's available
  const sections = (category as any).pages || (category as any).sections || [];
  const accordionItems = sections.map((section: any) => {
    const detail = sectionDetails.get(section.id);
    const editedContent = contentEdits.get(section.id);
    const editedTitle = titleEdits.get(section.id);
    const contentToShow = editedContent || detail?.content;
    // Prefer loaded (and edited) title from section detail when available.
    const remoteTitle = remoteTitleEdits.get(section.id);
    const titleToShow = editedTitle || detail?.title || remoteTitle || section.title;
    const bookmarkTitle = (titleToShow || 'Untitled').replace(/<[^>]*>/g, '').trim() || 'Untitled';

    const pageSlug = section.slug || `page-${section.page_number || section.id}`;

    const originalDetail = originalSectionDetails.get(section.id);
    
    return {
      id: section.id,
      title: (
        <span className={styles.sectionHeaderRow}>
          <EditableContent
            pageId={section.id}
            moduleSlug={category.slug}
            pageSlug={section.slug || `page-${section.page_number || section.id}`}
            resourceName={`${category.title} - ${section.title}`}
            field="title"
            value={titleToShow}
            originalValue={originalDetail?.title || section.title}
            hasDraftEdit={titleEdits.has(section.id) || draftTitleEditedSectionIds.has(section.id)}
            as="span"
            inline={true}
            onSave={(newValue) => handleTitleSave(section.id, newValue)}
            onUndo={() => handleTitleUndo(section.id)}
          />
        </span>
      ),
      sectionTitle: bookmarkTitle, // Bookmark title should match what's shown in the accordion header
      summary: section.summary || undefined,
      content: detail ? (
        <>
          <EditableContent
            pageId={section.id}
            moduleSlug={category.slug}
            pageSlug={section.slug || `page-${section.page_number || section.id}`}
            resourceName={`${category.title} - ${section.title}`}
            field="content"
            value={contentToShow || ''}
            originalValue={originalDetail?.content || detail.content || ''}
            hasDraftEdit={
              contentEdits.has(section.id) ||
              (draftEditFieldsByPage.get(section.id)?.has('content') ?? false)
            }
            as="div"
            onSave={(newValue) => handleContentSave(section.id, newValue)}
            onUndo={() => handleContentUndo(section.id)}
          />

          <div className={styles.referenceInline}>
            <ReferenceEditor
              moduleSlug={category.slug}
              basePageSlug={pageSlug}
              basePageTitle={bookmarkTitle}
              hideWhenEmpty={true}
            />
          </div>
        </>
      ) : (
        <div className={styles.loadingContent}>
          <div className="loading-skeleton" style={{ width: '100%', height: '60px', borderRadius: 'var(--radius-sm)' }} />
        </div>
      ),
      onExpand: () => loadSectionContent(section.id),
      categorySlug: category.slug
    };
  });

  return (
    <div className={styles.container}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <button 
          className={styles.breadcrumbItem}
          onClick={onNavigateHome}
          aria-label="Go to home"
        >
          Home
        </button>
        {onNavigateToCategory && (
          <>
            <span className={styles.breadcrumbSeparator}>/</span>
            <button 
              className={styles.breadcrumbItem}
              onClick={onNavigateToCategory}
              aria-label="Go back to category"
            >
              {(category as any).category_name || 'Category'}
            </button>
          </>
        )}
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>
          {category.title.replace(/<[^>]*>/g, '')}
        </span>
      </nav>
      
      <EditableContent
        pageId={category.id}
        moduleSlug={category.slug}
        pageSlug="module-title"
        resourceName={category.title}
        field="title"
        value={category.title}
        originalValue={originalCategory?.title || category.title}
        hasDraftEdit={categoryTitleEditedLocally || categoryDraftEditFields.has('title')}
        as="h1"
        className={styles.categoryTitle}
        onSave={(newValue) => {
          setCategoryTitleEditedLocally(true);
          setCategory({ ...category, title: newValue });
        }}
        onUndo={() => {
          setCategoryTitleEditedLocally(false);
          if (originalCategory) {
            setCategory({ ...category, title: originalCategory.title });
          }
          loadCategory();
        }}
      />
      
      {category.description && (
        <p className={styles.categoryDescription}>{category.description}</p>
      )}
      
      {accordionItems.length > 0 ? (
        <Accordion items={accordionItems} defaultExpanded={expandSectionId ? [expandSectionId] : []} />
      ) : (
        <p className={styles.emptyState}>No content available in this category yet.</p>
      )}
    </div>
  );
}
