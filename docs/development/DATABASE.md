# Database Schema Documentation

## Overview

Bridge Companion uses SQLite for structured content storage. The schema is designed to support hierarchical content organization, scripture references, external links, and future extensibility.

## Schema Design

### Entity Relationship Diagram

```
┌──────────────┐
│  categories  │
│──────────────│
│ id (PK)      │
│ name         │
│ slug         │
│ icon         │
│ sort_order   │
│ description  │
└──────┬───────┘
       │ 1
       │
       │ N
┌──────┴───────┐
│   sections   │
│──────────────│
│ id (PK)      │
│ category_id  │───┐
│ title        │   │
│ slug         │   │
│ sort_order   │   │
│ content      │   │
│ summary      │   │
└──────┬───────┘   │
       │ 1         │
       │           │
       │ N         │
┌──────┴───────┐   │
│  subsections │   │
│──────────────│   │
│ id (PK)      │   │
│ section_id   │   │
│ title        │   │
│ content      │   │
│ sort_order   │   │
└──────┬───────┘   │
       │           │
       │ 1         │
       │           │
       │ N         │
┌──────┴───────┐   │
│  scriptures  │   │
│──────────────│   │
│ id (PK)      │   │
│ section_id   │───┤
│ reference    │   │
│ text         │   │
│ source       │   │ (Quran/Bible/Hadith)
│ url          │   │
│ emphasis     │   │ (inline/callout)
└──────────────┘   │
                   │
┌──────────────┐   │
│ external_links   │
│──────────────│   │
│ id (PK)      │   │
│ section_id   │───┘
│ title        │
│ url          │
│ type         │ (video/article)
└──────────────┘
```

### Table Definitions

#### categories

Primary content groupings that appear in the tab bar.

```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_sort ON categories(sort_order);
```

**Fields**:
- `id`: Auto-incrementing primary key
- `name`: Display name (e.g., "Quick Reference", "Islam Basics")
- `slug`: URL-friendly identifier for routing
- `icon`: Icon name for tab bar (maps to icon set)
- `sort_order`: Determines tab bar order (0-4)
- `description`: Brief description of category content

**Example Data**:
```sql
INSERT INTO categories (name, slug, icon, sort_order, description) VALUES
('Quick Reference', 'quick-ref', 'bolt', 0, 'Common objections and rapid responses'),
('Apologetics', 'apologetics', 'book', 1, 'Christian doctrine and defenses'),
('Islam Basics', 'islam', 'moon', 2, 'Core Islamic beliefs and practices'),
('Engagement', 'engagement', 'heart', 3, 'Practical guidance for conversations'),
('Resources', 'resources', 'link', 4, 'Videos, articles, and references');
```

#### sections

Major content blocks within each category. Displayed as accordion items.

```sql
CREATE TABLE sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE INDEX idx_sections_category ON sections(category_id, sort_order);
CREATE INDEX idx_sections_slug ON sections(slug);
```

**Fields**:
- `id`: Auto-incrementing primary key
- `category_id`: Foreign key to categories
- `title`: Accordion header text
- `slug`: URL-friendly identifier
- `sort_order`: Order within category
- `content`: Main content (supports basic HTML/markdown)
- `summary`: Optional preview text shown when collapsed

**Content Format**:
Content field supports limited HTML for formatting:
- `<p>` for paragraphs
- `<strong>`, `<em>` for emphasis
- `<ul>`, `<ol>`, `<li>` for lists
- `<h4>`, `<h5>` for subheadings
- Special markers for scripture references: `{{scripture:id}}`

#### subsections

Optional nested content within sections for complex topics.

```sql
CREATE TABLE subsections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

CREATE INDEX idx_subsections_section ON subsections(section_id, sort_order);
```

**Fields**:
- `id`: Auto-incrementing primary key
- `section_id`: Foreign key to sections
- `title`: Subsection heading
- `content`: Subsection content (same format as section content)
- `sort_order`: Order within section

**Usage**: 
- Use sparingly to avoid excessive nesting
- Maximum depth: Category → Section → Subsection
- Alternative: Use lists within section content

#### scriptures

Scripture references with optional external links and styling.

```sql
CREATE TABLE scriptures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    reference TEXT NOT NULL,
    text TEXT,
    source TEXT NOT NULL CHECK(source IN ('quran', 'bible', 'hadith', 'other')),
    url TEXT,
    emphasis TEXT NOT NULL DEFAULT 'inline' CHECK(emphasis IN ('inline', 'callout')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

CREATE INDEX idx_scriptures_section ON scriptures(section_id);
```

**Fields**:
- `id`: Auto-incrementing primary key (referenced in content as `{{scripture:id}}`)
- `section_id`: Foreign key to sections
- `reference`: Citation (e.g., "Surah 5:46", "John 3:16")
- `text`: Optional quoted text (if empty, only reference shown)
- `source`: Type of scripture (determines icon/styling)
- `url`: Optional external link (requires online connection)
- `emphasis`: Display style
  - `inline`: Reference appears in flow of text
  - `callout`: Displayed as highlighted block quote

