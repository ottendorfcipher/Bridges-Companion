# Design System Documentation

## Overview

Bridge Companion's design system strictly adheres to Apple Human Interface Guidelines while maintaining flexibility for cross-platform use. This document defines all visual and interaction patterns used throughout the app.

## Design Principles

### 1. Clarity
- Content is paramount - UI never competes with content
- Legible text at all sizes
- Icons are precise and lucid
- Adornments are subtle and appropriate

### 2. Deference  
- Fluid motion and crisp interface help people understand and interact with content
- Content fills the entire screen
- Translucency and blurring provide context

### 3. Depth
- Visual layers and realistic motion convey hierarchy
- Touch and discoverability enhance delight and understanding

## Color Palette

Following iOS system colors for consistency and dark mode support:

### Primary Colors

```css
--color-primary: #007AFF;        /* iOS Blue - Primary actions */
--color-primary-dark: #0051D5;   /* Pressed state */
--color-primary-light: #5AC8FA;  /* Light mode accent */
```

### Semantic Colors

```css
--color-success: #34C759;        /* Green - Success states */
--color-warning: #FF9500;        /* Orange - Warnings */
--color-error: #FF3B30;          /* Red - Errors/destructive */
--color-info: #5AC8FA;           /* Light blue - Info */
```

### Neutral Colors

```css
/* Light Mode */
--color-background: #FFFFFF;
--color-surface: #F2F2F7;        /* Grouped table background */
--color-surface-secondary: #E5E5EA;
--color-text-primary: #000000;
--color-text-secondary: #3C3C43;  /* 60% opacity */
--color-text-tertiary: #3C3C43;   /* 30% opacity */
--color-separator: #C6C6C8;

/* Dark Mode */
--color-background-dark: #000000;
--color-surface-dark: #1C1C1E;
--color-surface-secondary-dark: #2C2C2E;
--color-text-primary-dark: #FFFFFF;
--color-text-secondary-dark: #EBEBF5;  /* 60% opacity */
--color-text-tertiary-dark: #EBEBF5;   /* 30% opacity */
--color-separator-dark: #38383A;
```

### Scripture Source Colors

```css
--color-scripture-bible: #34C759;    /* Green */
--color-scripture-quran: #5AC8FA;    /* Blue */
--color-scripture-hadith: #FF9500;   /* Orange */
--color-scripture-other: #8E8E93;    /* Gray */
```

## Typography

Using iOS system fonts for optimal legibility and performance:

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 
             'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 
             sans-serif;
```

### Text Styles

#### Large Title (Category Headers)
```css
font-size: 34px;
line-height: 41px;
font-weight: 700;  /* Bold */
letter-spacing: 0.374px;
```

#### Title 1 (Section Headers)
```css
font-size: 28px;
line-height: 34px;
font-weight: 700;
letter-spacing: 0.364px;
```

#### Title 2 (Subsection Headers)
```css
font-size: 22px;
line-height: 28px;
font-weight: 700;
letter-spacing: 0.352px;
```

#### Title 3 (Minor Headers)
```css
font-size: 20px;
line-height: 25px;
font-weight: 600;  /* Semibold */
letter-spacing: 0.38px;
```

#### Headline (Emphasized Body)
```css
font-size: 17px;
line-height: 22px;
font-weight: 600;
letter-spacing: -0.408px;
```

#### Body (Default Text)
```css
font-size: 17px;
line-height: 22px;
font-weight: 400;  /* Regular */
letter-spacing: -0.408px;
```

#### Callout (Scripture References)
```css
font-size: 16px;
line-height: 21px;
font-weight: 400;
letter-spacing: -0.32px;
```

#### Subhead (Secondary Info)
```css
font-size: 15px;
line-height: 20px;
font-weight: 400;
letter-spacing: -0.24px;
```

#### Footnote (Metadata)
```css
font-size: 13px;
line-height: 18px;
font-weight: 400;
letter-spacing: -0.078px;
```

#### Caption 1 (Labels)
```css
font-size: 12px;
line-height: 16px;
font-weight: 400;
letter-spacing: 0px;
```

#### Caption 2 (Smallest Text)
```css
font-size: 11px;
line-height: 13px;
font-weight: 400;
letter-spacing: 0.066px;
```

### Dynamic Type Support

All text should respond to user's preferred text size settings:
- Support sizes from -3 to +3 relative to base
- Maintain readability at all sizes
- Allow horizontal scrolling if necessary rather than truncating

## Spacing System

Based on 8px grid for consistency:

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-xxl: 48px;
```

### Component-Specific Spacing

```css
--space-tab-height: 49px;          /* iOS tab bar height */
--space-safe-area-bottom: env(safe-area-inset-bottom);
--space-list-item-height: 44px;    /* Minimum touch target */
--space-accordion-padding: 16px;
--space-content-padding: 20px;
```

## Touch Targets

Following HIG minimum touch target guidelines:

- **Minimum size**: 44 × 44 points (px)
- **Recommended size**: 48 × 48 points for primary actions
- **Spacing between targets**: 8px minimum

### Component Sizes

