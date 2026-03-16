import { useEffect, useState } from 'react';
import { usePermissions } from '@hooks/usePermissions';
import { getEffectiveCategoriesForRender, type EffectiveCategory } from '@utils/contentCatalog';
import { getPageContentEdits, applyContentEdits } from '@utils/contentManagement';
import { getCurrentVersionKey, getDraftVersionKey } from '@utils/versionManagement';
import {
  DEFAULT_EDUCATIONAL_JOURNEY_CONTENT,
  DEFAULT_EDUCATIONAL_JOURNEY_TITLE,
  HOME_EDUCATIONAL_JOURNEY_PAGE_ID,
} from '@utils/homeContent';
import { ContentItemIcon } from '@components/ContentItemIcon/ContentItemIcon';
import { Icon } from '../Icon/Icon';
import styles from './Home.module.css';

interface HomeProps {
  onNavigate: (categorySlug: string) => void;
}

/**
 * Home/Dashboard Screen
 * Displays categories as quick access tiles
 */
export function Home({ onNavigate }: HomeProps) {
  const permissions = usePermissions();
  const canIncludeDraft = permissions.canEditContent();

  const [categories, setCategories] = useState<EffectiveCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [journeyTitle, setJourneyTitle] = useState(DEFAULT_EDUCATIONAL_JOURNEY_TITLE);
  const [journeyContent, setJourneyContent] = useState(DEFAULT_EDUCATIONAL_JOURNEY_CONTENT);

  useEffect(() => {
    loadCategories();
    loadEducationalJourney();
  }, [canIncludeDraft]);

  useEffect(() => {
    const handler = () => {
      loadCategories();
    };

    window.addEventListener('bridge:content-catalog-changed', handler);
    return () => window.removeEventListener('bridge:content-catalog-changed', handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      loadEducationalJourney();
    };

    window.addEventListener('bridge:home-content-changed', handler);
    return () => window.removeEventListener('bridge:home-content-changed', handler);
  }, []);

  const loadCategories = async () => {
    const includeDraft = canIncludeDraft;
    const result = await getEffectiveCategoriesForRender({ includeDraft });
    if (result.success && result.data) {
      setCategories(result.data);
    }
    setLoading(false);
  };

  const loadEducationalJourney = async () => {
    const includeDraft = canIncludeDraft;

    const currentKeyRes = await getCurrentVersionKey();
    const currentKey = currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

    const draftKeyRes = includeDraft ? await getDraftVersionKey() : null;
    const draftKey = includeDraft && draftKeyRes?.success && draftKeyRes.data ? draftKeyRes.data : '0.1.1';

    const [currentEditsRes, draftEditsRes] = await Promise.all([
      getPageContentEdits(HOME_EDUCATIONAL_JOURNEY_PAGE_ID, currentKey),
      includeDraft ? getPageContentEdits(HOME_EDUCATIONAL_JOURNEY_PAGE_ID, draftKey) : Promise.resolve(null),
    ]);

    const currentEdits = currentEditsRes.success && currentEditsRes.data ? currentEditsRes.data : null;
    const draftEdits = draftEditsRes && draftEditsRes.success && draftEditsRes.data ? draftEditsRes.data : null;

    const base = {
      id: HOME_EDUCATIONAL_JOURNEY_PAGE_ID,
      title: DEFAULT_EDUCATIONAL_JOURNEY_TITLE,
      content: DEFAULT_EDUCATIONAL_JOURNEY_CONTENT,
    };

    const withPublished = applyContentEdits(base, currentEdits);
    const withDraft = includeDraft ? applyContentEdits(withPublished, draftEdits) : withPublished;

    setJourneyTitle(withDraft.title || DEFAULT_EDUCATIONAL_JOURNEY_TITLE);
    setJourneyContent(withDraft.content || DEFAULT_EDUCATIONAL_JOURNEY_CONTENT);
  };

  if (loading) {
    return (
      <div className={styles.home}>
      <div className={styles.hero}>
        <div className={styles.heroLogo}>
          <img 
            src="/images/bridges_light_main_icon.png" 
            alt="Bridge Companion Logo"
            className={styles.logoLight}
          />
          <img 
            src="/images/bridges_dark_main_icon.png" 
            alt="Bridge Companion Logo"
            className={styles.logoDark}
          />
        </div>
        <h1 className={styles.heroTitle}>Bridge Companion</h1>
        <p className={styles.heroSubtitle}>
          Your guide for faith dialogue and understanding
        </p>
      </div>
      <div className={styles.quickStart}>
        <h2 className={styles.sectionTitle}>Loading...</h2>
      </div>
      </div>
    );
  }

  return (
    <div className={styles.home}>
      <div className={styles.hero}>
        <div className={styles.heroLogo}>
          <img 
            src="/images/bridges_light_main_icon.png" 
            alt="Bridge Companion Logo"
            className={styles.logoLight}
          />
          <img 
            src="/images/bridges_dark_main_icon.png" 
            alt="Bridge Companion Logo"
            className={styles.logoDark}
          />
        </div>
        <h1 className={styles.heroTitle}>Bridge Companion</h1>
        <p className={styles.heroSubtitle}>
          Your guide for faith dialogue and understanding
        </p>
      </div>

      <section className={styles.quickStart}>
        <div className={styles.topicGrid}>
          {categories.map((category) => (
            <button
              key={category.id}
              className={styles.topicCard}
              onClick={() => onNavigate(category.slug)}
            >
              <div className={styles.topicIcon}>
                <ContentItemIcon
                  iconType={category.iconType}
                  icon={category.icon}
                  iconUrl={category.iconUrl}
                  size={32}
                  ariaLabel={category.name}
                />
              </div>
              <h3 className={styles.topicTitle}>{category.name}</h3>
              <p className={styles.topicDescription}>{category.description || ''}</p>
              <div className={styles.topicArrow}>
                <Icon name="chevron-right" size={20} />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.mission}>
        <div className={styles.missionCard}>
          <h3 className={styles.missionTitle}>{journeyTitle}</h3>
          <p className={styles.missionText}>{journeyContent}</p>
        </div>
      </section>
    </div>
  );
}
