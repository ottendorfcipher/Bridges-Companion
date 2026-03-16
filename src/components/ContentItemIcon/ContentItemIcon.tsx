import { Icon } from '@components/Icon/Icon';
import styles from './ContentItemIcon.module.css';

export interface ContentItemIconProps {
  iconType?: 'feather' | 'custom';
  icon?: string | null;
  iconUrl?: string | null;
  size?: number;
  ariaLabel?: string;
}

export function ContentItemIcon({
  iconType = 'feather',
  icon,
  iconUrl,
  size = 32,
  ariaLabel,
}: ContentItemIconProps) {
  if (iconType === 'custom' && iconUrl) {
    return (
      <img
        className={styles.customIcon}
        src={iconUrl}
        width={size}
        height={size}
        alt={ariaLabel || ''}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return <Icon name={icon || 'book'} size={size} aria-label={ariaLabel} />;
}
