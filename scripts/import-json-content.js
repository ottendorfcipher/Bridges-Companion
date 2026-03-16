#!/usr/bin/env node
/**
 * Import JSON Content Script
 * Imports cohesive_pages.json and scripture references into the SQLite database
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths
const JSON_DIR = path.join(__dirname, '../docs/content/json-data');
const PAGES_FILE = path.join(JSON_DIR, 'cohesive_pages.json');
const INDEX_FILE = path.join(JSON_DIR, 'layer2-index.json');
const DB_FILE = path.join(__dirname, '../public/content.db');

// Category mapping from section names to category IDs
const CATEGORY_MAP = {
  'Learn': 6,
  'Compare': 7,
  'Practice': 8,
  'Language': 9,
  'Reference': 10
};

// Module name to ID mapping (will be populated from DB)
const moduleMap = {};

class ContentImporter {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    
    // Load module mappings
    const modules = this.db.prepare('SELECT id, title FROM modules').all();
    modules.forEach(mod => {
      moduleMap[mod.title] = mod.id;
    });
  }

  async importContent() {
    console.log('Starting content import...\n');

    try {
      // Load JSON files
      const pagesData = JSON.parse(fs.readFileSync(PAGES_FILE, 'utf-8'));
      const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));

      console.log(`Loaded ${pagesData.page_count} pages from JSON\n`);

      // Begin transaction
      this.db.prepare('BEGIN TRANSACTION').run();

      try {
        // Import pages
        const importedPages = this.importPages(pagesData.pages);
        
        // Import scripture references
        this.importScriptures(importedPages, indexData);

        // Commit transaction
        this.db.prepare('COMMIT').run();
        
        console.log('\n✅ Import completed successfully!');
        console.log(`\nSummary:`);
        console.log(`- Pages imported: ${importedPages.length}`);
        console.log(`- Scripture references linked: ${this.scriptureCount}`);
        
      } catch (error) {
        this.db.prepare('ROLLBACK').run();
        throw error;
      }

    } catch (error) {
      console.error('❌ Import failed:', error.message);
      throw error;
    } finally {
      this.db.close();
    }
  }

  importPages(pages) {
    console.log('Importing pages...');
    
    const insertPage = this.db.prepare(`
      INSERT INTO pages (
        module_id, title, slug, page_number, page_type, 
        sensitivity, display_order, content, summary, purpose
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const importedPages = [];
    let successCount = 0;
    let skipCount = 0;

    for (const page of pages) {
      try {
        // Get module ID
        const moduleId = moduleMap[page.module];
        if (!moduleId) {
          console.log(`⚠️  Skipping page "${page.page_title}" - module "${page.module}" not found`);
          skipCount++;
          continue;
        }

        // Check if page already exists
        const existing = this.db.prepare('SELECT id FROM pages WHERE slug = ?').get(page.slug);
        if (existing) {
          console.log(`⚠️  Skipping "${page.page_title}" - already exists`);
          skipCount++;
          continue;
        }

        // Map page_type (A-F) to readable type
        const pageType = this.mapPageType(page.page_type);
        
        // Extract sensitivity level (default to low)
        const sensitivity = (page.sensitivity || 'low').toLowerCase();

        // Prepare content (already in HTML format from JSON)
        const content = this.prepareContent(page.page_content);

        // Insert page
        const result = insertPage.run(
          moduleId,
          page.page_title,
          page.slug,
          page.page_number,
          pageType,
          sensitivity,
          page.page_number, // Use page_number as display_order
          content,
          page.summary || this.generateSummary(content),
          page.purpose || null
        );

        importedPages.push({
          id: result.lastInsertRowid,
          originalId: page.id,
          slug: page.slug,
          module: page.module
        });

        successCount++;
        
        if (successCount % 10 === 0) {
          console.log(`  Imported ${successCount} pages...`);
        }

      } catch (error) {
        console.error(`❌ Error importing page "${page.page_title}":`, error.message);
        throw error;
      }
    }

    console.log(`✅ Imported ${successCount} pages (${skipCount} skipped)\n`);
    return importedPages;
  }

  importScriptures(importedPages, indexData) {
    console.log('Importing scripture references...');
    
    this.scriptureCount = 0;
    
    // Create lookup map from original page ID to new page ID
    const pageIdMap = {};
    importedPages.forEach(p => {
      pageIdMap[p.originalId] = p.id;
    });

    const insertScripture = this.db.prepare(`
      INSERT OR IGNORE INTO scriptures (id, reference, text, source, url, emphasis)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertPageScripture = this.db.prepare(`
      INSERT OR IGNORE INTO page_scriptures (page_id, scripture_id, display_order)
      VALUES (?, ?, ?)
    `);

    for (const [originalPageId, scriptureIds] of Object.entries(indexData)) {
      const newPageId = pageIdMap[originalPageId];
      
      if (!newPageId) {
        continue; // Page wasn't imported
      }

      scriptureIds.forEach((scriptureId, index) => {
        try {
          // Load scripture JSON file
          const scriptureData = this.loadScriptureFile(scriptureId);
          
          if (scriptureData) {
            // Insert scripture
            insertScripture.run(
              scriptureData.id,
              scriptureData.label,
              scriptureData.text || null,
              scriptureData.type,
              scriptureData.url || null,
              'inline' // Default emphasis
            );

            // Link to page
            insertPageScripture.run(newPageId, scriptureData.id, index);
            this.scriptureCount++;
          }

        } catch (error) {
          console.warn(`⚠️  Could not import scripture ${scriptureId}:`, error.message);
        }
      });
    }

    console.log(`✅ Imported ${this.scriptureCount} scripture references\n`);
  }

  loadScriptureFile(scriptureId) {
    // Determine file path based on scripture type
    let filePath;
    
    if (scriptureId.startsWith('bible-')) {
      filePath = path.join(JSON_DIR, 'bible', `${scriptureId}.json`);
    } else if (scriptureId.startsWith('quran-')) {
      filePath = path.join(JSON_DIR, 'quran', `${scriptureId}.json`);
    } else if (scriptureId.startsWith('hadith-')) {
      filePath = path.join(JSON_DIR, 'hadith', `${scriptureId}.json`);
    } else if (scriptureId.startsWith('tafsir-')) {
      filePath = path.join(JSON_DIR, 'tafsir', `${scriptureId}.json`);
    } else {
      return null;
    }

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data;
  }

  mapPageType(pageTypeCode) {
    const typeMap = {
      'A (Overview)': 'overview',
      'B (Concept)': 'concept',
      'C (Comparison)': 'comparison',
      'D (Conversation Guide)': 'conversation',
      'E (Language)': 'language',
      'F (Reference)': 'reference'
    };
    
    return typeMap[pageTypeCode] || 'standard';
  }

  prepareContent(content) {
    // Content is already in markdown/HTML format
    // We need to ensure it's properly formatted for the app
    
    // The app expects HTML content with {{scripture:id}} markers
    // The JSON content already has the right structure
    
    return content.trim();
  }

  generateSummary(content) {
    // Extract first paragraph or first 150 characters
    const text = content.replace(/<[^>]+>/g, '').replace(/#{1,6}\s+/g, '');
    const firstParagraph = text.split('\n\n')[0];
    
    if (firstParagraph.length > 150) {
      return firstParagraph.substring(0, 147) + '...';
    }
    
    return firstParagraph;
  }
}

// Main execution
async function main() {
  console.log('Bridge Companion - JSON Content Importer\n');
  console.log('==========================================\n');

  // Check if files exist
  if (!fs.existsSync(PAGES_FILE)) {
    console.error(`❌ Pages file not found: ${PAGES_FILE}`);
    process.exit(1);
  }

  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`❌ Index file not found: ${INDEX_FILE}`);
    process.exit(1);
  }

  if (!fs.existsSync(DB_FILE)) {
    console.error(`❌ Database not found: ${DB_FILE}`);
    console.error('   Run `npm run db:create` first to create the database.');
    process.exit(1);
  }

  try {
    const importer = new ContentImporter(DB_FILE);
    await importer.importContent();
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
