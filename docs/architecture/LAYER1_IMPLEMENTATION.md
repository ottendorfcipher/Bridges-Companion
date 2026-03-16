# Layer 1 Architecture Implementation Guide

## Overview
The `docs/docs 2` folder contains **Layer 1 Architecture** specifications that define the app's navigation structure, content organization, and safety guardrails. I've created a migration to align the database with these specifications.

## What Was Found in docs/docs 2

### Architecture Files
1. **00-architecture.md** - Primary navigation and module structure
2. **01-language-guardrails.md** - Approved/prohibited language and tone
3. **02-tags-and-search.md** - Tag taxonomy and search logic
4. **03-page-templates.md** - Required structure for 6 page types (A-F)

### Key Architectural Changes

**OLD Structure** (Current App):
```
Categories (Quick Reference, Apologetics, Islam, Engagement, Resources)
└── Sections (content pages)
```

**NEW Structure** (Layer 1):
```
Categories (Learn, Compare, Practice, Language, Reference)
└── Modules (Islam Basics, Scripture Authority, etc.)
    └── Pages (with types A-F, sensitivity levels, tags)
```

## Migration Created

**File**: `src/data/migrations/002_layer1_architecture.sql`

This migration:
1. ✅ Creates 5 primary categories (Learn, Compare, Practice, Language, Reference)
2. ✅ Creates 13 modules across categories
3. ✅ Creates tag taxonomy (topic, tradition, skill tags)
4. ✅ Creates 13 placeholder pages with proper structure
5. ✅ Follows page type templates (A-F) from specifications
6. ✅ Adheres to language guardrails (no "mission", "convert", etc.)
7. ✅ Uses sensitivity levels (low, medium, high)

## Current Status

### ✅ Complete
- Database schema already supports Layer 1 architecture
- Migration SQL file created with correct structure
- All 13 modules defined per specifications
- Tag taxonomy implemented
- Placeholder content follows templates

### ⚠️ Needs Implementation

#### 1. Run the Migration
```bash
# Option A: Rebuild database (destructive)
npm run db:create
sqlite3 public/content.db < src/data/migrations/002_layer1_architecture.sql

# Option B: Run as migration (preserves data if needed)
# Add to migration runner script
```

#### 2. Update App Code to Use New Structure

**Current app expects:**
- `categories` → `sections`

**Layer 1 structure:**
- `categories` → `modules` → `pages`

**Files that need updating:**
- `src/utils/database.ts` - Add `getModules()`, `getPages()`, `getPageDetail()` functions
- `src/components/CategoryView/CategoryView.tsx` - Fetch modules instead of sections
- `src/components/ModuleView/ModuleView.tsx` - NEW component to display module pages
- `src/components/PageView/PageView.tsx` - NEW component for individual pages
- `src/types/database.ts` - Add Module and Page types (already exists in schema)

#### 3. Update UI Components

**Navigation changes:**
- Categories show modules (not sections directly)
- Module pages list individual pages
- Breadcrumbs: Category > Module > Page

**New components needed:**
- **ModuleView** - Lists pages within a module
- **PageRenderer** - Renders different page types (A-F) appropriately
- **ReadingPaths** - Already exists! Shows suggested navigation
- **TagFilter** - Filter pages by topic/tradition/skill

#### 4. Update Home Component

The Home component should show the 5 Layer 1 categories:
- Learn (book icon)
- Compare (link icon)
- Practice (heart icon)
- Language (text.quote icon)
- Reference (doc.text icon)

## Layer 1 Compliance Checklist

### Language Guardrails
- ❌ Remove/replace "apologetics" from user-facing text
- ❌ Replace "mission" with "dialogue" or "learning"
- ❌ Use "belief clarification" not "apologetics"
- ✅ Migration content follows guardrails

### Page Structure
- ✅ Each page has type (A-F)
- ✅ Each page has sensitivity level
- ✅ Each page has depth level
- ⚠️ Pages need full tag assignments
- ⚠️ Reading paths need to be added

