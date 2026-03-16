# Build Guide - Completing Bridge Companion

This guide will help you finish building Bridge Companion from the current skeleton to a fully functional app.

## Current Status

✅ **Completed:**
- Complete documentation (Architecture, Database, Design System, Installation)
- Project configuration (TypeScript, Vite, PWA)
- Type definitions (database and components)
- Database utilities and hooks
- Global CSS with HIG design tokens
- Basic App shell with loading states
- Entry points (main.tsx, index.html)

🚧 **Remaining Work:**
- Seed database with BAH info dump content
- React components (TabBar, Accordion, ContentRenderer, etc.)
- Content parser for scripture references
- Icon component
- Additional utility functions

## Getting Started

### 1. Install Dependencies

```bash
cd ~/Desktop/bridge-companion
npm install
```

This will install:
- React 18 + TypeScript
- Vite (build tool)
- sql.js (SQLite in browser)
- vite-plugin-pwa (offline support)
- All dev dependencies

### 2. Set Up Database File

You need to create `public/content.db` from the BAH info dump:

**Option A - Manual Creation:**
```bash
# Create empty database
sqlite3 public/content.db < src/data/schema.sql

# Insert seed data (see section below)
```

**Option B - Use Seed Script (Recommended):**
Create `scripts/seed.js` to parse BAH content and populate database.

### 3. Copy Required Assets

```bash
# Create public directory structure
mkdir -p public/sql-wasm

# Copy sql.js WASM files (after npm install)
cp node_modules/sql.js/dist/sql-wasm.wasm public/sql-wasm/
cp node_modules/sql.js/dist/sql-wasm.js public/sql-wasm/
```

### 4. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to see the app.

---

## Component Implementation Guide

### Priority 1: Core Components

#### 1. TabBar Component

**File:** `src/components/TabBar/TabBar.tsx`

```typescript
import { TabBarProps } from '@types/components';
import styles from './TabBar.module.css';

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className={styles.tabBar}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tabItem} ${activeTab === tab.id ? styles.active : ''}`}
          onClick={() => onTabChange(tab.id)}
          aria-label={tab.label}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          <span className={styles.tabIcon}>{/* Icon here */}</span>
          <span className={styles.tabLabel}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
```

**File:** `src/components/TabBar/TabBar.module.css`

Use CSS from `docs/DESIGN_SYSTEM.md` - Tab Bar section.

#### 2. Accordion Component

**File:** `src/components/Accordion/Accordion.tsx`

```typescript
import { useState } from 'react';
import { AccordionProps } from '@types/components';
import { AccordionItem } from './AccordionItem';
import styles from './Accordion.module.css';

