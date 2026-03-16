import { useEffect, useState } from 'react';
import { usePermissions } from '@hooks/usePermissions';
import {
  getEffectiveCategoriesForRender,
  getEffectiveModulesForCategorySlug,
  type EffectiveCategory,
  type EffectiveModule,
} from '@utils/contentCatalog';
import { ContentItemIcon } from '@components/ContentItemIcon/ContentItemIcon';
import { Icon } from '../Icon/Icon';
import styles from './CategoryListView.module.css';

interface CategoryListViewProps {
  slug: string;
  onNavigateHome?: () => void;
  onNavigateToModule?: (moduleSlug: string) => void;
}

export function CategoryListView({ slug, onNavigateHome, onNavigateToModule }: CategoryListViewProps) {
  const permissions = usePermissions();
  const canIncludeDraft = permissions.canEditContent();

  const [category, setCategory] = useState<EffectiveCategory | null>(null);
  const [modules, setModules] = useState<EffectiveModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCategoryAndModules();
  }, [slug, canIncludeDraft]);

  useEffect(() => {
    const handler = () => {
      loadCategoryAndModules();
    };

    window.addEventListener('bridge:content-catalog-changed', handler);
    return () => window.removeEventListener('bridge:content-catalog-changed', handler);
  }, [slug, canIncludeDraft]);

  const loadCategoryAndModules = async () => {
    setLoading(true);
    setError(null);

    const includeDraft = canIncludeDraft;

    const categoriesResult = await getEffectiveCategoriesForRender({ includeDraft });
    if (!categoriesResult.success || !categoriesResult.data) {
      setError(categoriesResult.error || 'Failed to load categories');
      setLoading(false);
      return;
    }

    const cat = categoriesResult.data.find((c) => c.slug === slug);
    if (!cat) {
      setError('Category not found');
      setLoading(false);
      return;
    }
    setCategory(cat);

    const modulesResult = await getEffectiveModulesForCategorySlug({ categorySlug: slug, includeDraft });
    if (modulesResult.success && modulesResult.data) {
      setModules(modulesResult.data);
    } else {
      setError(modulesResult.error || 'Failed to load modules');
    }

    setLoading(false);
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
          <button onClick={loadCategoryAndModules}>Retry</button>
        </div>
      </div>
    );
  }

  if (!category) {
    return null;
  }

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
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>
          {category.name}
        </span>
      </nav>

      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <ContentItemIcon
            iconType={category.iconType}
            icon={category.icon}
            iconUrl={category.iconUrl}
            size={40}
            ariaLabel={category.name}
          />
        </div>
        <h1 className={styles.title}>{category.name}</h1>
        {category.description && (
          <p className={styles.description}>{category.description}</p>
        )}
      </div>

      {modules.length > 0 ? (
        <div className={styles.moduleGrid}>
          {modules.map((module) => (
            <button
              key={module.id}
              className={styles.moduleCard}
              onClick={() => onNavigateToModule?.(module.slug)}
            >
              <div className={styles.moduleIcon}>
                <ContentItemIcon
                  iconType={module.iconType}
                  icon={module.icon}
                  iconUrl={module.iconUrl}
                  size={32}
                  ariaLabel={module.title}
                />
              </div>
              <h3 className={styles.moduleTitle}>{module.title}</h3>
              {module.description && (
                <p className={styles.moduleDescription}>{module.description}</p>
              )}
              <div className={styles.moduleArrow}>
                <Icon name="chevron-right" size={20} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.emptyState}>No modules available in this category yet.</p>
      )}
    </div>
  );
}
