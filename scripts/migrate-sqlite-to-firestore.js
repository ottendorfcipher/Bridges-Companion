#!/usr/bin/env node
/**
 * SQLite -> Firestore base content migration
 *
 * - Reads SQLite from public/content.db
 * - Writes Firestore docs with deterministic UUID doc IDs derived from legacy IDs
 * - Creates local backups of the DB + a SQL dump
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-firestore.js [--db public/content.db] [--credentials ./serviceAccount.json] [--dry-run] [--verify]
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function parseArgs(argv) {
  const args = {
    dbPath: path.resolve(process.cwd(), 'public/content.db'),
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT,
    dryRun: false,
    verify: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value after --db');
      args.dbPath = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (a === '--credentials') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value after --credentials');
      args.credentialsPath = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (a === '--project') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value after --project');
      args.projectId = next;
      i += 1;
      continue;
    }
    if (a === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (a === '--no-verify') {
      args.verify = false;
      continue;
    }
    if (a === '--verify') {
      args.verify = true;
      continue;
    }

    throw new Error(`Unknown arg: ${a}`);
  }

  return args;
}

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  const s = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    s.on('data', (chunk) => h.update(chunk));
    s.on('error', reject);
    s.on('end', () => resolve(h.digest('hex')));
  });
}

function toUuidFromSha256Bytes(bytes32) {
  if (!Buffer.isBuffer(bytes32) || bytes32.length !== 32) {
    throw new Error('Expected 32-byte Buffer');
  }

  // Take the first 16 bytes as the UUID payload.
  const b = Buffer.from(bytes32.subarray(0, 16));

  // Set version (4) and variant (RFC 4122).
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;

  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function deterministicUuid(input) {
  const digest = crypto.createHash('sha256').update(input, 'utf8').digest();
  return toUuidFromSha256Bytes(digest);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function nowStamp() {
  // yyyyMMdd-HHmmss
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function backupSqlite(dbPath) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite DB not found at ${dbPath}`);
  }

  const stamp = nowStamp();
  const backupsDir = path.resolve(process.cwd(), 'backups/sqlite-to-firestore');
  ensureDir(backupsDir);

  const dbBackupPath = path.join(backupsDir, `content.db.${stamp}.bak`);
  fs.copyFileSync(dbPath, dbBackupPath);

  const dumpPath = path.join(backupsDir, `content.db.${stamp}.dump.sql`);
  try {
    const dump = execSync(`sqlite3 "${dbPath}" ".dump"`, { encoding: 'utf8' });
    fs.writeFileSync(dumpPath, dump, 'utf8');
  } catch (e) {
    // Dump is a nice-to-have; the .bak is the primary backup.
    fs.writeFileSync(
      dumpPath,
      `-- Failed to generate sqlite .dump. Error:\n-- ${(e && e.message) || String(e)}\n`,
      'utf8'
    );
  }

  return { backupsDir, dbBackupPath, dumpPath };
}

function readAll(db, sql, params = []) {
  return db.prepare(sql).all(params);
}

function readOne(db, sql, params = []) {
  return db.prepare(sql).get(params);
}

async function main() {
  const args = parseArgs(process.argv);

  console.log('🔎 SQLite -> Firestore migration');
  console.log(`   DB: ${args.dbPath}`);
  console.log(`   dry-run: ${args.dryRun ? 'yes' : 'no'}`);
  console.log(`   verify: ${args.verify ? 'yes' : 'no'}`);

  const backup = backupSqlite(args.dbPath);
  console.log('💾 Backups created:');
  console.log(`   - ${backup.dbBackupPath}`);
  console.log(`   - ${backup.dumpPath}`);

  const sourceDbSha256 = await sha256File(args.dbPath);

  const sqlite = new Database(args.dbPath, { readonly: true });

  // Table sanity checks
  const tables = readAll(
    sqlite,
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`
  ).map((r) => r.name);

  const requiredTables = ['categories', 'modules', 'pages', 'scriptures', 'page_scriptures', 'external_links'];
  for (const t of requiredTables) {
    if (!tables.includes(t)) {
      throw new Error(`Missing required table: ${t}. Found: ${tables.join(', ')}`);
    }
  }

  const counts = {
    categories: readOne(sqlite, 'SELECT COUNT(*) as n FROM categories').n,
    modules: readOne(sqlite, 'SELECT COUNT(*) as n FROM modules').n,
    pages: readOne(sqlite, 'SELECT COUNT(*) as n FROM pages').n,
    scriptures: readOne(sqlite, 'SELECT COUNT(*) as n FROM scriptures').n,
    page_scriptures: readOne(sqlite, 'SELECT COUNT(*) as n FROM page_scriptures').n,
    external_links: readOne(sqlite, 'SELECT COUNT(*) as n FROM external_links').n,
  };

  console.log('📊 SQLite counts:', counts);

  // Read data
  const categories = readAll(sqlite, 'SELECT * FROM categories');
  const modules = readAll(sqlite, 'SELECT * FROM modules');
  const pages = readAll(sqlite, 'SELECT * FROM pages');
  const scriptures = readAll(sqlite, 'SELECT * FROM scriptures');
  const pageScriptures = readAll(sqlite, 'SELECT * FROM page_scriptures');
  const externalLinks = readAll(sqlite, 'SELECT * FROM external_links');

  sqlite.close();

  // Init Firestore Admin
  const appOptions = {};
  if (args.credentialsPath) {
    const serviceAccount = JSON.parse(fs.readFileSync(args.credentialsPath, 'utf8'));
    appOptions.credential = cert(serviceAccount);
    if (!args.projectId && serviceAccount.project_id) {
      args.projectId = serviceAccount.project_id;
    }
  }
  if (args.projectId) {
    appOptions.projectId = args.projectId;
  }

  initializeApp(appOptions);
  const firestore = getFirestore();
  firestore.settings({ ignoreUndefinedProperties: true });

  const collections = {
    categories: 'sqliteCategories',
    modules: 'sqliteModules',
    pages: 'sqlitePages',
    scriptures: 'sqliteScriptures',
    pageScriptures: 'sqlitePageScriptures',
    externalLinks: 'sqliteExternalLinks',
    importRuns: 'sqliteImportRuns',
  };

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const bulkWriter = firestore.bulkWriter();
  bulkWriter.onWriteError((err) => {
    // Retry transient errors.
    if (err.failedAttempts < 5) {
      return true;
    }
    console.error('BulkWriter error:', err);
    return false;
  });

  const wrote = {
    categories: 0,
    modules: 0,
    pages: 0,
    scriptures: 0,
    pageScriptures: 0,
    externalLinks: 0,
  };

  const writeDoc = (coll, id, data) => {
    if (args.dryRun) return;
    const ref = firestore.collection(coll).doc(id);
    bulkWriter.set(ref, data, { merge: true });
  };

  // Categories
  for (const c of categories) {
    const docId = deterministicUuid(`${collections.categories}:legacyId:${c.id}`);
    writeDoc(collections.categories, docId, {
      legacyId: c.id,
      slug: c.slug,
      name: c.name,
      icon: c.icon ?? null,
      display_order: c.display_order ?? 0,
      description: c.description ?? null,
      created_at: c.created_at ?? null,
    });
    wrote.categories += 1;
  }

  // Modules
  for (const m of modules) {
    const docId = deterministicUuid(`${collections.modules}:legacyId:${m.id}`);
    writeDoc(collections.modules, docId, {
      legacyId: m.id,
      categoryLegacyId: m.category_id,
      slug: m.slug,
      title: m.title,
      description: m.description ?? null,
      icon: m.icon ?? null,
      display_order: m.display_order ?? 0,
      created_at: m.created_at ?? null,
    });
    wrote.modules += 1;
  }

  // Pages
  for (const p of pages) {
    const docId = deterministicUuid(`${collections.pages}:legacyId:${p.id}`);
    writeDoc(collections.pages, docId, {
      legacyId: p.id,
      moduleLegacyId: p.module_id,
      slug: p.slug,
      title: p.title,
      page_number: p.page_number ?? null,
      page_type: p.page_type ?? null,
      sensitivity: p.sensitivity ?? null,
      display_order: p.display_order ?? 0,
      content: p.content,
      summary: p.summary ?? null,
      purpose: p.purpose ?? null,
      created_at: p.created_at ?? null,
    });
    wrote.pages += 1;
  }

  // Scriptures
  for (const s of scriptures) {
    const docId = deterministicUuid(`${collections.scriptures}:legacyId:${s.id}`);
    writeDoc(collections.scriptures, docId, {
      legacyId: s.id, // string
      reference: s.reference,
      text: s.text ?? null,
      source: s.source,
      url: s.url ?? null,
      emphasis: s.emphasis ?? 'inline',
    });
    wrote.scriptures += 1;
  }

  // page_scriptures join
  for (const ps of pageScriptures) {
    const key = `${ps.page_id}:${ps.scripture_id}`;
    const docId = deterministicUuid(`${collections.pageScriptures}:legacyKey:${key}`);
    writeDoc(collections.pageScriptures, docId, {
      pageLegacyId: ps.page_id,
      scriptureLegacyId: ps.scripture_id,
      display_order: ps.display_order ?? 0,
    });
    wrote.pageScriptures += 1;
  }

  // external_links
  for (const l of externalLinks) {
    const docId = deterministicUuid(`${collections.externalLinks}:legacyId:${l.id}`);
    writeDoc(collections.externalLinks, docId, {
      legacyId: l.id,
      pageLegacyId: l.page_id,
      title: l.title,
      url: l.url,
      type: l.type,
      description: l.description ?? null,
      display_order: l.display_order ?? 0,
      created_at: l.created_at ?? null,
    });
    wrote.externalLinks += 1;
  }

  if (!args.dryRun) {
    await bulkWriter.close();
  }

  const finishedAt = new Date().toISOString();

  // Import manifest
  const manifest = {
    runId,
    startedAt,
    finishedAt,
    dryRun: args.dryRun,
    sourceDbPath: args.dbPath,
    sourceDbSha256,
    counts,
    wrote,
    collections,
    tool: {
      name: 'scripts/migrate-sqlite-to-firestore.js',
      version: '1.0.0',
    },
  };

  if (!args.dryRun) {
    await firestore.collection(collections.importRuns).doc(runId).set(manifest, { merge: true });
  }

  console.log('✅ Import complete');
  console.log('   wrote:', wrote);
  console.log(`   manifest: ${collections.importRuns}/${runId}`);

  if (args.verify && !args.dryRun) {
    console.log('🔍 Verifying counts by scanning collections (small dataset)...');
    const verifyCounts = async (coll) => {
      const snap = await firestore.collection(coll).get();
      return snap.size;
    };

    const remote = {
      categories: await verifyCounts(collections.categories),
      modules: await verifyCounts(collections.modules),
      pages: await verifyCounts(collections.pages),
      scriptures: await verifyCounts(collections.scriptures),
      pageScriptures: await verifyCounts(collections.pageScriptures),
      externalLinks: await verifyCounts(collections.externalLinks),
    };

    console.log('   remote counts:', remote);
    console.log('   expected:', {
      categories: counts.categories,
      modules: counts.modules,
      pages: counts.pages,
      scriptures: counts.scriptures,
      pageScriptures: counts.page_scriptures,
      externalLinks: counts.external_links,
    });
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
