#!/usr/bin/env node
/**
 * Prune stale sqlite* base content documents from Firestore.
 *
 * Why:
 * - scripts/migrate-sqlite-to-firestore.js uses merge writes and does not delete docs that
 *   are no longer present in public/content.db.
 * - If stale docs remain (e.g., legacyId pages), Firestore base content mode can show extra items.
 *
 * Auth:
 * - Uses firebase-admin + Application Default Credentials (ADC).
 * - Set project id via --project or GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT.
 *
 * Usage:
 *   node scripts/prune-firestore-sqlite-base.js \
 *     --db public/content.db \
 *     --project YOUR_PROJECT_ID \
 *     [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function parseArgs(argv) {
  const args = {
    dbPath: path.resolve(process.cwd(), 'public/content.db'),
    projectId: null,
    dryRun: false,
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

    throw new Error(`Unknown arg: ${a}`);
  }

  return args;
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveProjectId(explicitProjectId) {
  if (explicitProjectId) return explicitProjectId;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;

  const rc = readJsonIfExists(path.resolve(process.cwd(), '.firebaserc'));
  const fromRc = rc && rc.projects && rc.projects.default;
  if (typeof fromRc === 'string' && fromRc.trim()) return fromRc.trim();

  // Last resort: gcloud config.
  try {
    const out = execSync('gcloud config get-value project', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const v = String(out || '').trim();
    if (v && v !== '(unset)') return v;
  } catch {
    // ignore
  }

  return null;
}

function readSet(db, sql) {
  return new Set(db.prepare(sql).all().map((r) => Object.values(r)[0]));
}

async function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.dbPath)) {
    throw new Error(`SQLite DB not found at ${args.dbPath}`);
  }

  const projectId = resolveProjectId(args.projectId);
  if (!projectId) {
    throw new Error('Could not resolve project id. Pass --project or set GOOGLE_CLOUD_PROJECT.');
  }

  const sqlite = new Database(args.dbPath, { readonly: true });

  const local = {
    categories: readSet(sqlite, 'SELECT id FROM categories'),
    modules: readSet(sqlite, 'SELECT id FROM modules'),
    pages: readSet(sqlite, 'SELECT id FROM pages'),
    scriptures: readSet(sqlite, 'SELECT id FROM scriptures'),
    pageScriptures: new Set(
      sqlite
        .prepare('SELECT page_id, scripture_id FROM page_scriptures')
        .all()
        .map((r) => `${r.page_id}::${r.scripture_id}`)
    ),
    externalLinks: readSet(sqlite, 'SELECT id FROM external_links'),
  };

  sqlite.close();

  initializeApp({ credential: applicationDefault(), projectId });
  const firestore = getFirestore();
  firestore.settings({ ignoreUndefinedProperties: true });

  const collections = {
    categories: 'sqliteCategories',
    modules: 'sqliteModules',
    pages: 'sqlitePages',
    scriptures: 'sqliteScriptures',
    pageScriptures: 'sqlitePageScriptures',
    externalLinks: 'sqliteExternalLinks',
  };

  const bulkWriter = firestore.bulkWriter();
  bulkWriter.onWriteError((err) => {
    if (err.failedAttempts < 5) return true;
    console.error('BulkWriter error:', err);
    return false;
  });

  const toDelete = {
    [collections.categories]: [],
    [collections.modules]: [],
    [collections.pages]: [],
    [collections.scriptures]: [],
    [collections.pageScriptures]: [],
    [collections.externalLinks]: [],
  };

  // Helper: scan a collection and mark docs for deletion if they don't exist in SQLite.
  async function scan(collName, predicate) {
    const snap = await firestore.collection(collName).get();
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (!predicate(data)) {
        toDelete[collName].push(doc.ref);
      }
    });
    return snap.size;
  }

  const sizes = {};

  sizes[collections.categories] = await scan(collections.categories, (d) => {
    // Conservative: only delete docs we can confidently evaluate.
    if (typeof d.legacyId !== 'number') return true;
    return local.categories.has(d.legacyId);
  });

  sizes[collections.modules] = await scan(collections.modules, (d) => {
    if (typeof d.legacyId !== 'number') return true;
    return local.modules.has(d.legacyId);
  });

  sizes[collections.pages] = await scan(collections.pages, (d) => {
    if (typeof d.legacyId !== 'number') return true;
    return local.pages.has(d.legacyId);
  });

  sizes[collections.scriptures] = await scan(collections.scriptures, (d) => {
    if (typeof d.legacyId !== 'string') return true;
    return local.scriptures.has(d.legacyId);
  });

  sizes[collections.pageScriptures] = await scan(collections.pageScriptures, (d) => {
    if (typeof d.pageLegacyId !== 'number') return true;
    if (typeof d.scriptureLegacyId !== 'string') return true;
    return local.pageScriptures.has(`${d.pageLegacyId}::${d.scriptureLegacyId}`);
  });

  sizes[collections.externalLinks] = await scan(collections.externalLinks, (d) => {
    if (typeof d.legacyId !== 'number') return true;
    return local.externalLinks.has(d.legacyId);
  });

  const counts = {
    categories: toDelete[collections.categories].length,
    modules: toDelete[collections.modules].length,
    pages: toDelete[collections.pages].length,
    scriptures: toDelete[collections.scriptures].length,
    pageScriptures: toDelete[collections.pageScriptures].length,
    externalLinks: toDelete[collections.externalLinks].length,
  };

  console.log('🧹 Firestore prune (sqlite* base collections)');
  console.log(`   project: ${projectId}`);
  console.log(`   db: ${args.dbPath}`);
  console.log(`   dry-run: ${args.dryRun ? 'yes' : 'no'}`);
  console.log('   collection sizes:', sizes);
  console.log('   deletions planned:', counts);

  if (args.dryRun) {
    await bulkWriter.close();
    console.log('✅ Dry-run complete (no deletes performed)');
    return;
  }

  for (const ref of toDelete[collections.pageScriptures]) bulkWriter.delete(ref);
  for (const ref of toDelete[collections.externalLinks]) bulkWriter.delete(ref);
  for (const ref of toDelete[collections.pages]) bulkWriter.delete(ref);
  for (const ref of toDelete[collections.scriptures]) bulkWriter.delete(ref);
  for (const ref of toDelete[collections.modules]) bulkWriter.delete(ref);
  for (const ref of toDelete[collections.categories]) bulkWriter.delete(ref);

  await bulkWriter.close();
  console.log('✅ Prune complete');
}

main().catch((e) => {
  console.error('❌ Prune failed:', e);
  process.exitCode = 1;
});