```css
--size-tab-icon: 28px;
--size-button-height: 44px;
--size-icon-small: 16px;
--size-icon-medium: 24px;
--size-icon-large: 32px;
```

## Border Radius

Matching iOS patterns:

```css
--radius-sm: 8px;    /* Buttons, small cards */
--radius-md: 10px;   /* Cards, modal sheets */
--radius-lg: 12px;   /* Large cards */
--radius-xl: 16px;   /* Full-screen modals */
--radius-full: 999px; /* Pills, badges */
```

## Shadows & Elevation

Subtle shadows for hierarchy:

```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);
```

## Motion & Animation

### Timing Functions

```css
--ease-standard: cubic-bezier(0.4, 0.0, 0.2, 1);  /* Standard iOS curve */
--ease-decelerate: cubic-bezier(0.0, 0.0, 0.2, 1); /* Entering */
--ease-accelerate: cubic-bezier(0.4, 0.0, 1, 1);   /* Exiting */
```

### Durations

```css
--duration-instant: 100ms;   /* State changes */
--duration-fast: 200ms;      /* Accordions, tabs */
--duration-normal: 300ms;    /* Page transitions */
--duration-slow: 400ms;      /* Complex animations */
```

### Motion Principles

- **Smooth & Fluid**: No abrupt changes
- **Natural**: Follow physics-based easing
- **Purposeful**: Animation conveys meaning
- **Restrained**: Don't overuse motion
- **Responsive**: Start immediately on user action

## Component Specifications

### Tab Bar

Following iOS tab bar pattern:

```css
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(49px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  border-top: 0.5px solid var(--color-separator);
  display: flex;
  justify-content: space-around;
  padding-bottom: env(safe-area-inset-bottom);
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  gap: 2px;
  cursor: pointer;
}

.tab-icon {
  width: 28px;
  height: 28px;
  color: var(--color-text-tertiary);
}

.tab-item.active .tab-icon {
  color: var(--color-primary);
}

.tab-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-tertiary);
}

.tab-item.active .tab-label {
  color: var(--color-primary);
}
```

### Accordion

```css
.accordion {
  background: var(--color-background);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: var(--space-sm);
}

.accordion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md);
  min-height: 44px;
  background: var(--color-surface);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.accordion-header:active {
  background: var(--color-surface-secondary);
}

.accordion-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
}

.accordion-icon {
  width: 20px;
  height: 20px;
  color: var(--color-text-secondary);
  transition: transform var(--duration-fast) var(--ease-standard);
}

.accordion.expanded .accordion-icon {
  transform: rotate(180deg);
}

.accordion-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--duration-normal) var(--ease-standard);
}

.accordion.expanded .accordion-content {
  max-height: 5000px; /* Large enough for content */
}

.accordion-body {
  padding: var(--space-md);
  padding-top: var(--space-sm);
}
```

### Scripture Callout

```css
.scripture-callout {
  background: var(--color-surface);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-sm);
  padding: var(--space-md);
  margin: var(--space-md) 0;
}

.scripture-callout.bible {
  border-left-color: var(--color-scripture-bible);
}

.scripture-callout.quran {
  border-left-color: var(--color-scripture-quran);
}

.scripture-callout.hadith {
  border-left-color: var(--color-scripture-hadith);
}

.scripture-reference {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-xs);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.scripture-text {
  font-size: 16px;
  line-height: 21px;
  color: var(--color-text-primary);
  font-style: italic;
}
```

### Inline Scripture Link

```css
.scripture-inline {
  color: var(--color-primary);
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  padding: 2px 0;
  border-bottom: 1px solid transparent;
  transition: border-color var(--duration-fast);
}

.scripture-inline:hover {
  border-bottom-color: var(--color-primary);
}

.scripture-inline.offline {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}
```

### Buttons

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 var(--space-md);
  border-radius: var(--radius-sm);
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-standard);
}

.button-primary {
  background: var(--color-primary);
  color: #FFFFFF;
}

.button-primary:active {
  background: var(--color-primary-dark);
  transform: scale(0.98);
}

.button-secondary {
  background: var(--color-surface);
  color: var(--color-primary);
}

.button-secondary:active {
  background: var(--color-surface-secondary);
}
```

## Layout Patterns

### Content Container

```css
.container {
  max-width: 100%;
  padding: 0 var(--space-content-padding);
  padding-bottom: calc(49px + env(safe-area-inset-bottom) + var(--space-md));
}
```

### List Group (iOS Grouped Style)

```css
.list-group {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin: var(--space-md) 0;
}

.list-item {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-background);
  border-bottom: 0.5px solid var(--color-separator);
}

.list-item:last-child {
  border-bottom: none;
}
```

## Accessibility

### Color Contrast

All text meets WCAG AA standards:
- **Normal text**: 4.5:1 minimum
- **Large text**: 3:1 minimum
- **UI components**: 3:1 minimum

### Focus Indicators

```css
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### Motion Preferences

Respect reduced motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Responsive Breakpoints

Mobile-first approach with minimal breakpoints:

