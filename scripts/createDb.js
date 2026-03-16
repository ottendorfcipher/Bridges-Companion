#!/usr/bin/env node

/**
 * Database Creation Script
 * Creates content.db from schema.sql with sample seed data
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.join(__dirname, '../src/data/schema-clean.sql');
const OUTPUT_PATH = path.join(__dirname, '../public/content.db');

async function createDatabase() {
  try {
    console.log('🔨 Creating database...');
    
    // Initialize SQL.js
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    
    // Read and execute schema
    console.log('📋 Loading schema...');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.run(schema);
    
    // Add sample seed data
    console.log('🌱 Adding seed data...');
    
    // Sample educational categories
    db.run(`
      INSERT INTO categories (name, slug, icon, sort_order, description) VALUES
      ('Learn', 'learn', 'book', 0, 'Core educational concepts and theories'),
      ('Practice', 'practice', 'target', 1, 'Practical applications and strategies'),
      ('Skills', 'skills', 'tool', 2, 'Essential skills development'),
      ('Reference', 'reference', 'bookmark', 3, 'Quick references and resources');
    `);
    
    // Sample modules
    db.run(`
      INSERT INTO modules (category_id, name, slug, sort_order, description) VALUES
      (1, 'Learning Theory', 'learning-theory', 1, 'Fundamental learning theories and their applications'),
      (2, 'Instructional Design', 'instructional-design', 1, 'Design principles for effective instruction');
    `);
    
    // Sample pages
    db.run(`
      INSERT INTO pages (module_id, title, slug, sort_order, content, page_type, status) VALUES
      (1, 'Introduction to Learning Theory', 'introduction', 1, 
       '<h2>Welcome to Learning Theory</h2><p>This module explores fundamental theories of how people learn and acquire knowledge.</p>', 
       'content', 'published'),
      (2, 'ADDIE Model', 'addie-model', 1, 
       '<h2>ADDIE Instructional Design Model</h2><p>ADDIE is a systematic approach to instructional design consisting of Analysis, Design, Development, Implementation, and Evaluation.</p>', 
       'content', 'published');
    `);
    
    // Export database to file
    const data = db.export();
    const buffer = Buffer.from(data);
    
    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_PATH, buffer);
    
    console.log('✅ Database created successfully!');
    console.log(`📁 Location: ${OUTPUT_PATH}`);
    
    // Show stats
    const stats = db.exec(`
      SELECT 
        (SELECT COUNT(*) FROM categories) as categories,
        (SELECT COUNT(*) FROM modules) as modules,
        (SELECT COUNT(*) FROM pages) as pages,
        (SELECT COUNT(*) FROM external_links) as links
    `)[0];
    
    if (stats && stats.values[0]) {
      const [categories, modules, pages, links] = stats.values[0];
      console.log('\n📊 Database Stats:');
      console.log(`   Categories: ${categories}`);
      console.log(`   Modules: ${modules}`);
      console.log(`   Pages: ${pages}`);
      console.log(`   External Links: ${links}`);
    }
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error creating database:', error);
    process.exit(1);
  }
}

createDatabase();
