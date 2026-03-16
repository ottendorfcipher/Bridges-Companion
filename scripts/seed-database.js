#!/usr/bin/env node
/**
 * Seed Database Script
 * Parses BAH_info_Dump.md and generates SQL seed data for Bridge Companion
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths
const INPUT_FILE = '/Users/nicholasweiner/Downloads/BAH_info_Dump.md';
const OUTPUT_FILE = path.join(__dirname, '../src/data/seed.sql');
const DB_FILE = path.join(__dirname, '../public/content.db');

// Categories mapping based on documentation
const CATEGORIES = {
  'quick-ref': 1,
  'apologetics': 2,
  'islam': 3,
  'engagement': 4,
  'resources': 5
};

// Scripture source patterns
const SCRIPTURE_PATTERNS = {
  quran: /Surah (\d+):(\d+(?:-\d+)?)/gi,
  bible: /(\d?\s?[A-Z][a-z]+)\s+(\d+):(\d+(?:-\d+)?)/g,
  hadith: /(?:Sahih\s+(?:Bukhari|Muslim)|Sunan\s+Abu\s+Dawud)\s+(\d+(?::\d+)?)/gi
};

class DatabaseSeeder {
  constructor() {
    this.sections = [];
    this.scriptures = [];
    this.externalLinks = [];
    this.sectionIdCounter = 2; // Start at 2 since 1 is sample
    this.scriptureIdCounter = 1;
    this.linkIdCounter = 1;
  }

  parseMarkdown(content) {
    console.log('Parsing markdown content...');
    
    const lines = content.split('\n');
    let currentSection = null;
    let currentContent = [];
    let currentCategory = 'islam'; // Default category

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines at start of section
      if (!line && currentContent.length === 0) continue;

      // Detect major sections (potential section titles)
      if (this.isMajorHeading(line)) {
        // Save previous section if exists
        if (currentSection) {
          this.saveSection(currentSection, currentContent.join('\n'), currentCategory);
          currentContent = [];
        }

        // Start new section
        const title = this.cleanTitle(line);
        const category = this.determineCategory(title, i, lines);
        currentCategory = category;
        
        currentSection = {
          title: title,
          slug: this.slugify(title),
          sort_order: this.sectionIdCounter - 1
        };
      } else if (currentSection) {
        // Accumulate content for current section
        currentContent.push(line);
      }
    }

    // Save final section
    if (currentSection && currentContent.length > 0) {
      this.saveSection(currentSection, currentContent.join('\n'), currentCategory);
    }

    console.log(`Parsed ${this.sections.length} sections`);
    console.log(`Found ${this.scriptures.length} scripture references`);
  }

  isMajorHeading(line) {
    // Matches markdown headings or bold titles
    return (
      /^#{1,3}\s+/.test(line) || // H1-H3 markdown
      /^\*\*[^*]+\*\*$/.test(line) || // Bold standalone
      (/^[A-Z]/.test(line) && line.length < 100 && !line.endsWith('.')) // Title case short lines
    );
  }

  cleanTitle(line) {
    return line
      .replace(/^#+\s*/, '') // Remove markdown #
      .replace(/^\*\*|\*\*$/g, '') // Remove bold **
      .replace(/^[\d.]+\s*/, '') // Remove numbering
      .trim();
  }

  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  determineCategory(title, lineIndex, allLines) {
    const lowerTitle = title.toLowerCase();
    
    // Quick Reference patterns
    if (lowerTitle.includes('common') || lowerTitle.includes('quick') || 
        lowerTitle.includes('objection')) {
      return 'quick-ref';
    }
    
    // Apologetics patterns
    if (lowerTitle.includes('jesus') || lowerTitle.includes('trinity') ||
        lowerTitle.includes('god') || lowerTitle.includes('bible') ||
        lowerTitle.includes('crucif') || lowerTitle.includes('resurrection')) {
      return 'apologetics';
    }
    
    // Islam Basics patterns
    if (lowerTitle.includes('islam') || lowerTitle.includes('muslim') ||
        lowerTitle.includes('pillar') || lowerTitle.includes('quran') ||
        lowerTitle.includes('muhammad') || lowerTitle.includes('hadith') ||
        lowerTitle.includes('allah')) {
      return 'islam';
    }
    
    // Engagement patterns
    if (lowerTitle.includes('engagement') || lowerTitle.includes('conversation') ||
        lowerTitle.includes('trust') || lowerTitle.includes('do:') ||
        lowerTitle.includes('avoid') || lowerTitle.includes('approach')) {
      return 'engagement';
    }
    
    // Resources patterns
    if (lowerTitle.includes('resource') || lowerTitle.includes('video') ||
        lowerTitle.includes('discussion question')) {
      return 'resources';
    }
    
    return 'islam'; // Default
  }

  saveSection(section, content, categorySlug) {
    const categoryId = CATEGORIES[categorySlug] || CATEGORIES['islam'];
    const sectionId = this.sectionIdCounter++;
    
    // Extract and replace scripture references
    const processedContent = this.extractScriptures(content, sectionId);
    
    // Generate summary (first 150 chars of text content)
    const summary = this.generateSummary(content);
    
    this.sections.push({
      id: sectionId,
      category_id: categoryId,
      title: section.title,
      slug: section.slug,
      sort_order: section.sort_order,
      content: this.formatContent(processedContent),
      summary: summary
    });
  }

  extractScriptures(content, sectionId) {
    let processedContent = content;
    
    // Extract Quran references
    const quranMatches = [...content.matchAll(SCRIPTURE_PATTERNS.quran)];
    quranMatches.forEach(match => {
      const reference = match[0];
      const scriptureId = this.scriptureIdCounter++;
      
      this.scriptures.push({
        id: scriptureId,
        section_id: sectionId,
        reference: reference,
        text: null,
        source: 'quran',
        url: this.generateQuranUrl(match[1], match[2]),
        emphasis: 'inline'
      });
      
      // Replace with marker
      processedContent = processedContent.replace(
        reference,
        `{{scripture:${scriptureId}}}`
      );
    });
    
    // Extract Bible references
    const bibleMatches = [...content.matchAll(SCRIPTURE_PATTERNS.bible)];
    bibleMatches.forEach(match => {
      const reference = match[0];
      
      // Skip if it looks like Surah reference or other false positive
      if (reference.includes('Surah') || /^\d+$/.test(reference)) return;
      
      const scriptureId = this.scriptureIdCounter++;
      
      this.scriptures.push({
        id: scriptureId,
        section_id: sectionId,
        reference: reference,
        text: null,
        source: 'bible',
        url: this.generateBibleUrl(reference),
        emphasis: 'inline'
      });
      
      processedContent = processedContent.replace(
        reference,
        `{{scripture:${scriptureId}}}`
      );
    });
    
    // Extract Hadith references
    const hadithMatches = [...content.matchAll(SCRIPTURE_PATTERNS.hadith)];
    hadithMatches.forEach(match => {
      const reference = match[0];
      const scriptureId = this.scriptureIdCounter++;
      
      this.scriptures.push({
        id: scriptureId,
        section_id: sectionId,
        reference: reference,
        text: null,
        source: 'hadith',
        url: 'https://sunnah.com',
        emphasis: 'inline'
      });
      
      processedContent = processedContent.replace(
        reference,
        `{{scripture:${scriptureId}}}`
      );
    });
    
    return processedContent;
  }

  generateQuranUrl(surah, ayah) {
    // Remove any range notation for URL
    const ayahNum = ayah.split('-')[0];
    return `https://quran.com/${surah}:${ayahNum}`;
  }

  generateBibleUrl(reference) {
    // Simplified - would need more robust parsing for production
    return `https://www.bible.com/bible/CSB/${reference}`;
  }

  generateSummary(content) {
    // Remove markdown, get plain text, take first 150 chars
    const plainText = content
      .replace(/[#*`_\[\]]/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    
    return plainText.length > 150 
      ? plainText.substring(0, 147) + '...'
      : plainText;
  }

  formatContent(content) {
    // Convert markdown to basic HTML
    let html = content
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Line breaks
      .replace(/\n\n/g, '</p><p>')
      // Lists
      .replace(/^- /gm, '<li>')
      .replace(/(<li>[^\n]+)/g, '$1</li>');
    
    // Wrap in paragraphs if not already
    if (!html.includes('<p>')) {
      html = '<p>' + html + '</p>';
    }
    
    return html;
  }

  generateSQL() {
    console.log('Generating SQL...');
    
    let sql = `-- Bridge Companion Seed Data
-- Generated: ${new Date().toISOString()}
-- Source: BAH_info_Dump.md

BEGIN TRANSACTION;

-- Clear existing seed data (keep categories)
DELETE FROM external_links WHERE section_id > 1;
DELETE FROM scriptures WHERE section_id > 1;
DELETE FROM sections WHERE id > 1;

`;

    // Insert sections
    this.sections.forEach(section => {
      sql += `INSERT INTO sections (id, category_id, title, slug, sort_order, content, summary) VALUES (\n`;
      sql += `  ${section.id},\n`;
      sql += `  ${section.category_id},\n`;
      sql += `  ${this.sqlEscape(section.title)},\n`;
      sql += `  ${this.sqlEscape(section.slug)},\n`;
      sql += `  ${section.sort_order},\n`;
      sql += `  ${this.sqlEscape(section.content)},\n`;
      sql += `  ${section.summary ? this.sqlEscape(section.summary) : 'NULL'}\n`;
      sql += `);\n\n`;
    });

    // Insert scriptures
    this.scriptures.forEach(scripture => {
      sql += `INSERT INTO scriptures (id, section_id, reference, text, source, url, emphasis) VALUES (\n`;
      sql += `  ${scripture.id},\n`;
      sql += `  ${scripture.section_id},\n`;
      sql += `  ${this.sqlEscape(scripture.reference)},\n`;
      sql += `  ${scripture.text ? this.sqlEscape(scripture.text) : 'NULL'},\n`;
      sql += `  ${this.sqlEscape(scripture.source)},\n`;
      sql += `  ${scripture.url ? this.sqlEscape(scripture.url) : 'NULL'},\n`;
      sql += `  ${this.sqlEscape(scripture.emphasis)}\n`;
      sql += `);\n\n`;
    });

    sql += `COMMIT;\n`;
    
    return sql;
  }

  sqlEscape(value) {
    if (value === null || value === undefined) return 'NULL';
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  async run() {
    try {
      console.log('Starting database seeding...');
      
      // Read input file
      console.log(`Reading ${INPUT_FILE}...`);
      const content = fs.readFileSync(INPUT_FILE, 'utf8');
      
      // Parse content
      this.parseMarkdown(content);
      
      // Generate SQL
      const sql = this.generateSQL();
      
      // Write SQL file
      console.log(`Writing ${OUTPUT_FILE}...`);
      fs.writeFileSync(OUTPUT_FILE, sql);
      
      console.log('✅ Seed SQL generated successfully!');
      console.log(`\nNext steps:`);
      console.log(`1. Review the generated SQL: src/data/seed.sql`);
      console.log(`2. Execute it: sqlite3 public/content.db < src/data/seed.sql`);
      console.log(`\nStats:`);
      console.log(`  - Sections: ${this.sections.length}`);
      console.log(`  - Scriptures: ${this.scriptures.length}`);
      console.log(`  - External Links: ${this.externalLinks.length}`);
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }
}

// Run the seeder
const seeder = new DatabaseSeeder();
seeder.run();