export function Accordion({ items, allowMultiple = false, defaultExpanded = [] }: AccordionProps) {
  const [expanded, setExpanded] = useState<number[]>(defaultExpanded);

  const handleToggle = (id: number) => {
    if (allowMultiple) {
      setExpanded(prev => 
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    } else {
      setExpanded(prev => prev.includes(id) ? [] : [id]);
    }
  };

  return (
    <div className={styles.accordion}>
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          {...item}
          isExpanded={expanded.includes(item.id)}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}
```

**File:** `src/components/Accordion/AccordionItem.tsx`

```typescript
import { AccordionItemProps } from '@types/components';
import styles from './Accordion.module.css';

export function AccordionItem({ 
  id, 
  title, 
  content, 
  summary, 
  isExpanded, 
  onToggle 
}: AccordionItemProps) {
  return (
    <div className={`${styles.accordionItem} ${isExpanded ? styles.expanded : ''}`}>
      <button 
        className={styles.accordionHeader}
        onClick={() => onToggle(id)}
        aria-expanded={isExpanded}
      >
        <span className={styles.accordionTitle}>{title}</span>
        <span className={styles.accordionIcon}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
      
      <div className={styles.accordionContent}>
        <div className={styles.accordionBody}>
          {content}
        </div>
      </div>
    </div>
  );
}
```

Use CSS from `docs/DESIGN_SYSTEM.md` - Accordion section.

#### 3. ContentRenderer Component

This is critical - it parses content and renders scripture references.

**File:** `src/components/ContentRenderer/ContentRenderer.tsx`

```typescript
import { ContentRendererProps } from '@types/components';
import { ScriptureCallout } from './ScriptureCallout';
import { ScriptureInline } from './ScriptureInline';
import { useOnline } from '@hooks/useDatabase';

export function ContentRenderer({ content, scriptures, externalLinks }: ContentRendererProps) {
  const isOnline = useOnline();
  
  // Parse content and replace {{scripture:id}} markers
  const parsedContent = content.split(/(\{\{scripture:\d+\}\})/g).map((part, index) => {
    const match = part.match(/\{\{scripture:(\d+)\}\}/);
    
    if (match) {
      const scriptureId = parseInt(match[1]);
      const scripture = scriptures.find(s => s.id === scriptureId);
      
      if (!scripture) return null;
      
      if (scripture.emphasis === 'callout') {
        return <ScriptureCallout key={index} scripture={scripture} isOnline={isOnline} />;
      } else {
        return <ScriptureInline key={index} scripture={scripture} isOnline={isOnline} />;
      }
    }
    
    // Regular HTML content
    return <div key={index} dangerouslySetInnerHTML={{ __html: part }} />;
  });
  
  return <div>{parsedContent}</div>;
}
```

**File:** `src/components/ContentRenderer/ScriptureCallout.tsx`

```typescript
import { ScriptureCalloutProps } from '@types/components';
import styles from './Scripture.module.css';

export function ScriptureCallout({ scripture, isOnline }: ScriptureCalloutProps) {
  const handleClick = () => {
    if (isOnline && scripture.url) {
      window.open(scripture.url, '_blank');
    }
  };

  return (
    <blockquote className={`${styles.scriptureCallout} ${styles[scripture.source]}`}>
      <div className={styles.scriptureReference}>
        <span>{scripture.reference}</span>
        {scripture.url && (
          <a 
            href={scripture.url}
            target="_blank"
            rel="noopener noreferrer"
            className={isOnline ? '' : styles.offline}
            onClick={(e) => !isOnline && e.preventDefault()}
          >
            {isOnline ? '🔗' : '🔌'}
          </a>
        )}
      </div>
      {scripture.text && (
        <p className={styles.scriptureText}>{scripture.text}</p>
      )}
    </blockquote>
  );
}
```

Use CSS from `docs/DESIGN_SYSTEM.md` - Scripture Callout section.

### Priority 2: Views/Pages

#### CategoryView Component

**File:** `src/components/CategoryView.tsx`

```typescript
import { useEffect, useState } from 'react';
import { getCategoryWithSections } from '@utils/database';
import { CategoryWithSections } from '@types/database';
import { Accordion } from './Accordion/Accordion';
import { SectionView } from './SectionView';

export function CategoryView({ slug }: { slug: string }) {
  const [category, setCategory] = useState<CategoryWithSections | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);

  useEffect(() => {
    getCategoryWithSections(slug).then(result => {
      if (result.success && result.data) {
        setCategory(result.data);
      }
    });
  }, [slug]);

  if (!category) return <div>Loading...</div>;

  if (selectedSection) {
    return <SectionView sectionId={selectedSection} onBack={() => setSelectedSection(null)} />;
  }

  const accordionItems = category.sections.map(section => ({
    id: section.id,
    title: section.title,
    summary: section.summary || undefined,
    content: <button onClick={() => setSelectedSection(section.id)}>View Details</button>
  }));

  return (
    <div>
      <h1>{category.name}</h1>
      <p>{category.description}</p>
      <Accordion items={accordionItems} />
    </div>
  );
}
```

### Priority 3: Database Seeding

Create a script to parse your BAH info dump and insert into database:

**File:** `scripts/seed.js`

```javascript
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const db = new Database('public/content.db');

// Read BAH info dump
const content = fs.readFileSync('../BAH_info_Dump.md', 'utf-8');

// Parse and insert categories
const categories = [
  { slug: 'quick-ref', name: 'Quick Reference', icon: 'bolt', sort_order: 0 },
  { slug: 'apologetics', name: 'Apologetics', icon: 'book', sort_order: 1 },
  { slug: 'islam', name: 'Islam Basics', icon: 'moon', sort_order: 2 },
  { slug: 'engagement', name: 'Engagement', icon: 'heart', sort_order: 3 },
  { slug: 'resources', name: 'Resources', icon: 'link', sort_order: 4 }
];

const insertCategory = db.prepare(`
  INSERT INTO categories (name, slug, icon, sort_order, description)
  VALUES (?, ?, ?, ?, ?)
`);

categories.forEach(cat => {
  insertCategory.run(cat.name, cat.slug, cat.icon, cat.sort_order, '');
});

// TODO: Parse sections from BAH content
// TODO: Extract scripture references
// TODO: Identify external links

console.log('Database seeded successfully');
```

## Testing

### Manual Testing Checklist

- [ ] App loads without errors
- [ ] Database initializes correctly
- [ ] Tab navigation works
- [ ] Accordions expand/collapse smoothly
- [ ] Scripture references display correctly
- [ ] External links work when online
- [ ] External links show offline indicator when offline
- [ ] Dark mode applies correctly
- [ ] PWA installs to home screen
- [ ] Offline functionality works

### Test on Actual Devices

- iPhone (Safari)
- Android (Chrome)
- Desktop (Chrome/Edge)

## Building for Production

```bash
npm run build
```

Output will be in `/dist` directory.

## Deployment

### Option 1: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```

### Option 2: Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

### Option 3: GitHub Pages

Add to `package.json`:
```json
{
  "homepage": "https://yourusername.github.io/bridge-companion",
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```

## Next Steps

1. **Seed the database** - This is critical for the app to function
2. **Build TabBar and Accordion** - Core navigation
3. **Build ContentRenderer** - Critical for displaying formatted content
4. **Test on real devices** - Ensure PWA works correctly
5. **Add remaining components** as needed

## Resources

- **Design System**: See `docs/DESIGN_SYSTEM.md` for all component specs
- **Database Schema**: See `docs/DATABASE.md` for data structure
- **Architecture**: See `docs/ARCHITECTURE.md` for system design
- **HIG Guidelines**: https://developer.apple.com/design/human-interface-guidelines/

## Troubleshooting

### Database not loading
- Ensure `public/content.db` exists
- Check browser console for errors
- Verify sql-wasm files are in `public/sql-wasm/`

### PWA not installing
- Must be served over HTTPS (except localhost)
- Check `manifest.json` is being generated
- Verify service worker is registered

### Styles not applying
- Check CSS custom properties are defined in `global.css`
- Verify CSS modules are being imported correctly
- Check browser DevTools for CSS errors

## Support

For issues or questions, refer to:
- Project documentation in `/docs`
- TypeScript types for API reference
- Component prop types for usage examples
