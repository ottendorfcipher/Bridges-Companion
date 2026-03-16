import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import {
  createDraftCustomCategory,
  createDraftCustomModule,
  getEffectiveCategoriesForRender,
  getEffectiveModulesForRender,
  setDraftCategoryDeleted,
  setDraftCategoryHidden,
  setDraftModuleDeleted,
  setDraftModuleHidden,
  upsertDraftCategoryOverlay,
  upsertDraftModuleOverlay,
  type EffectiveCategory,
  type EffectiveModule,
} from '@utils/contentCatalog';
import {
  createDraftCustomPage,
  getEffectivePageDetailForRender,
  getEffectivePagesForModuleSlug,
  setDraftPageDeleted,
  setDraftPageHidden,
  type EffectivePageSummary,
} from '@utils/contentPages';
import { uploadContentIcon, listContentIcons, type ContentIcon } from '@utils/contentIcons';
import { getCurrentVersionKey, getDraftVersionKey } from '@utils/versionManagement';
import { applyContentEdits, getPageContentEdits, type ContentEdit } from '@utils/contentManagement';
import {
  DEFAULT_EDUCATIONAL_JOURNEY_CONTENT,
  DEFAULT_EDUCATIONAL_JOURNEY_TITLE,
  HOME_EDUCATIONAL_JOURNEY_MODULE_SLUG,
  HOME_EDUCATIONAL_JOURNEY_PAGE_ID,
  HOME_EDUCATIONAL_JOURNEY_PAGE_SLUG,
} from '@utils/homeContent';
import { logActivity } from '@utils/activityLog';
import type { SectionDetail } from '@/types/database';
import { ContentItemIcon } from '@components/ContentItemIcon/ContentItemIcon';
import { FeatherIconPicker } from '@components/FeatherIconPicker/FeatherIconPicker';
import { EditableContent } from '@components/EditableContent/EditableContent';
import { ReferenceEditor } from '@components/ReferenceEditor/ReferenceEditor';
import { BaseContentSourceToggle } from '@components/Admin/BaseContentSourceToggle';
import styles from './ContentManager.module.css';

type ContentMode = 'home' | 'categories' | 'modules' | 'advanced';

type IconType = 'feather' | 'custom';

