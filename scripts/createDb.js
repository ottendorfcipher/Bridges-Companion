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

const SCHEMA_PATH = path.join(__dirname, '../src/data/schema.sql');
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
    
    // Sample categories
    db.run(`
      INSERT INTO categories (name, slug, icon, sort_order, description) VALUES
      ('Quick Reference', 'quick-ref', 'bolt', 0, 'Common objections and rapid responses'),
      ('Apologetics', 'apologetics', 'book', 1, 'Christian doctrine and defenses'),
      ('Islam Basics', 'islam', 'moon', 2, 'Core Islamic beliefs and practices'),
      ('Engagement', 'engagement', 'heart', 3, 'Practical guidance for conversations'),
      ('Resources', 'resources', 'link', 4, 'Videos, articles, and references');
    `);
    
    // Sample section for Quick Reference
    db.run(`
      INSERT INTO sections (category_id, title, slug, sort_order, content, summary) VALUES
      (1, 'Sample Topic', 'sample-topic', 1, 
       '<p>This is a sample topic. Replace this with real content.</p><p>Use the database schema to add more sections, scriptures, and external links.</p>', 
       'Sample content to get started');
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
        (SELECT COUNT(*) FROM sections) as sections,
        (SELECT COUNT(*) FROM scriptures) as scriptures,
        (SELECT COUNT(*) FROM external_links) as links
    `)[0];
    
    if (stats && stats.values[0]) {
      const [categories, sections, scriptures, links] = stats.values[0];
      console.log('\n📊 Database Stats:');
      console.log(`   Categories: ${categories}`);
      console.log(`   Sections: ${sections}`);
      console.log(`   Scriptures: ${scriptures}`);
      console.log(`   External Links: ${links}`);
    }
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error creating database:', error);
    process.exit(1);
  }
}

createDatabase();