**URL Format**:
- Bible: `https://www.bible.com/bible/CSB/{book}.{chapter}.{verse}`
- Quran: `https://quran.com/{chapter}:{verse}`
- Hadith: `https://sunnah.com/{collection}/{book}/{number}`

#### external_links

Videos, articles, and other resources.

```sql
CREATE TABLE external_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('video', 'article', 'website')),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

CREATE INDEX idx_links_section ON external_links(section_id);
```

**Fields**:
- `id`: Auto-incrementing primary key
- `section_id`: Foreign key to sections
- `title`: Link display text
- `url`: Full URL (YouTube, article, etc.)
- `type`: Link type (determines icon/presentation)
- `description`: Optional context about the resource

**Display Logic**:
- Only shown when app is online
- Icon varies by type
- Opens in new tab/window
- Warning message if offline

## Content Update Workflow

### For Developers (SQL-Comfortable)

1. **Edit Database Directly**:
   ```bash
   # Open database file
   sqlite3 src/data/content.db
   
   # Run queries
   INSERT INTO sections (category_id, title, content, sort_order) 
   VALUES (1, 'New Topic', '<p>Content here</p>', 10);
   ```

2. **Use Migration Scripts**:
   ```bash
   # Place new migration in src/data/migrations/
   # Run migration
   npm run migrate
   ```

3. **Rebuild App**:
   ```bash
   npm run build
   ```

### Migration File Format

Create numbered migrations in `src/data/migrations/`:

```sql
-- migrations/003_add_new_content.sql
BEGIN TRANSACTION;

INSERT INTO sections (category_id, title, slug, content, sort_order)
VALUES (
    2,
    'New Apologetics Topic',
    'new-topic',
    '<p>Content with {{scripture:101}} reference</p>',
    15
);

INSERT INTO scriptures (section_id, reference, text, source, emphasis)
VALUES (
    last_insert_rowid(),
    'John 1:1',
    'In the beginning was the Word...',
    'bible',
    'callout'
);

COMMIT;
```

### Content Guidelines

**Writing for Scannability**:
- Use clear, descriptive section titles
- Keep paragraphs short (3-4 sentences max)
- Use subheadings liberally
- Emphasize key phrases with `<strong>`
- Use lists for multiple points

**Scripture References**:
- Always provide reference even if text is quoted
- Use `callout` emphasis for key verses students should know
- Use `inline` for supporting references
- Include URL only for verses students might need full context

**Organizing Content**:
- Quick Reference: Single-paragraph responses (< 200 words each)
- Apologetics: Detailed explanations with supporting evidence
- Islam Basics: Factual, respectful descriptions
- Engagement: Practical, action-oriented guidance

## Query Patterns

Common queries for app functionality:

### Get Category with Sections

```sql
SELECT 
    c.id, c.name, c.icon,
    json_group_array(
        json_object(
            'id', s.id,
            'title', s.title,
            'summary', s.summary,
            'sort_order', s.sort_order
        ) ORDER BY s.sort_order
    ) as sections
FROM categories c
LEFT JOIN sections s ON c.id = s.category_id
WHERE c.slug = ?
GROUP BY c.id;
```

### Get Section with Full Content

```sql
SELECT 
    s.id, s.title, s.content,
    (SELECT json_group_array(
        json_object(
            'reference', sc.reference,
            'text', sc.text,
            'source', sc.source,
            'url', sc.url,
            'emphasis', sc.emphasis
        ))
     FROM scriptures sc 
     WHERE sc.section_id = s.id) as scriptures,
    (SELECT json_group_array(
        json_object(
            'title', el.title,
            'url', el.url,
            'type', el.type
        ))
     FROM external_links el 
     WHERE el.section_id = s.id) as external_links
FROM sections s
WHERE s.id = ?;
```

## Backup and Versioning

### Creating Backups

```bash
# Before making changes
cp src/data/content.db src/data/content.db.backup

# With timestamp
cp src/data/content.db "src/data/backups/content_$(date +%Y%m%d_%H%M%S).db"
```

### Version Control

- Commit `.sql` migration files to git
- Do NOT commit `.db` file directly (too large, binary)
- Export schema and seed data as SQL:
  ```bash
  sqlite3 content.db .dump > content.sql
  ```

## Database Size Considerations

Current content estimate:
- Categories: < 1 KB
- Sections: ~50 KB
- Scriptures: ~20 KB
- Total: ~100 KB

SQLite + sql.js overhead:
- sql.js library: ~1 MB
- Database file: ~100 KB
- Total: ~1.1 MB

Acceptable for mobile web app with service worker caching.

## Future Content Management Tool

Planned features:
- Web-based editor for non-technical users
- WYSIWYG content editing
- Scripture lookup and insertion
- Content validation
- Export to .db file
- Version comparison

Schema is designed to support this without changes.