export function ContentManager() {
  const { user } = useAuth();
  const permissions = usePermissions();

  const [mode, setMode] = useState<ContentMode>('categories');
  const [search, setSearch] = useState('');

  // Modules list filter
  const [moduleCategoryFilterSlug, setModuleCategoryFilterSlug] = useState<string>('all');

  // Create flows
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingModule, setCreatingModule] = useState(false);

  const [newCatName, setNewCatName] = useState('');
  const [newCatDescription, setNewCatDescription] = useState('');
  const [newCatIconType, setNewCatIconType] = useState<IconType>('feather');
  const [newCatFeatherIcon, setNewCatFeatherIcon] = useState('book');
  const [newCatCustomIconId, setNewCatCustomIconId] = useState<string | null>(null);
  const [newCatCustomIconUrl, setNewCatCustomIconUrl] = useState<string | null>(null);

  const [newModCategorySlug, setNewModCategorySlug] = useState<string>('');
  const [newModTitle, setNewModTitle] = useState('');
  const [newModDescription, setNewModDescription] = useState('');
  const [newModIconType, setNewModIconType] = useState<IconType>('feather');
  const [newModFeatherIcon, setNewModFeatherIcon] = useState('book');
  const [newModCustomIconId, setNewModCustomIconId] = useState<string | null>(null);
  const [newModCustomIconUrl, setNewModCustomIconUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [categories, setCategories] = useState<EffectiveCategory[]>([]);
  const [modules, setModules] = useState<EffectiveModule[]>([]);
  const [icons, setIcons] = useState<ContentIcon[]>([]);

  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(null);
  const [selectedModuleSlug, setSelectedModuleSlug] = useState<string | null>(null);

  // Home content (draft via contentEdits)
  const [homeJourneyTitle, setHomeJourneyTitle] = useState(DEFAULT_EDUCATIONAL_JOURNEY_TITLE);
  const [homeJourneyContent, setHomeJourneyContent] = useState(DEFAULT_EDUCATIONAL_JOURNEY_CONTENT);
  const [homeDraftEditFields, setHomeDraftEditFields] = useState<Set<'title' | 'content'>>(new Set());
  const [homeLoading, setHomeLoading] = useState(false);

  // Module content editing
  const [modulePages, setModulePages] = useState<EffectivePageSummary[]>([]);
  const [creatingPage, setCreatingPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [pagesLoading, setPagesLoading] = useState(false);

  // Page selection vs editing are separate to improve clarity and reduce accidental edits.
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [editingPageId, setEditingPageId] = useState<number | null>(null);

  const [pageLoading, setPageLoading] = useState(false);
  const [pageDetail, setPageDetail] = useState<SectionDetail | null>(null);
  const [originalPageDetail, setOriginalPageDetail] = useState<SectionDetail | null>(null);
  const [draftEditFields, setDraftEditFields] = useState<Set<'title' | 'content' | 'purpose'>>(new Set());

  // Page row dropdown menu
  const [openPageMenuId, setOpenPageMenuId] = useState<number | null>(null);
  const [pageMenuAnchorRect, setPageMenuAnchorRect] = useState<DOMRect | null>(null);
  const pageMenuAnchorElRef = useRef<HTMLElement | null>(null);
  const pageMenuRef = useRef<HTMLDivElement | null>(null);
  const pageMenuPortalRef = useRef<HTMLDivElement | null>(null);

  const closePageMenu = useCallback(() => {
    setOpenPageMenuId(null);
    setPageMenuAnchorRect(null);
    pageMenuAnchorElRef.current = null;
  }, []);

  const selectedCategory = useMemo(
    () => (selectedCategorySlug ? categories.find((c) => c.slug === selectedCategorySlug) || null : null),
    [selectedCategorySlug, categories]
  );

  const selectedModule = useMemo(
    () => (selectedModuleSlug ? modules.find((m) => m.slug === selectedModuleSlug) || null : null),
    [selectedModuleSlug, modules]
  );

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => `${c.name} ${c.slug}`.toLowerCase().includes(q));
  }, [categories, search]);

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();

    const byCategory =
      moduleCategoryFilterSlug === 'all'
        ? modules
        : modules.filter((m) => m.categorySlug === moduleCategoryFilterSlug);

    if (!q) return byCategory;
    return byCategory.filter((m) => `${m.title} ${m.slug}`.toLowerCase().includes(q));
  }, [modules, search, moduleCategoryFilterSlug]);

  const canEdit = permissions.canEditContent();
  const canDelete = permissions.canDeleteContent();
  const canUploadAssets = permissions.isAdmin();

  // Form state (category)
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState<string>('');
  const [catIconType, setCatIconType] = useState<IconType>('feather');
  const [catFeatherIcon, setCatFeatherIcon] = useState<string>('book');
  const [catCustomIconId, setCatCustomIconId] = useState<string | null>(null);
  const [catCustomIconUrl, setCatCustomIconUrl] = useState<string | null>(null);

  // Form state (module)
  const [modTitle, setModTitle] = useState('');
  const [modDescription, setModDescription] = useState<string>('');
  const [modIconType, setModIconType] = useState<IconType>('feather');
  const [modFeatherIcon, setModFeatherIcon] = useState<string>('book');
  const [modCustomIconId, setModCustomIconId] = useState<string | null>(null);
  const [modCustomIconUrl, setModCustomIconUrl] = useState<string | null>(null);

  const refreshAll = async () => {
    setLoading(true);
    setError(null);

    const [catsRes, modsRes, iconsRes] = await Promise.all([
      getEffectiveCategoriesForRender({ includeDraft: true, includeHidden: true, includeDeleted: true }),
      getEffectiveModulesForRender({ includeDraft: true, includeHidden: true, includeDeleted: true }),
      listContentIcons(),
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

    setCategories(catsRes.data);
    setModules(modsRes.data);
    setIcons(iconsRes.success && iconsRes.data ? iconsRes.data : []);

    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (mode !== 'home') return;
    loadHomeEducationalJourney();
  }, [mode]);

  useEffect(() => {
    // Close page menu/editor when switching modules
    closePageMenu();
    setSelectedPageId(null);
    setEditingPageId(null);
    setPageDetail(null);
    setOriginalPageDetail(null);
    setDraftEditFields(new Set());
  }, [selectedModuleSlug, closePageMenu]);

  useEffect(() => {
    // Close page menu on outside click / Escape
    const onMouseDown = (e: MouseEvent) => {
      if (openPageMenuId === null) return;

      const anchorEl = pageMenuRef.current;
      const portalEl = pageMenuPortalRef.current;

      if (!(e.target instanceof Node)) return;

      if (anchorEl && anchorEl.contains(e.target)) return;
      if (portalEl && portalEl.contains(e.target)) return;

      closePageMenu();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePageMenu();
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openPageMenuId, closePageMenu]);

  useEffect(() => {
    if (openPageMenuId === null) {
      setPageMenuAnchorRect(null);
      pageMenuAnchorElRef.current = null;
      return;
    }

    const update = () => {
      const el = pageMenuAnchorElRef.current;
      if (!el) return;
      setPageMenuAnchorRect(el.getBoundingClientRect());
    };

    update();

    // Capture scroll events from any scroll container.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [openPageMenuId]);

  useEffect(() => {
    // Load pages list when a module is selected
    let cancelled = false;

    const loadPages = async () => {
      if (!selectedModuleSlug) {
        setModulePages([]);
        setCreatingPage(false);
        setNewPageTitle('');
        setSelectedPageId(null);
        setPageDetail(null);
        setOriginalPageDetail(null);
        setDraftEditFields(new Set());
        return;
      }

      setPagesLoading(true);

      const res = await getEffectivePagesForModuleSlug({
        moduleSlug: selectedModuleSlug,
        includeDraft: true,
        includeHidden: true,
        includeDeleted: true,
      });

      if (cancelled) return;

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to load module pages');
        setModulePages([]);
        setPagesLoading(false);
        return;
      }

      setModulePages(res.data.filter((p) => !String(p.slug || '').startsWith('layer2-')));
      setPagesLoading(false);
    };

    loadPages();

    return () => {
      cancelled = true;
    };
  }, [selectedModuleSlug]);

  const refreshPages = async (moduleSlug: string) => {
    const pagesRes = await getEffectivePagesForModuleSlug({
      moduleSlug,
      includeDraft: true,
      includeHidden: true,
      includeDeleted: true,
    });

    if (pagesRes.success && pagesRes.data) {
      setModulePages(pagesRes.data.filter((p) => !String(p.slug || '').startsWith('layer2-')));
    }
  };

  const handleTogglePageHidden = async (pageId: number) => {
    if (!user || !selectedModuleSlug) return;

    const current = modulePages.find((p) => p.id === pageId);
    const currentHidden = current?.isHidden === true;
    const nextHidden = !currentHidden;

    const confirmed = confirm(
      `${nextHidden ? 'Hide' : 'Unhide'} this page?\n\n` +
        `This writes to the current draft and can be published in Version Manifest.`
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const res = await setDraftPageHidden(
      {
        moduleSlug: selectedModuleSlug,
        pageId,
        pageSlug: current?.slug || `page-${pageId}`,
        isHidden: nextHidden,
        title: current?.title,
      },
      { uid: user.uid, displayName: user.displayName, email: user.email }
    );

    if (!res.success) {
      setError(res.error || 'Failed to update page');
      setSaving(false);
      return;
    }

    await logActivity(
      user.uid,
      user.email || 'unknown',
      user.displayName || user.email || 'Unknown User',
      nextHidden ? 'catalog_page_hide' : 'catalog_page_unhide',
      {
        resourceType: 'page',
        resourceId: pageId,
        resourceName: `${nextHidden ? 'Hidden' : 'Unhid'} page: ${current?.title || current?.slug || pageId}`,
        metadata: { moduleSlug: selectedModuleSlug, pageSlug: current?.slug },
      }
    );

    setSuccessMessage(nextHidden ? 'Page hidden in draft' : 'Page unhidden in draft');
    window.dispatchEvent(new Event('bridge:content-pages-changed'));

    await refreshPages(selectedModuleSlug);

    if (nextHidden) {
      setSelectedPageId(null);
      setEditingPageId(null);
      setPageDetail(null);
      setOriginalPageDetail(null);
      setDraftEditFields(new Set());
    }

    setSaving(false);
  };

  const handleTogglePageDeleted = async (pageId: number) => {
    if (!user || !selectedModuleSlug) return;

    const current = modulePages.find((p) => p.id === pageId);
    const nextDeleted = !(current?.isDeleted === true);

    const confirmed = confirm(
      `${nextDeleted ? 'Hard-delete' : 'Restore'} this page?\n\n` +
        `This writes to the current draft and can be published in Version Manifest.`
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const res = await setDraftPageDeleted(
      {
        moduleSlug: selectedModuleSlug,
        pageId,
        pageSlug: current?.slug || `page-${pageId}`,
        isDeleted: nextDeleted,
        title: current?.title,
      },
      { uid: user.uid, displayName: user.displayName, email: user.email }
    );

    if (!res.success) {
      setError(res.error || 'Failed to update page');
      setSaving(false);
      return;
    }

    await logActivity(
      user.uid,
      user.email || 'unknown',
      user.displayName || user.email || 'Unknown User',
      nextDeleted ? 'catalog_page_delete' : 'catalog_page_restore',
      {
        resourceType: 'page',
        resourceId: pageId,
        resourceName: `${nextDeleted ? 'Deleted' : 'Restored'} page: ${current?.title || current?.slug || pageId}`,
        metadata: { moduleSlug: selectedModuleSlug, pageSlug: current?.slug },
      }
    );

    setSuccessMessage(nextDeleted ? 'Page deleted in draft' : 'Page restored in draft');
    window.dispatchEvent(new Event('bridge:content-pages-changed'));

    await refreshPages(selectedModuleSlug);

    if (nextDeleted) {
      setSelectedPageId(null);
      setEditingPageId(null);
      setPageDetail(null);
      setOriginalPageDetail(null);
      setDraftEditFields(new Set());
    } else {
      setSelectedPageId(pageId);
      setEditingPageId(pageId);
      await loadPageDetail(pageId);
    }

    setSaving(false);
  };

  const loadPageDetail = async (pageId: number) => {
    setPageLoading(true);
    setError(null);

    const selectedPage = modulePages.find((p) => p.id === pageId);
    const pageSlug = selectedPage?.slug || `page-${pageId}`;

    const baseRes = await getEffectivePageDetailForRender({
      moduleSlug: selectedModuleSlug || '',
      pageId,
      pageSlug,
      includeDraft: true,
    });
    if (!baseRes.success || !baseRes.data) {
      setError(baseRes.error || 'Failed to load page');
      setPageDetail(null);
      setOriginalPageDetail(null);
      setDraftEditFields(new Set());
      setPageLoading(false);
      return;
    }

    const original = { ...baseRes.data };
    setOriginalPageDetail(original);

    // Editors should see currentVersion edits as the base, with draft layered on top.
    const currentKeyRes = await getCurrentVersionKey();
    const currentKey = currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

    const draftKeyRes = await getDraftVersionKey();
    const draftKey = draftKeyRes.success && draftKeyRes.data ? draftKeyRes.data : '0.1.1';

    const [currentEditsRes, draftEditsRes] = await Promise.all([
      getPageContentEdits(pageId, currentKey),
      getPageContentEdits(pageId, draftKey),
    ]);

    const currentEdits = currentEditsRes.success && currentEditsRes.data ? currentEditsRes.data : null;
    const draftEdits = draftEditsRes.success && draftEditsRes.data ? draftEditsRes.data : null;

    // Track which fields are actively edited in the current draft version.
    const activeDraftFields = new Set<'title' | 'content' | 'purpose'>();
    if (draftEdits) {
      for (const [field, edit] of draftEdits.entries()) {
        const ce = edit as ContentEdit;
        if (ce.status !== 'active') continue;
        if (field === 'title' || field === 'content' || field === 'purpose') {
          activeDraftFields.add(field);
        }
      }
    }
    setDraftEditFields(activeDraftFields);

    const dataForEdits = {
      id: original.id,
      title: original.title,
      content: original.content,
      purpose: original.purpose || undefined,
    };

    const baseWithPublished = applyContentEdits(dataForEdits, currentEdits);
    const withDraft = applyContentEdits(baseWithPublished, draftEdits);

    const merged: SectionDetail = {
      ...original,
      title: withDraft.title || original.title,
      content: withDraft.content || original.content,
      purpose: withDraft.purpose ?? original.purpose,
    };

    setPageDetail(merged);
    setPageLoading(false);
  };

  useEffect(() => {
    // Keep form in sync with selection
    if (!selectedCategory) return;

    setCatName(selectedCategory.name);
    setCatDescription(selectedCategory.description || '');

    const iconType = selectedCategory.iconType || 'feather';
    setCatIconType(iconType);

    if (iconType === 'custom') {
      setCatCustomIconUrl(selectedCategory.iconUrl || null);
      setCatCustomIconId(null);
    } else {
      setCatFeatherIcon(selectedCategory.icon || 'book');
      setCatCustomIconId(null);
      setCatCustomIconUrl(null);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedModule) return;

    setModTitle(selectedModule.title);
    setModDescription(selectedModule.description || '');

    const iconType = selectedModule.iconType || 'feather';
    setModIconType(iconType);

    if (iconType === 'custom') {
      setModCustomIconUrl(selectedModule.iconUrl || null);
      setModCustomIconId(null);
    } else {
      setModFeatherIcon(selectedModule.icon || 'book');
      setModCustomIconId(null);
      setModCustomIconUrl(null);
    }
  }, [selectedModule]);

  const handleUploadIcon = async (file: File) => {
    if (!user) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const res = await uploadContentIcon(file, {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
    });

    if (!res.success || !res.data) {
      setError(res.error || 'Failed to upload icon');
      setSaving(false);
      return;
    }

    const updatedIcons = await listContentIcons();
    if (updatedIcons.success && updatedIcons.data) {
      setIcons(updatedIcons.data);
    }

    // Apply to whichever form is active
    if (mode === 'categories') {
      setCatIconType('custom');
      setCatCustomIconId(res.data.iconId);
      setCatCustomIconUrl(res.data.downloadUrl);
    } else if (mode === 'modules') {
      setModIconType('custom');
      setModCustomIconId(res.data.iconId);
      setModCustomIconUrl(res.data.downloadUrl);
    }

    setSuccessMessage('Icon uploaded');
    setSaving(false);
  };

  const handleSaveCategory = async () => {
    if (!user || !selectedCategorySlug) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const patch = {
      name: catName.trim() || undefined,
      description: catDescription.trim() ? catDescription.trim() : null,
      iconType: catIconType,
      icon: catIconType === 'feather' ? (catFeatherIcon.trim() || 'book') : null,
      iconId: catIconType === 'custom' ? catCustomIconId : null,
      iconUrl: catIconType === 'custom' ? catCustomIconUrl : null,
    } as const;

    const res = await upsertDraftCategoryOverlay({ categorySlug: selectedCategorySlug, patch }, {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
    });

    if (!res.success) {
      setError(res.error || 'Failed to save category');
      setSaving(false);
      return;
    }

    await logActivity(
      user.uid,
      user.email || 'unknown',
      user.displayName || user.email || 'Unknown User',
      'catalog_category_update',
      {
        resourceType: 'category',
        resourceId: selectedCategorySlug,
        resourceName: `Updated category: ${catName.trim() || selectedCategorySlug}`,
        metadata: { slug: selectedCategorySlug },
      }
    );

    setSuccessMessage('Saved to draft');
    window.dispatchEvent(new Event('bridge:content-catalog-changed'));
    await refreshAll();
    setSaving(false);
  };

  const loadHomeEducationalJourney = async () => {
    setHomeLoading(true);
    setError(null);

    const currentKeyRes = await getCurrentVersionKey();
    const currentKey = currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

    const draftKeyRes = await getDraftVersionKey();
    const draftKey = draftKeyRes.success && draftKeyRes.data ? draftKeyRes.data : '0.1.1';

    const [currentEditsRes, draftEditsRes] = await Promise.all([
      getPageContentEdits(HOME_EDUCATIONAL_JOURNEY_PAGE_ID, currentKey),
      getPageContentEdits(HOME_EDUCATIONAL_JOURNEY_PAGE_ID, draftKey),
    ]);

    const currentEdits = currentEditsRes.success && currentEditsRes.data ? currentEditsRes.data : null;
    const draftEdits = draftEditsRes.success && draftEditsRes.data ? draftEditsRes.data : null;

    const activeDraftFields = new Set<'title' | 'content'>();
    if (draftEdits) {
      for (const [field, edit] of draftEdits.entries()) {
        if (edit.status !== 'active') continue;
        if (field === 'title' || field === 'content') {
          activeDraftFields.add(field);
        }
      }
    }
    setHomeDraftEditFields(activeDraftFields);

    const base = {
      id: HOME_EDUCATIONAL_JOURNEY_PAGE_ID,
      title: DEFAULT_EDUCATIONAL_JOURNEY_TITLE,
      content: DEFAULT_EDUCATIONAL_JOURNEY_CONTENT,
    };

    const withPublished = applyContentEdits(base, currentEdits);
    const withDraft = applyContentEdits(withPublished, draftEdits);

    setHomeJourneyTitle(withDraft.title || DEFAULT_EDUCATIONAL_JOURNEY_TITLE);
    setHomeJourneyContent(withDraft.content || DEFAULT_EDUCATIONAL_JOURNEY_CONTENT);
    setHomeLoading(false);
  };

  const handleSaveModule = async () => {
    if (!user || !selectedModuleSlug) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const patch = {
      title: modTitle.trim() || undefined,
      description: modDescription.trim() ? modDescription.trim() : null,
      iconType: modIconType,
      icon: modIconType === 'feather' ? (modFeatherIcon.trim() || 'book') : null,
      iconId: modIconType === 'custom' ? modCustomIconId : null,
      iconUrl: modIconType === 'custom' ? modCustomIconUrl : null,
    } as const;

    const res = await upsertDraftModuleOverlay({ moduleSlug: selectedModuleSlug, patch }, {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
    });

    if (!res.success) {
      setError(res.error || 'Failed to save module');
      setSaving(false);
      return;
    }

    await logActivity(
      user.uid,
      user.email || 'unknown',
      user.displayName || user.email || 'Unknown User',
      'catalog_module_update',
      {
        resourceType: 'module',
        resourceId: selectedModuleSlug,
        resourceName: `Updated module: ${modTitle.trim() || selectedModuleSlug}`,
        metadata: { slug: selectedModuleSlug },
      }
    );

    setSuccessMessage('Saved to draft');
    window.dispatchEvent(new Event('bridge:content-catalog-changed'));
    await refreshAll();
    setSaving(false);
  };

  if (!canEdit) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Content</h1>
        <div className={styles.notice}>You don’t have permission to edit content.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Content</h1>
        <div className={styles.loading}>Loading…</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Content</h1>
          <p className={styles.subtitle}>Edit category/module cards in the current draft. Publish in Version Manifest to make changes live.</p>
        </div>
      </div>

      <div className={styles.modeRow}>
        <button
          className={`${styles.modeButton} ${mode === 'home' ? styles.activeModeButton : ''}`}
          onClick={() => {
            setMode('home');
          }}
          type="button"
        >
          Home
        </button>
        <button
          className={`${styles.modeButton} ${mode === 'categories' ? styles.activeModeButton : ''}`}
          onClick={() => {
            setMode('categories');
          }}
          type="button"
        >
          Categories
        </button>
        <button
          className={`${styles.modeButton} ${mode === 'modules' ? styles.activeModeButton : ''}`}
          onClick={() => {
            setMode('modules');
          }}
          type="button"
        >
          Modules
        </button>
        <button
          className={`${styles.modeButton} ${mode === 'advanced' ? styles.activeModeButton : ''}`}
          onClick={() => {
            // Clear selection state to reduce confusion when entering a settings-only view.
            setSelectedCategorySlug(null);
            setSelectedModuleSlug(null);
            setSelectedPageId(null);
            setEditingPageId(null);
            closePageMenu();
            setMode('advanced');
          }}
          type="button"
        >
          Advanced
        </button>
      </div>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className={styles.success}>
          <span className={styles.successIcon}>✓</span>
          <span>{successMessage}</span>
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.leftPane}>
          {mode === 'categories' || mode === 'modules' ? (
            <input
              className={styles.search}
              placeholder={`Search ${mode}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          ) : mode === 'home' ? (
            <div className={styles.noticeInline}>Edit home screen copy on the right.</div>
          ) : (
            <div className={styles.noticeInline}>Advanced settings for content editing.</div>
          )}

          {mode === 'modules' && (
            <div className={styles.filterRow}>
              <label className={styles.filterLabel}>
                Category
                <select
                  className={styles.select}
                  value={moduleCategoryFilterSlug}
                  onChange={(e) => {
                    setModuleCategoryFilterSlug(e.target.value);
                    setSelectedModuleSlug(null);
                    setSelectedCategorySlug(null);
                    setSelectedPageId(null);
                    setPageDetail(null);
                    setOriginalPageDetail(null);
                    setDraftEditFields(new Set());
                  }}
                >
                  <option value="all">All categories</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {mode === 'categories' && (
            <div className={styles.createRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setCreatingCategory(true);
                  setCreatingModule(false);
                  setSelectedCategorySlug(null);
                  setSelectedModuleSlug(null);
                }}
              >
                + New Category
              </button>
            </div>
          )}

          {mode === 'modules' && (
            <div className={styles.createRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setCreatingModule(true);
                  setCreatingCategory(false);
                  setSelectedModuleSlug(null);
                  setSelectedCategorySlug(null);
                  setSelectedPageId(null);
                  setPageDetail(null);
                  setOriginalPageDetail(null);
                  setDraftEditFields(new Set());

                  // Default to currently filtered category (if any)
                  setNewModCategorySlug(moduleCategoryFilterSlug !== 'all' ? moduleCategoryFilterSlug : categories[0]?.slug || '');
                }}
              >
                + New Module
              </button>
            </div>
          )}

          {mode === 'home' && (
            <div className={styles.empty}>
              Home has a single editable section right now: Educational Journey.
            </div>
          )}

          {mode === 'advanced' && (
            <div className={styles.empty}>Select a setting on the right.</div>
          )}

          {mode === 'categories' && (
            <div className={styles.list}>
              {filteredCategories.map((c) => (
                <button
                  key={c.slug}
                  className={`${styles.listRow} ${selectedCategorySlug === c.slug ? styles.activeRow : ''}`}
                  onClick={() => {
                    setCreatingCategory(false);
                    setCreatingModule(false);
                    setSelectedCategorySlug(c.slug);
                    setSelectedModuleSlug(null);
                  }}
                >
                  <span className={styles.rowIcon}>
                    <ContentItemIcon iconType={c.iconType} icon={c.icon} iconUrl={c.iconUrl} size={20} ariaLabel={c.name} />
                  </span>
                  <span className={styles.rowTitle}>{c.name}</span>
                  <span className={styles.rowMeta}>
                    {c.slug}
                    {c.isDeleted ? ' • deleted' : ''}
                    {c.isHidden ? ' • hidden' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}

          {mode === 'modules' && (
            <div className={styles.list}>
              {filteredModules.map((m) => (
                <button
                  key={m.slug}
                  className={`${styles.listRow} ${selectedModuleSlug === m.slug ? styles.activeRow : ''}`}
                  onClick={() => {
                    setCreatingCategory(false);
                    setCreatingModule(false);
                    setSelectedModuleSlug(m.slug);
                    setSelectedCategorySlug(null);
                    setSelectedPageId(null);
                    setPageDetail(null);
                    setOriginalPageDetail(null);
                    setDraftEditFields(new Set());
                  }}
                >
                  <span className={styles.rowIcon}>
                    <ContentItemIcon iconType={m.iconType} icon={m.icon} iconUrl={m.iconUrl} size={20} ariaLabel={m.title} />
                  </span>
                  <span className={styles.rowTitle}>{m.title}</span>
                  <span className={styles.rowMeta}>
                    {m.slug}
                    {m.isDeleted ? ' • deleted' : ''}
                    {m.isHidden ? ' • hidden' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}

        </div>

        <div className={styles.rightPane}>
          {mode === 'categories' && (
            <>
              {!selectedCategory ? (
                creatingCategory ? (
                  <div className={styles.editor}>
                    <h2 className={styles.editorTitle}>Create Category</h2>

                    <div className={styles.formRow}>
                      <label className={styles.label}>
                        Name
                        <input className={styles.input} value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
                      </label>
                    </div>

                    <div className={styles.formRow}>
                      <label className={styles.label}>
                        Description
                        <textarea
                          className={styles.textarea}
                          value={newCatDescription}
                          onChange={(e) => setNewCatDescription(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.label}>Icon</div>
                      <div className={styles.iconRow}>
                        <label className={styles.radio}>
                          <input
                            type="radio"
                            name="newCatIconType"
                            checked={newCatIconType === 'feather'}
                            onChange={() => setNewCatIconType('feather')}
                          />
                          Feather
                        </label>
                        <label className={styles.radio}>
                          <input
                            type="radio"
                            name="newCatIconType"
                            checked={newCatIconType === 'custom'}
                            onChange={() => setNewCatIconType('custom')}
                          />
                          Custom
                        </label>
                      </div>

                      {newCatIconType === 'feather' ? (
                        <FeatherIconPicker value={newCatFeatherIcon} onChange={setNewCatFeatherIcon} />
                      ) : (
                        <>
                          <div className={styles.iconPickerRow}>
                            {canUploadAssets ? (
                              <label className={styles.uploadLabel}>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className={styles.fileInput}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadIcon(f);
                                    e.currentTarget.value = '';
                                  }}
                                  disabled={saving}
                                />
                                <span className={styles.secondaryButton}>Upload New Icon</span>
                              </label>
                            ) : (
                              <div className={styles.smallNote}>Only admins can upload new icons.</div>
                            )}

                            <span className={styles.previewIcon}>
                              <ContentItemIcon
                                iconType="custom"
                                iconUrl={newCatCustomIconUrl}
                                size={22}
                                ariaLabel={newCatName || 'New category'}
                              />
                            </span>
                          </div>

                          <div className={styles.iconGridPicker}>
                            {icons.map((ic) => (
                              <button
                                key={ic.iconId}
                                type="button"
                                className={`${styles.iconPickCell} ${newCatCustomIconUrl === ic.downloadUrl ? styles.iconPickCellActive : ''}`}
                                onClick={() => {
                                  setNewCatCustomIconId(ic.iconId);
                                  setNewCatCustomIconUrl(ic.downloadUrl);
                                }}
                                title={ic.iconId}
                              >
                                <img src={ic.downloadUrl} width={32} height={32} alt="" className={styles.iconImg} />
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div className={styles.actionsRow}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={saving}
                        onClick={async () => {
                          if (!user) return;
                          setSaving(true);
                          setError(null);
                          setSuccessMessage(null);

                          const res = await createDraftCustomCategory(
                            {
                              name: newCatName.trim(),
                              description: newCatDescription.trim() ? newCatDescription.trim() : null,
                              iconType: newCatIconType,
                              icon: newCatIconType === 'feather' ? newCatFeatherIcon : null,
                              iconId: newCatIconType === 'custom' ? newCatCustomIconId : null,
                              iconUrl: newCatIconType === 'custom' ? newCatCustomIconUrl : null,
                            },
                            { uid: user.uid, displayName: user.displayName, email: user.email }
                          );

                          if (!res.success || !res.data) {
                            setError(res.error || 'Failed to create category');
                            setSaving(false);
                            return;
                          }

                          await logActivity(
                            user.uid,
                            user.email || 'unknown',
                            user.displayName || user.email || 'Unknown User',
                            'catalog_category_create',
                            {
                              resourceType: 'category',
                              resourceId: res.data.slug,
                              resourceName: `Created category: ${res.data.name}`,
                              metadata: { slug: res.data.slug },
                            }
                          );

                          setSuccessMessage('Created category in draft');
                          setCreatingCategory(false);
                          setNewCatName('');
                          setNewCatDescription('');
                          setNewCatIconType('feather');
                          setNewCatFeatherIcon('book');
                          setNewCatCustomIconId(null);
                          setNewCatCustomIconUrl(null);

                          window.dispatchEvent(new Event('bridge:content-catalog-changed'));

                          await refreshAll();
                          setSelectedCategorySlug(res.data.slug);
                          setSaving(false);
                        }}
                      >
                        {saving ? 'Creating…' : 'Create in Draft'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.empty}>Select a category to edit, or create a new one.</div>
                )
              ) : (
                <div className={styles.editor}>
                  <h2 className={styles.editorTitle}>Edit Category</h2>
                  <div className={styles.formRow}>
                    <label className={styles.label}>
                      Name
                      <input className={styles.input} value={catName} onChange={(e) => setCatName(e.target.value)} />
                    </label>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.label}>
                      Description
                      <textarea
                        className={styles.textarea}
                        value={catDescription}
                        onChange={(e) => setCatDescription(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.label}>Icon</div>
                    <div className={styles.iconRow}>
                      <label className={styles.radio}>
                        <input
                          type="radio"
                          name="catIconType"
                          checked={catIconType === 'feather'}
                          onChange={() => setCatIconType('feather')}
                        />
                        Feather
                      </label>
                      <label className={styles.radio}>
                        <input
                          type="radio"
                          name="catIconType"
                          checked={catIconType === 'custom'}
                          onChange={() => setCatIconType('custom')}
                        />
                        Custom
                      </label>
                    </div>

                    {catIconType === 'feather' ? (
                      <FeatherIconPicker value={catFeatherIcon} onChange={setCatFeatherIcon} />
                    ) : (
                      <>
                        <div className={styles.iconPickerRow}>
                          {canUploadAssets ? (
                            <label className={styles.uploadLabel}>
                              <input
                                type="file"
                                accept="image/*"
                                className={styles.fileInput}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadIcon(f);
                                  e.currentTarget.value = '';
                                }}
                                disabled={saving}
                              />
                              <span className={styles.secondaryButton}>Upload New Icon</span>
                            </label>
                          ) : (
                            <div className={styles.smallNote}>Only admins can upload new icons.</div>
                          )}

                          <span className={styles.previewIcon}>
                            <ContentItemIcon iconType="custom" iconUrl={catCustomIconUrl} size={22} ariaLabel={selectedCategory.name} />
                          </span>
                        </div>

                        <div className={styles.iconGridPicker}>
                          {icons.map((ic) => (
                            <button
                              key={ic.iconId}
                              type="button"
                              className={`${styles.iconPickCell} ${catCustomIconUrl === ic.downloadUrl ? styles.iconPickCellActive : ''}`}
                              onClick={() => {
                                setCatCustomIconId(ic.iconId);
                                setCatCustomIconUrl(ic.downloadUrl);
                              }}
                              title={ic.iconId}
                            >
                              <img src={ic.downloadUrl} width={32} height={32} alt="" className={styles.iconImg} />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {selectedCategory.isDeleted && (
                    <div className={styles.noticeInline}>
                      {selectedCategory.isDeletedPublished
                        ? 'This category was deleted in a published version. To restore it, revert to an older version in Version Manifest.'
                        : 'This category is deleted in the draft. Restore it to edit or show it on the site.'}
                    </div>
                  )}

                  <div className={styles.actionsRow}>
                    {canDelete && (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        disabled={saving || (selectedCategory.isDeletedPublished === true && selectedCategory.isDeleted === true)}
                        title={
                          selectedCategory.isDeletedPublished === true && selectedCategory.isDeleted === true
                            ? 'Deleted in a published version. Restore by reverting to an older version.'
                            : undefined
                        }
                        onClick={async () => {
                          if (!user || !selectedCategory) return;

                          const nextDeleted = !selectedCategory.isDeleted;
                          const confirmed = confirm(
                            `${nextDeleted ? 'Hard-delete' : 'Restore'} category "${selectedCategory.name}"?\n\n` +
                              `This writes to the current draft and can be published in Version Manifest.`
                          );
                          if (!confirmed) return;

                          setSaving(true);
                          setError(null);
                          setSuccessMessage(null);

                          const res = await setDraftCategoryDeleted(
                            {
                              categorySlug: selectedCategory.slug,
                              source: (selectedCategory.source as any) || 'sqlite',
                              isDeleted: nextDeleted,
                            },
                            { uid: user.uid, displayName: user.displayName, email: user.email }
                          );

                          if (!res.success) {
                            setError(res.error || 'Failed to update category');
                            setSaving(false);
                            return;
                          }

                          await logActivity(
                            user.uid,
                            user.email || 'unknown',
                            user.displayName || user.email || 'Unknown User',
                            nextDeleted ? 'catalog_category_delete' : 'catalog_category_restore',
                            {
                              resourceType: 'category',
                              resourceId: selectedCategory.slug,
                              resourceName: `${nextDeleted ? 'Deleted' : 'Restored'} category: ${selectedCategory.name}`,
                              metadata: { slug: selectedCategory.slug },
                            }
                          );

                          setSuccessMessage(nextDeleted ? 'Category deleted in draft' : 'Category restored in draft');
                          window.dispatchEvent(new Event('bridge:content-catalog-changed'));
                          await refreshAll();

                          if (nextDeleted) {
                            setSelectedCategorySlug(null);
                          }

                          setSaving(false);
                        }}
                      >
                        {selectedCategory.isDeletedPublished === true && selectedCategory.isDeleted === true
                          ? 'Deleted (published)'
                          : selectedCategory.isDeleted
                            ? 'Restore'
                            : 'Delete'}
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={saving || selectedCategory.isDeleted}
                      onClick={async () => {
                        if (!user || !selectedCategory) return;
                        const nextHidden = !selectedCategory.isHidden;

                        const confirmed = confirm(
                          `${nextHidden ? 'Hide' : 'Unhide'} category "${selectedCategory.name}"?\n\n` +
                            `This writes to the current draft and can be published in Version Manifest.`
                        );
                        if (!confirmed) return;

                        setSaving(true);
                        setError(null);
                        setSuccessMessage(null);

                        const res = await setDraftCategoryHidden(
                          {
                            categorySlug: selectedCategory.slug,
                            source: (selectedCategory.source as any) || 'sqlite',
                            isHidden: nextHidden,
                          },
                          { uid: user.uid, displayName: user.displayName, email: user.email }
                        );

                        if (!res.success) {
                          setError(res.error || 'Failed to update category');
                          setSaving(false);
                          return;
                        }

                        await logActivity(
                          user.uid,
                          user.email || 'unknown',
                          user.displayName || user.email || 'Unknown User',
                          nextHidden ? 'catalog_category_hide' : 'catalog_category_unhide',
                          {
                            resourceType: 'category',
                            resourceId: selectedCategory.slug,
                            resourceName: `${nextHidden ? 'Hidden' : 'Unhid'} category: ${selectedCategory.name}`,
                            metadata: { slug: selectedCategory.slug },
                          }
                        );

                        setSuccessMessage(nextHidden ? 'Category hidden in draft' : 'Category unhidden in draft');
                        window.dispatchEvent(new Event('bridge:content-catalog-changed'));
                        await refreshAll();
                        setSaving(false);
                      }}
                    >
                      {selectedCategory.isHidden ? 'Unhide' : 'Hide'}
                    </button>
                    <button className={styles.primaryButton} onClick={handleSaveCategory} disabled={saving || selectedCategory.isDeleted}>
                      {saving ? 'Saving…' : 'Save to Draft'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'modules' && (
            <>
              {!selectedModule ? (
                creatingModule ? (
                  <div className={styles.editor}>
                    <h2 className={styles.editorTitle}>Create Module</h2>

                    <div className={styles.formRow}>
                      <label className={styles.label}>
                        Category
                        <select
                          className={styles.select}
                          value={newModCategorySlug}
                          onChange={(e) => setNewModCategorySlug(e.target.value)}
                        >
                          {categories.map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className={styles.formRow}>
                      <label className={styles.label}>
                        Title
                        <input className={styles.input} value={newModTitle} onChange={(e) => setNewModTitle(e.target.value)} />
                      </label>
                    </div>

                    <div className={styles.formRow}>
                      <label className={styles.label}>
                        Description
                        <textarea
                          className={styles.textarea}
                          value={newModDescription}
                          onChange={(e) => setNewModDescription(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.label}>Icon</div>
                      <div className={styles.iconRow}>
                        <label className={styles.radio}>
                          <input
                            type="radio"
                            name="newModIconType"
                            checked={newModIconType === 'feather'}
                            onChange={() => setNewModIconType('feather')}
                          />
                          Feather
                        </label>
                        <label className={styles.radio}>
                          <input
                            type="radio"
                            name="newModIconType"
                            checked={newModIconType === 'custom'}
                            onChange={() => setNewModIconType('custom')}
                          />
                          Custom
                        </label>
                      </div>

                      {newModIconType === 'feather' ? (
                        <FeatherIconPicker value={newModFeatherIcon} onChange={setNewModFeatherIcon} />
                      ) : (
                        <>
                          <div className={styles.iconPickerRow}>
                            {canUploadAssets ? (
                              <label className={styles.uploadLabel}>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className={styles.fileInput}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadIcon(f);
                                    e.currentTarget.value = '';
                                  }}
                                  disabled={saving}
                                />
                                <span className={styles.secondaryButton}>Upload New Icon</span>
                              </label>
                            ) : (
                              <div className={styles.smallNote}>Only admins can upload new icons.</div>
                            )}

                            <span className={styles.previewIcon}>
                              <ContentItemIcon
                                iconType="custom"
                                iconUrl={newModCustomIconUrl}
                                size={22}
                                ariaLabel={newModTitle || 'New module'}
                              />
                            </span>
                          </div>

                          <div className={styles.iconGridPicker}>
                            {icons.map((ic) => (
                              <button
                                key={ic.iconId}
                                type="button"
                                className={`${styles.iconPickCell} ${newModCustomIconUrl === ic.downloadUrl ? styles.iconPickCellActive : ''}`}
                                onClick={() => {
                                  setNewModCustomIconId(ic.iconId);
                                  setNewModCustomIconUrl(ic.downloadUrl);
                                }}
                                title={ic.iconId}
                              >
                                <img src={ic.downloadUrl} width={32} height={32} alt="" className={styles.iconImg} />
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div className={styles.actionsRow}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={saving}
                        onClick={async () => {
                          if (!user) return;
                          setSaving(true);
                          setError(null);
                          setSuccessMessage(null);

                          const res = await createDraftCustomModule(
                            {
                              categorySlug: newModCategorySlug,
                              title: newModTitle.trim(),
                              description: newModDescription.trim() ? newModDescription.trim() : null,
                              iconType: newModIconType,
                              icon: newModIconType === 'feather' ? newModFeatherIcon : null,
                              iconId: newModIconType === 'custom' ? newModCustomIconId : null,
                              iconUrl: newModIconType === 'custom' ? newModCustomIconUrl : null,
                            },
                            { uid: user.uid, displayName: user.displayName, email: user.email }
                          );

                          if (!res.success || !res.data) {
                            setError(res.error || 'Failed to create module');
                            setSaving(false);
                            return;
                          }

                          await logActivity(
                            user.uid,
                            user.email || 'unknown',
                            user.displayName || user.email || 'Unknown User',
                            'catalog_module_create',
                            {
                              resourceType: 'module',
                              resourceId: res.data.slug,
                              resourceName: `Created module: ${res.data.title}`,
                              metadata: { slug: res.data.slug, categorySlug: newModCategorySlug },
                            }
                          );

                          setSuccessMessage('Created module in draft');
                          setCreatingModule(false);
                          setNewModTitle('');
                          setNewModDescription('');
                          setNewModIconType('feather');
                          setNewModFeatherIcon('book');
                          setNewModCustomIconId(null);
                          setNewModCustomIconUrl(null);

                          window.dispatchEvent(new Event('bridge:content-catalog-changed'));

                          await refreshAll();
                          setSelectedModuleSlug(res.data.slug);
                          setSaving(false);
                        }}
                      >
                        {saving ? 'Creating…' : 'Create in Draft'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.empty}>Select a module to edit, or create a new one.</div>
                )
              ) : (
                <div className={styles.editor}>
                  <h2 className={styles.editorTitle}>Edit Module</h2>
                  <div className={styles.formRow}>
                    <label className={styles.label}>
                      Title
                      <input className={styles.input} value={modTitle} onChange={(e) => setModTitle(e.target.value)} />
                    </label>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.label}>
                      Description
                      <textarea
                        className={styles.textarea}
                        value={modDescription}
                        onChange={(e) => setModDescription(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.label}>Icon</div>
                    <div className={styles.iconRow}>
                      <label className={styles.radio}>
                        <input
                          type="radio"
                          name="modIconType"
                          checked={modIconType === 'feather'}
                          onChange={() => setModIconType('feather')}
                        />
                        Feather
                      </label>
                      <label className={styles.radio}>
                        <input
                          type="radio"
                          name="modIconType"
                          checked={modIconType === 'custom'}
                          onChange={() => setModIconType('custom')}
                        />
                        Custom
                      </label>
                    </div>

                    {modIconType === 'feather' ? (
                      <FeatherIconPicker value={modFeatherIcon} onChange={setModFeatherIcon} />
                    ) : (
                      <>
                        <div className={styles.iconPickerRow}>
                          {canUploadAssets ? (
                            <label className={styles.uploadLabel}>
                              <input
                                type="file"
                                accept="image/*"
                                className={styles.fileInput}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadIcon(f);
                                  e.currentTarget.value = '';
                                }}
                                disabled={saving}
                              />
                              <span className={styles.secondaryButton}>Upload New Icon</span>
                            </label>
                          ) : (
                            <div className={styles.smallNote}>Only admins can upload new icons.</div>
                          )}

                          <span className={styles.previewIcon}>
                            <ContentItemIcon iconType="custom" iconUrl={modCustomIconUrl} size={22} ariaLabel={selectedModule.title} />
                          </span>
                        </div>

                        <div className={styles.iconGridPicker}>
                          {icons.map((ic) => (
                            <button
                              key={ic.iconId}
                              type="button"
                              className={`${styles.iconPickCell} ${modCustomIconUrl === ic.downloadUrl ? styles.iconPickCellActive : ''}`}
                              onClick={() => {
                                setModCustomIconId(ic.iconId);
                                setModCustomIconUrl(ic.downloadUrl);
                              }}
                              title={ic.iconId}
                            >
                              <img src={ic.downloadUrl} width={32} height={32} alt="" className={styles.iconImg} />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {selectedModule.isDeleted && (
                    <div className={styles.noticeInline}>
                      {selectedModule.isDeletedPublished
                        ? 'This module was deleted in a published version. To restore it, revert to an older version in Version Manifest.'
                        : 'This module is deleted in the draft. Restore it to edit or show it on the site.'}
                    </div>
                  )}

                  <div className={styles.actionsRow}>
                    {canDelete && (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        disabled={saving || (selectedModule.isDeletedPublished === true && selectedModule.isDeleted === true)}
                        title={
                          selectedModule.isDeletedPublished === true && selectedModule.isDeleted === true
                            ? 'Deleted in a published version. Restore by reverting to an older version.'
                            : undefined
                        }
                        onClick={async () => {
                          if (!user || !selectedModule) return;

                          const nextDeleted = !selectedModule.isDeleted;
                          const confirmed = confirm(
                            `${nextDeleted ? 'Hard-delete' : 'Restore'} module "${selectedModule.title}"?\n\n` +
                              `This writes to the current draft and can be published in Version Manifest.`
                          );
                          if (!confirmed) return;

                          setSaving(true);
                          setError(null);
                          setSuccessMessage(null);

                          const res = await setDraftModuleDeleted(
                            {
                              moduleSlug: selectedModule.slug,
                              source: (selectedModule.source as any) || 'sqlite',
                              isDeleted: nextDeleted,
                            },
                            { uid: user.uid, displayName: user.displayName, email: user.email }
                          );

                          if (!res.success) {
                            setError(res.error || 'Failed to update module');
                            setSaving(false);
                            return;
                          }

                          await logActivity(
                            user.uid,
                            user.email || 'unknown',
                            user.displayName || user.email || 'Unknown User',
                            nextDeleted ? 'catalog_module_delete' : 'catalog_module_restore',
                            {
                              resourceType: 'module',
                              resourceId: selectedModule.slug,
                              resourceName: `${nextDeleted ? 'Deleted' : 'Restored'} module: ${selectedModule.title}`,
                              metadata: { slug: selectedModule.slug },
                            }
                          );

                          setSuccessMessage(nextDeleted ? 'Module deleted in draft' : 'Module restored in draft');
                          window.dispatchEvent(new Event('bridge:content-catalog-changed'));
                          await refreshAll();

                          if (nextDeleted) {
                            setSelectedModuleSlug(null);
                            setSelectedPageId(null);
                            setPageDetail(null);
                            setOriginalPageDetail(null);
                            setDraftEditFields(new Set());
                          }

                          setSaving(false);
                        }}
                      >
                        {selectedModule.isDeletedPublished === true && selectedModule.isDeleted === true
                          ? 'Deleted (published)'
                          : selectedModule.isDeleted
                            ? 'Restore'
                            : 'Delete'}
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={saving || selectedModule.isDeleted}
                      onClick={async () => {
                        if (!user || !selectedModule) return;
                        const nextHidden = !selectedModule.isHidden;

                        const confirmed = confirm(
                          `${nextHidden ? 'Hide' : 'Unhide'} module "${selectedModule.title}"?\n\n` +
                            `This writes to the current draft and can be published in Version Manifest.`
                        );
                        if (!confirmed) return;

                        setSaving(true);
                        setError(null);
                        setSuccessMessage(null);

                        const res = await setDraftModuleHidden(
                          {
                            moduleSlug: selectedModule.slug,
                            source: (selectedModule.source as any) || 'sqlite',
                            isHidden: nextHidden,
                          },
                          { uid: user.uid, displayName: user.displayName, email: user.email }
                        );

                        if (!res.success) {
                          setError(res.error || 'Failed to update module');
                          setSaving(false);
                          return;
                        }

                        await logActivity(
                          user.uid,
                          user.email || 'unknown',
                          user.displayName || user.email || 'Unknown User',
                          nextHidden ? 'catalog_module_hide' : 'catalog_module_unhide',
                          {
                            resourceType: 'module',
                            resourceId: selectedModule.slug,
                            resourceName: `${nextHidden ? 'Hidden' : 'Unhid'} module: ${selectedModule.title}`,
                            metadata: { slug: selectedModule.slug },
                          }
                        );

                        setSuccessMessage(nextHidden ? 'Module hidden in draft' : 'Module unhidden in draft');
                        window.dispatchEvent(new Event('bridge:content-catalog-changed'));
                        await refreshAll();
                        setSaving(false);
                      }}
                    >
                      {selectedModule.isHidden ? 'Unhide' : 'Hide'}
                    </button>
                    <button className={styles.primaryButton} onClick={handleSaveModule} disabled={saving || selectedModule.isDeleted}>
                      {saving ? 'Saving…' : 'Save to Draft'}
                    </button>
                  </div>

                  <div className={styles.divider} />

                  <div className={styles.subsectionHeader}>
                    <h3 className={styles.subsectionTitle}>Module Pages</h3>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={saving || !selectedModule}
                      onClick={() => {
                        setCreatingPage(true);
                        setNewPageTitle('');
                      }}
                    >
                      + Add Page
                    </button>
                  </div>

                  {creatingPage && (
                    <div className={styles.pageCreateRow}>
                      <input
                        className={styles.input}
                        placeholder="Page title"
                        value={newPageTitle}
                        onChange={(e) => setNewPageTitle(e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={saving || !selectedModuleSlug}
                        onClick={async () => {
                          if (!user || !selectedModuleSlug) return;
                          setSaving(true);
                          setError(null);
                          setSuccessMessage(null);

                          const res = await createDraftCustomPage(
                            { moduleSlug: selectedModuleSlug, title: newPageTitle.trim() },
                            { uid: user.uid, displayName: user.displayName, email: user.email }
                          );

                          if (!res.success || !res.data) {
                            setError(res.error || 'Failed to create page');
                            setSaving(false);
                            return;
                          }

                          await logActivity(
                            user.uid,
                            user.email || 'unknown',
                            user.displayName || user.email || 'Unknown User',
                            'catalog_page_create',
                            {
                              resourceType: 'page',
                              resourceId: res.data.id,
                              resourceName: `Created page: ${res.data.title}`,
                              metadata: { moduleSlug: selectedModuleSlug, pageSlug: res.data.slug },
                            }
                          );

                          setSuccessMessage('Created page in draft');
                          setCreatingPage(false);
                          setNewPageTitle('');

                          window.dispatchEvent(new Event('bridge:content-pages-changed'));

                          // Refresh page list + select
                          await refreshPages(selectedModuleSlug);

                          setSelectedPageId(res.data.id);
                          await loadPageDetail(res.data.id);
                          setSaving(false);
                        }}
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={saving}
                        onClick={() => {
                          setCreatingPage(false);
                          setNewPageTitle('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {pagesLoading ? (
                    <div className={styles.smallNote}>Loading pages…</div>
                  ) : modulePages.length === 0 ? (
                    <div className={styles.smallNote}>No pages found for this module.</div>
                  ) : (
                    <div className={styles.pageList}>
                      {modulePages.map((p) => (
                        <div
                          key={p.id}
                          className={`${styles.pageRow} ${selectedPageId === p.id ? styles.pageRowActive : ''}`}
                        >
                          <button
                            type="button"
                            className={styles.pageRowMain}
                            onClick={() => {
                              setSelectedPageId(p.id);
                              // Keep editing as an explicit action to reduce accidental edits.
                              setEditingPageId(null);
                            }}
                          >
                            <span className={styles.pageRowTitle}>{p.title}</span>
                            <span className={styles.pageRowMeta}>
                              #{p.page_number} • {p.slug}
                              {p.isDeleted ? ' • deleted' : ''}
                              {p.isHidden ? ' • hidden' : ''}
                            </span>
                          </button>

                          <div
                            className={styles.pageRowActions}
                            ref={openPageMenuId === p.id ? pageMenuRef : undefined}
                          >
                            <button
                              type="button"
                              className={styles.pageRowMenuButton}
                              onClick={(e) => {
                                const nextOpen = openPageMenuId === p.id ? null : p.id;
                                if (nextOpen === null) {
                                  closePageMenu();
                                  return;
                                }

                                pageMenuAnchorElRef.current = e.currentTarget;
                                setPageMenuAnchorRect(e.currentTarget.getBoundingClientRect());
                                setOpenPageMenuId(p.id);
                              }}
                              aria-haspopup="menu"
                              aria-expanded={openPageMenuId === p.id}
                              title="Page actions"
                            >
                              •••
                            </button>

                            {openPageMenuId === p.id &&
                              pageMenuAnchorRect &&
                              typeof document !== 'undefined' &&
                              createPortal(
                                (() => {
                                  const rect = pageMenuAnchorRect;
                                  const offset = 6;
                                  const approxMenuHeight = canDelete ? 200 : 140;
                                  const openUp = window.innerHeight - rect.bottom < approxMenuHeight;
                                  const right = Math.max(8, window.innerWidth - rect.right);

                                  const style: CSSProperties = {
                                    position: 'fixed',
                                    right,
                                    zIndex: 10000,
                                  };

                                  if (openUp) {
                                    style.bottom = Math.max(8, window.innerHeight - rect.top + offset);
                                  } else {
                                    style.top = Math.max(8, rect.bottom + offset);
                                  }

                                  return (
                                    <div
                                      ref={pageMenuPortalRef}
                                      className={styles.pageRowMenu}
                                      role="menu"
                                      style={style}
                                    >
                                      <button
                                        type="button"
                                        className={styles.pageRowMenuItem}
                                        role="menuitem"
                                        disabled={p.isDeleted === true}
                                        onClick={async () => {
                                          closePageMenu();
                                          setSelectedPageId(p.id);
                                          setEditingPageId(p.id);
                                          await loadPageDetail(p.id);
                                        }}
                                      >
                                        Edit
                                      </button>

                                      <button
                                        type="button"
                                        className={styles.pageRowMenuItem}
                                        role="menuitem"
                                        disabled={saving || p.isDeleted === true}
                                        onClick={() => {
                                          closePageMenu();
                                          handleTogglePageHidden(p.id);
                                        }}
                                      >
                                        {p.isHidden ? 'Unhide' : 'Hide'}
                                      </button>

                                      {canDelete && (
                                        <button
                                          type="button"
                                          className={`${styles.pageRowMenuItem} ${styles.pageRowMenuItemDanger}`}
                                          role="menuitem"
                                          disabled={saving || p.isDeletedPublished === true}
                                          title={
                                            p.isDeletedPublished === true
                                              ? 'Deleted in a published version. Restore by reverting to an older version.'
                                              : undefined
                                          }
                                          onClick={() => {
                                            closePageMenu();
                                            handleTogglePageDeleted(p.id);
                                          }}
                                        >
                                          {p.isDeletedPublished === true && p.isDeleted === true
                                            ? 'Deleted (published)'
                                            : p.isDeleted
                                              ? 'Restore'
                                              : 'Delete'}
                                        </button>
                                      )}
                                    </div>
                                  );
                                })(),
                                document.body
                              )}
                          </div>

                          {editingPageId === p.id && (
                            <div className={styles.pageInlineEditor}>
                            {pageLoading || (pageDetail && pageDetail.id !== p.id) ? (
                              <div className={styles.smallNote}>Loading page…</div>
                            ) : !pageDetail || !originalPageDetail || !selectedModule ? (
                              <div className={styles.smallNote}>Unable to load page.</div>
                            ) : (
                              <>
                                <div className={styles.pageEditorHeader}>
                                  <h4 className={styles.pageEditorTitle}>Edit Page</h4>
                                  <div className={styles.pageEditorActions}>
                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      disabled={saving}
                                      onClick={() => {
                                        setEditingPageId(null);
                                      }}
                                    >
                                      Close
                                    </button>

                                    {canDelete && (
                                      <button
                                        type="button"
                                        className={styles.dangerButton}
                                        disabled={saving || (p.isDeletedPublished ?? false)}
                                        title={
                                          (p.isDeletedPublished ?? false)
                                            ? 'Deleted in a published version. Restore by reverting to an older version.'
                                            : undefined
                                        }
                                        onClick={() => handleTogglePageDeleted(p.id)}
                                      >
                                        {(p.isDeletedPublished ?? false) && (p.isDeleted ?? false)
                                          ? 'Deleted (published)'
                                          : (p.isDeleted ?? false)
                                            ? 'Restore'
                                            : 'Delete'}
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      className={styles.secondaryButton}
                                      disabled={saving || (p.isDeleted ?? false)}
                                      onClick={() => handleTogglePageHidden(p.id)}
                                    >
                                      {(p.isHidden ?? false) ? 'Unhide' : 'Hide'}
                                    </button>
                                  </div>
                                </div>

                                {(p.isDeleted ?? false) ? (
                                  <div className={styles.noticeInline}>
                                    {(p.isDeletedPublished ?? false)
                                      ? 'This page was deleted in a published version. To restore it, revert to an older version in Version Manifest.'
                                      : 'This page is deleted in the draft. Restore it to edit.'}
                                  </div>
                                ) : (
                                  <>
                                    <div className={styles.formRow}>
                                      <div className={styles.label}>Title</div>
                                      <EditableContent
                                        pageId={pageDetail.id}
                                        moduleSlug={selectedModule.slug}
                                        pageSlug={pageDetail.slug}
                                        resourceName={`${selectedModule.title}: ${originalPageDetail.title}`}
                                        field="title"
                                        value={pageDetail.title}
                                        originalValue={originalPageDetail.title}
                                        hasDraftEdit={draftEditFields.has('title')}
                                        forceEditMode
                                        as="div"
                                        onSave={() => loadPageDetail(pageDetail.id)}
                                        onUndo={() => loadPageDetail(pageDetail.id)}
                                      />
                                    </div>

                                    <div className={styles.formRow}>
                                      <div className={styles.label}>Purpose</div>
                                      <EditableContent
                                        pageId={pageDetail.id}
                                        moduleSlug={selectedModule.slug}
                                        pageSlug={pageDetail.slug}
                                        resourceName={`${selectedModule.title}: ${originalPageDetail.title}`}
                                        field="purpose"
                                        value={pageDetail.purpose || ''}
                                        originalValue={originalPageDetail.purpose || ''}
                                        hasDraftEdit={draftEditFields.has('purpose')}
                                        forceEditMode
                                        as="div"
                                        onSave={() => loadPageDetail(pageDetail.id)}
                                        onUndo={() => loadPageDetail(pageDetail.id)}
                                      />
                                    </div>

                                    <div className={styles.formRow}>
                                      <div className={styles.label}>Content</div>
                                      <EditableContent
                                        pageId={pageDetail.id}
                                        moduleSlug={selectedModule.slug}
                                        pageSlug={pageDetail.slug}
                                        resourceName={`${selectedModule.title}: ${originalPageDetail.title}`}
                                        field="content"
                                        value={pageDetail.content}
                                        originalValue={originalPageDetail.content}
                                        hasDraftEdit={draftEditFields.has('content')}
                                        forceEditMode
                                        as="div"
                                        onSave={() => loadPageDetail(pageDetail.id)}
                                        onUndo={() => loadPageDetail(pageDetail.id)}
                                      />
                                    </div>

                                    <div className={styles.formRow}>
                                      <div className={styles.label}>Reference</div>
                                      <ReferenceEditor
                                        moduleSlug={selectedModule.slug}
                                        basePageSlug={pageDetail.slug}
                                        basePageTitle={originalPageDetail.title}
                                        forceEditMode
                                      />
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {mode === 'home' && (
            <div className={styles.editor}>
              <h2 className={styles.editorTitle}>Home Content</h2>
              <div className={styles.smallNote}>
                Changes are saved to the current draft immediately. Publish in Version Manifest to make them visible to non-editors.
              </div>

              {homeLoading ? (
                <div className={styles.smallNote}>Loading…</div>
              ) : (
                <>
                  <div className={styles.formRow}>
                    <div className={styles.label}>Educational Journey Title</div>
                    <EditableContent
                      pageId={HOME_EDUCATIONAL_JOURNEY_PAGE_ID}
                      moduleSlug={HOME_EDUCATIONAL_JOURNEY_MODULE_SLUG}
                      pageSlug={HOME_EDUCATIONAL_JOURNEY_PAGE_SLUG}
                      resourceName="Home: Educational Journey"
                      field="title"
                      value={homeJourneyTitle}
                      originalValue={DEFAULT_EDUCATIONAL_JOURNEY_TITLE}
                      hasDraftEdit={homeDraftEditFields.has('title')}
                      forceEditMode
                      as="div"
                      onSave={async () => {
                        await loadHomeEducationalJourney();
                        window.dispatchEvent(new Event('bridge:home-content-changed'));
                      }}
                      onUndo={async () => {
                        await loadHomeEducationalJourney();
                        window.dispatchEvent(new Event('bridge:home-content-changed'));
                      }}
                    />
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.label}>Educational Journey Content</div>
                    <EditableContent
                      pageId={HOME_EDUCATIONAL_JOURNEY_PAGE_ID}
                      moduleSlug={HOME_EDUCATIONAL_JOURNEY_MODULE_SLUG}
                      pageSlug={HOME_EDUCATIONAL_JOURNEY_PAGE_SLUG}
                      resourceName="Home: Educational Journey"
                      field="content"
                      value={homeJourneyContent}
                      originalValue={DEFAULT_EDUCATIONAL_JOURNEY_CONTENT}
                      hasDraftEdit={homeDraftEditFields.has('content')}
                      forceEditMode
                      as="div"
                      onSave={async () => {
                        await loadHomeEducationalJourney();
                        window.dispatchEvent(new Event('bridge:home-content-changed'));
                      }}
                      onUndo={async () => {
                        await loadHomeEducationalJourney();
                        window.dispatchEvent(new Event('bridge:home-content-changed'));
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {mode === 'advanced' && (
            <div className={styles.editor}>
              <h2 className={styles.editorTitle}>Advanced Settings</h2>
              <div className={styles.smallNote}>
                These settings affect how the admin panel previews base content. Changes may reload the app.
              </div>
              <BaseContentSourceToggle />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
