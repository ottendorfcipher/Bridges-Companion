/**
 * Build Bridge Companion database from app-content (Layer 1 & Layer 2)
 * 
 * This script:
 * 1. Parses all layer1/*.md files to extract modules and pages
 * 2. Parses all layer2 JSON files to extract scripture references
 * 3. Creates a SQLite database with the new schema
 * 4. Populates the database with parsed content
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Paths
const CONTENT_DIR = path.join(__dirname, '../docs/docs 2/app-content');
const LAYER1_DIR = path.join(CONTENT_DIR, 'layer1');
const LAYER2_DIR = path.join(CONTENT_DIR, 'layer2');
const DB_PATH = path.join(__dirname, '../public/content.db');
const SCHEMA_PATH = path.join(__dirname, '../src/data/schema-v2.sql');

// Section icons mapping
const SECTION_ICONS = {
  'Learn': 'book',
  'Conversations': 'chat',
  'Quick Reference': 'list',
  'Language': 'globe'
};

/**
 * Parse a Layer 1 markdown file into module and pages
 */
function parseLayer1File(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath, '-layer1.md');
  
  // Extract module title and metadata from first heading
  const titleMatch = content.match(/^#\s+(.+?)$/m);
  const sectionMatch = content.match(/\*\*Section:\*\*\s+(.+?)$/m);
  
  if (!titleMatch) {
    console.warn(`No title found in ${filename}`);
    return null;
  }
  
  const module = {
    slug: filename,
    title: titleMatch[1].trim(),
    section: sectionMatch ? sectionMatch[1].trim() : 'Learn',
    description: null,
    icon: null
  };
  
  // Extract pages (sections starting with ##)
  const pages = [];
  const pageRegex = /##\s+Page\s+(\d+)\s+—\s+(.+?)\n([\s\S]*?)(?=##\s+Page\s+\d+|$)/g;
  
  let pageMatch;
  while ((pageMatch = pageRegex.exec(content)) !== null) {
    const pageNumber = parseInt(pageMatch[1]);
    const pageTitle = pageMatch[2].trim();
    const pageContent = pageMatch[3].trim();
    
    // Extract metadata
    const pageTypeMatch = pageContent.match(/\*\*Page Type:\*\*\s+(\w+)/);
    const sensitivityMatch = pageContent.match(/\*\*Sensitivity:\*\*\s+(\w+)/);
    const depthMatch = pageContent.match(/\*\*Depth:\*\*\s+(\w+)/);
    const purposeMatch = pageContent.match(/\*\*Purpose:\*\*\s*\n(.+?)(?=\n###|\n\*\*|$)/s);
    
    // Extract actual content (everything after metadata)
    let contentBody = pageContent;
    contentBody = contentBody.replace(/\*\*Page Type:\*\*[^\n]*\n?/g, '');
    contentBody = contentBody.replace(/\*\*Sensitivity:\*\*[^\n]*\n?/g, '');
    contentBody = contentBody.replace(/\*\*Depth:\*\*[^\n]*\n?/g, '');
    contentBody = contentBody.replace(/\*\*Purpose:\*\*\s*\n[^\n]+\n?/g, '');
    contentBody = contentBody.replace(/^---+\s*$/gm, ''); // Remove horizontal rules
    contentBody = contentBody.trim();
    
    // Convert markdown to simple HTML
    contentBody = markdownToSimpleHTML(contentBody);
    
    pages.push({
      module_slug: filename,
      slug: `page-${pageNumber}`,
      page_number: pageNumber,
      title: pageTitle,
      page_type: pageTypeMatch ? pageTypeMatch[1] : null,
      sensitivity: sensitivityMatch ? sensitivityMatch[1] : null,
      depth: depthMatch ? depthMatch[1] : null,
      purpose: purposeMatch ? purposeMatch[1].trim() : null,
      content: contentBody,
      display_order: pageNumber
    });
  }
  
  return { module, pages };
}

/**
 * Simple markdown to HTML converter
 */
function markdownToSimpleHTML(markdown) {
  let html = markdown;
  
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Paragraphs (lines separated by double newlines)
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs
    .map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul>')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
  
  return html;
}

/**
 * Parse Layer 2 scripture JSON files
 */
function parseLayer2Files() {
  const scriptures = [];
  const types = ['bible', 'quran', 'hadith', 'tafsir'];
  
  for (const type of types) {
    const typeDir = path.join(LAYER2_DIR, type);
    if (!fs.existsSync(typeDir)) continue;
    
    const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const filePath = path.join(typeDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      scriptures.push({
        id: data.id,
        type: data.type,
        label: data.label,
        source_data: JSON.stringify(data.source),
        emphasis: data.emphasis || 'inline'
      });
    }
  }
  
  return scriptures;
}

/**
 * Parse Layer 2 index.json (page-scripture mappings)
 */
function parseLayer2Index() {
  const indexPath = path.join(LAYER2_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) return {};
  
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

/**
 * Create and populate database
 */
function buildDatabase() {
  console.log('🔨 Building Bridge Companion database from app-content...\n');
  
  // Remove existing database
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('✓ Removed existing database');
  }
  
  // Create new database
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  
  // Load and execute schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  console.log('✓ Created database schema\n');
  
  // Parse Layer 1 content
  console.log('📖 Parsing Layer 1 content...');
  const files = fs.readdirSync(LAYER1_DIR).filter(f => f.endsWith('-layer1.md'));
  
  const allModules = [];
  const allPages = [];
  
  for (const file of files) {
    const filePath = path.join(LAYER1_DIR, file);
    const parsed = parseLayer1File(filePath);
    
    if (parsed) {
      allModules.push(parsed.module);
      allPages.push(...parsed.pages);
      console.log(`  ✓ ${parsed.module.title} (${parsed.pages.length} pages)`);
    }
  }
  
  // Parse Layer 2 content
  console.log('\n📜 Parsing Layer 2 scriptures...');
  const scriptures = parseLayer2Files();
  console.log(`  ✓ Found ${scriptures.length} scripture references`);
  
  const pageScriptureIndex = parseLayer2Index();
  console.log(`  ✓ Found ${Object.keys(pageScriptureIndex).length} page-scripture mappings\n`);
  
  // Insert modules
  console.log('💾 Inserting data...');
  const insertModule = db.prepare(`
    INSERT INTO modules (slug, title, section, description, icon, display_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const moduleIdMap = {};
  allModules.forEach((module, index) => {
    module.icon = SECTION_ICONS[module.section] || 'book';
    module.display_order = index + 1;
    
    const result = insertModule.run(
      module.slug,
      module.title,
      module.section,
      module.description,
      module.icon,
      module.display_order
    );
    
    moduleIdMap[module.slug] = result.lastInsertRowid;
  });
  console.log(`  ✓ Inserted ${allModules.length} modules`);
  
  // Insert pages
  const insertPage = db.prepare(`
    INSERT INTO pages (module_id, slug, page_number, title, page_type, sensitivity, depth, purpose, content, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const pageIdMap = {};
  allPages.forEach(page => {
    const moduleId = moduleIdMap[page.module_slug];
    if (!moduleId) {
      console.warn(`  ⚠️  Module not found for page: ${page.module_slug}`);
      return;
    }
    
    const result = insertPage.run(
      moduleId,
      page.slug,
      page.page_number,
      page.title,
      page.page_type,
      page.sensitivity,
      page.depth,
      page.purpose,
      page.content,
      page.display_order
    );
    
    const pageKey = `${page.module_slug}-${page.slug}`;
    pageIdMap[pageKey] = result.lastInsertRowid;
  });
  console.log(`  ✓ Inserted ${allPages.length} pages`);
  
  // Insert scriptures
  const insertScripture = db.prepare(`
    INSERT INTO scriptures (id, type, label, source_data, emphasis)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  scriptures.forEach(scripture => {
    insertScripture.run(
      scripture.id,
      scripture.type,
      scripture.label,
      scripture.source_data,
      scripture.emphasis
    );
  });
  console.log(`  ✓ Inserted ${scriptures.length} scriptures`);
  
  // Insert page-scripture relationships
  const insertPageScripture = db.prepare(`
    INSERT INTO page_scriptures (page_id, scripture_id, display_order)
    VALUES (?, ?, ?)
  `);
  
  let relationshipCount = 0;
  for (const [pageRef, scriptureIds] of Object.entries(pageScriptureIndex)) {
    // pageRef format: "islamic-dilemma-page-4"
    const parts = pageRef.split('-page-');
    if (parts.length !== 2) continue;
    
    const moduleSlug = parts[0];
    const pageSlug = `page-${parts[1]}`;
    const pageKey = `${moduleSlug}-${pageSlug}`;
    const pageId = pageIdMap[pageKey];
    
    if (!pageId) {
      console.warn(`  ⚠️  Page not found: ${pageRef}`);
      continue;
    }
    
    scriptureIds.forEach((scriptureId, index) => {
      insertPageScripture.run(pageId, scriptureId, index + 1);
      relationshipCount++;
    });
  }
  console.log(`  ✓ Inserted ${relationshipCount} page-scripture relationships`);
  
  db.close();
  
  console.log('\n✅ Database built successfully!');
  console.log(`📊 Summary:`);
  console.log(`   - ${allModules.length} modules`);
  console.log(`   - ${allPages.length} pages`);
  console.log(`   - ${scriptures.length} scriptures`);
  console.log(`   - ${relationshipCount} page-scripture links`);
  console.log(`\n💾 Database saved to: ${DB_PATH}`);
}

// Run the build
try {
  buildDatabase();
} catch (error) {
  console.error('\n❌ Error building database:', error);
  process.exit(1);
}