```css
/* Base: Mobile (< 768px) */

/* Tablet: 768px - 1023px */
@media (min-width: 768px) {
  /* Wider content, larger touch targets */
}

/* Desktop: ≥ 1024px */
@media (min-width: 1024px) {
  /* Optional sidebar navigation */
}
```

## Dark Mode

Support automatic dark mode detection:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: var(--color-background-dark);
    --color-surface: var(--color-surface-dark);
    /* etc. */
  }
}
```

## Icons

### Feather Icons Integration

Bridge Companion uses [Feather Icons](https://feathericons.com/) for consistent, cross-platform iconography:

#### Why Feather Icons?
- **280+ icons**: Comprehensive coverage for UI needs
- **Consistent design**: All icons use 24×24px grid with 2px stroke
- **Open source**: MIT licensed, free to use
- **Lightweight**: Only ~11KB minified
- **Accessible**: Built with ARIA support in mind
- **HIG-compliant**: Clean, minimal design aligns with Apple HIG principles

#### Icon Sizes

```css
--icon-xs: 16px;    /* Small inline icons */
--icon-sm: 20px;    /* Inline icons, list items */
--icon-md: 24px;    /* Default size, buttons */
--icon-lg: 28px;    /* Tab bar, headers */
--icon-xl: 32px;    /* Hero sections, feature cards */
--icon-xxl: 48px;   /* Landing page, empty states */
```

#### Usage Guidelines

**Stroke vs. Fill**:
- Default: 2px stroke, no fill (line icons)
- Filled variant: Use `filled={true}` prop for emphasis
- Never mix stroke and fill styles in the same context

**Color**:
- Default: `currentColor` (inherits from parent)
- Active state: `var(--color-primary)`
- Inactive: `var(--color-text-secondary)` or `var(--color-text-tertiary)`
- Never use more than 2 icon colors in a single view

**Accessibility**:
- Always include `aria-label` for interactive icons
- Use `aria-label=""` or omit for decorative icons
- Ensure 44×44px touch target for mobile

#### Component Usage

```tsx
import { Icon } from '@components/Icon/Icon';

// Basic usage
<Icon name="book" size={24} />

// With color and accessibility
<Icon 
  name="search" 
  size={20} 
  color="var(--color-primary)"
  aria-label="Search content"
/>

// Filled variant
<Icon name="bookmark" size={24} filled={true} />
```

#### Semantic Icon System

Bridge Companion uses a semantic icon mapping system (`@utils/semanticIcons.ts`) to ensure consistency:

**Navigation Icons**:
- Learn: `book-open`
- Compare: `git-compare`
- Practice: `message-circle`
- Language: `message-square`
- Reference: `book`

**Scripture Sources**:
- Bible: `book`
- Quran: `moon`
- Hadith: `file-text`
- Other: `message-square`

**Page Types** (Layer 1 architecture):
- A (Overview): `map`
- B (Concept): `zap`
- C (Comparison): `git-compare`
- D (Conversation): `message-circle`
- E (Language): `message-square`
- F (Quick Reference): `file-text`

**Common Actions**:
- Search: `search`
- Filter: `filter`
- Bookmark: `bookmark`
- Share: `share-2`
- Edit: `edit-2`
- Delete: `trash-2`
- Settings: `settings`
- Close: `x`
- Menu: `menu`
- Back: `chevron-left`
- Forward: `chevron-right`

**Sensitivity Indicators**:
- Low: `check-circle` (safe/approachable)
- Medium: `alert-circle` (caution)
- High: `alert-octagon` (deep theological)

#### Available Icons

For a complete list of 280+ Feather icons, visit: https://feathericons.com/

Commonly used icons in Bridge Companion:
- `book`, `book-open` - Learning content
- `message-circle`, `message-square` - Communication
- `moon`, `sun` - Theme/religious symbols
- `search`, `filter` - Navigation
- `bookmark`, `heart` - User actions
- `alert-triangle`, `alert-circle`, `info` - Status indicators
- `chevron-right`, `chevron-left`, `chevron-down`, `chevron-up` - Direction
- `x`, `menu`, `more-horizontal` - UI controls
- `user`, `users` - People
- `file-text`, `file` - Documents
- `video`, `link`, `external-link` - Media

#### Icon Best Practices

1. **Consistency**: Use the same icon for the same action across the app
2. **Context**: Choose icons that are immediately recognizable
3. **Simplicity**: Don't add icons unnecessarily - use them when they aid comprehension
4. **Contrast**: Ensure 3:1 minimum contrast ratio for UI elements
5. **Responsive**: Icons should scale proportionally on different screen sizes
6. **Touch targets**: Minimum 44×44px for mobile interactions
7. **Semantic meaning**: Use `semanticIcons.ts` helpers for consistent mental models

## Loading States

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface) 0%,
    var(--color-surface-secondary) 50%,
    var(--color-surface) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

## Implementation Notes

- Use CSS custom properties for theming
- Implement components as React + CSS Modules
- Support touch, mouse, and keyboard interactions
- Test on actual iOS/Android devices
- Validate against HIG checklist before deployment