### Safety Rules
- ✅ Tone is educational, not recruitment-focused
- ✅ Questions emphasized over conclusions
- ✅ Personal agency respected
- ✅ Multiple perspectives acknowledged

## Quick Start - Apply Layer 1 Architecture

### Step 1: Backup Current Database
```bash
cp public/content.db public/content.db.backup
```

### Step 2: Run Migration
```bash
# Create fresh database with Layer 1 structure
npm run db:create

# Apply migration
sqlite3 public/content.db < src/data/migrations/002_layer1_architecture.sql

# Verify structure
sqlite3 public/content.db "SELECT name, slug FROM categories ORDER BY sort_order;"
```

Expected output:
```
Learn|learn
Compare|compare
Practice|practice
Language|language
Reference|reference
```

### Step 3: Test in Browser
```bash
npm run dev
```

**Expected behavior:**
- ⚠️ App will show error or empty state (database structure changed)
- Need to update code to use modules → pages structure

### Step 4: Update Code (See Next Steps below)

## Next Steps - Code Changes Required

### Priority 1: Database Functions
Add to `src/utils/database.ts`:
```typescript
export async function getModules(categoryId: number): Promise<QueryResult<Module[]>>
export async function getModuleBySlug(slug: string): Promise<QueryResult<Module>>
export async function getPages(moduleId: number): Promise<QueryResult<Page[]>>
export async function getPageBySlug(slug: string): Promise<QueryResult<PageDetail>>
```

### Priority 2: Type Definitions
Add to `src/types/database.ts`:
```typescript
export interface Module {
  id: number;
  category_id: number;
  title: string;
  slug: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface Page {
  id: number;
  module_id: number;
  title: string;
  slug: string;
  page_type: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  sensitivity_level: 'low' | 'medium' | 'high';
  depth_level: 'intro' | 'overview' | 'detailed' | 'reference';
  content: string;
  summary: string | null;
  word_count: number;
  created_at: string;
}

export interface PageDetail extends Page {
  scriptures: Scripture[];
  external_links: ExternalLink[];
  tags: Tag[];
  related_pages: Page[];
}
```

### Priority 3: Update CategoryView
Change from showing sections to showing modules:
```typescript
// OLD: const sections = await getSections(categoryId)
// NEW: const modules = await getModules(categoryId)
```

### Priority 4: Create ModuleView Component
New component to display pages within a module (similar to current CategoryView).

## Documentation

### For Developers
- Read `docs/docs 2/README.md` for Layer 1 overview
- Follow templates in `03-page-templates.md` for content structure
- Respect language guardrails in `01-language-guardrails.md`

### For Content Writers
- Use page type templates (A-F) from `03-page-templates.md`
- Follow prohibited/approved language lists
- Assign proper tags (topic, tradition, skill, sensitivity, depth)
- Keep within word count limits per page type

## Benefits of Layer 1 Architecture

1. **Clearer Navigation** - Users understand Learn → Compare → Practice flow
2. **Safety Guardrails** - Prohibited language prevents recruitment perception
3. **Scalability** - Module structure allows adding content within sections
4. **Search/Discovery** - Rich tagging enables powerful content discovery
5. **Sensitivity Awareness** - Explicit sensitivity levels guide content exposure
6. **Page Types** - Consistent templates improve writing and design

## Migration Path

### Recommended Approach
1. Run migration in development
2. Update code to support both old and new structures temporarily
3. Test thoroughly with Layer 1 data
4. Remove old structure support once stable
5. Deploy with Layer 1 architecture live

### Alternative: Gradual Migration
1. Keep old structure working
2. Add Layer 1 tables alongside
3. Gradually migrate content
4. Switch over when complete

## Questions?

- **Schema questions**: See `src/data/schema.sql`
- **Content questions**: See `docs/docs 2/` architecture files
- **Migration file**: `src/data/migrations/002_layer1_architecture.sql`

---

**Status**: Migration created, ready to apply. Code updates needed to use new structure.
