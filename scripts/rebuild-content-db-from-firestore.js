#!/usr/bin/env node
/**
 * Firestore -> SQLite rebuild (offline PWA artifact)
 *
 * Builds a fresh SQLite database compatible with the runtime schema in public/content.db,
 * materializing the currently published Firestore content:
 * - Base content from sqlite* collections
 * - Published catalog overlays (contentCategories/contentModules/contentPages)
 * - Published content edits (contentEdits)
 *
 * Also downloads any custom content icons referenced by published overlays into:
 *   public/content-icons/{iconId}.png
 * and stores icon metadata in SQLite (icon_type/icon_url).
 *
 * Auth:
 * - Uses Application Default Credentials (ADC). Works with:
 *     gcloud auth application-default login
 *
 * Usage:
 *   node scripts/rebuild-content-db-from-firestore.js \
 *     [--project <gcp-project-id>] \
 *     [--out public/content.db] \
 *     [--icons-dir public/content-icons] \
 *     [--dry-run] [--verify]
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function parseArgs(argv) {
  const args = {
    projectId: null,
    outPath: path.resolve(process.cwd(), 'public/content.db'),
    iconsDir: path.resolve(process.cwd(), 'public/content-icons'),
    dryRun: false,
    verify: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--project') {
      args.projectId = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === '--out') {
      args.outPath = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (a === '--icons-dir') {
      args.iconsDir = path.resolve(process.cwd(), argv[i + 1]);
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

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isSemanticVersion(v) {
  return /^\d+\.\d+\.\d+$/.test(String(v || ''));
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function negativeIdFromSlug(slug, salt) {
  const s = `${salt}:${slug}`;
  const hex = crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 8);
  const n = parseInt(hex, 16);
  // Stable negative 32-bit-ish integer.
  return -Math.max(1, n);
}

function ensureUniqueBy(rows, keyFn, label) {
  const seen = new Set();
  for (const r of rows) {
    const k = keyFn(r);
    if (seen.has(k)) throw new Error(`Duplicate ${label}: ${k}`);
    seen.add(k);
  }
}

function resolveCustomIconLocalUrl(d) {
  if (!d || d.iconType !== 'custom') return { iconId: null, iconUrl: null };

  const iconIdRaw = typeof d.iconId === 'string' && d.iconId.trim() ? d.iconId.trim() : null;
  const iconUrlRaw = typeof d.iconUrl === 'string' && d.iconUrl.trim() ? d.iconUrl.trim() : null;

  if (iconIdRaw) {
    return { iconId: iconIdRaw, iconUrl: `/content-icons/${iconIdRaw}.png`, sourceUrl: iconUrlRaw };
  }

  if (iconUrlRaw) {
    const derived = crypto.createHash('sha256').update(iconUrlRaw, 'utf8').digest('hex').slice(0, 16);
    return { iconId: derived, iconUrl: `/content-icons/${derived}.png`, sourceUrl: iconUrlRaw };
  }

  return { iconId: null, iconUrl: null };
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

  // Try .firebaserc
  const rc = readJsonIfExists(path.resolve(process.cwd(), '.firebaserc'));
  const fromRc = rc && rc.projects && rc.projects.default;
  if (typeof fromRc === 'string' && fromRc.trim()) return fromRc.trim();

  return null;
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url} (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buf);
  return { bytes: buf.length, sha256: sha256(buf) };
}

function createSchema(db) {
  db.pragma('foreign_keys = ON');

  db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  icon_type TEXT DEFAULT 'feather',
  icon_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  icon_type TEXT DEFAULT 'feather',
  icon_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  page_number INTEGER,
  page_type TEXT DEFAULT 'standard',
  sensitivity TEXT DEFAULT 'low',
  display_order INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  summary TEXT,
  purpose TEXT,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scriptures (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL,
  text TEXT,
  source TEXT NOT NULL,
  url TEXT,
  emphasis TEXT DEFAULT 'inline'
);

CREATE TABLE IF NOT EXISTS page_scriptures (
  page_id INTEGER NOT NULL,
  scripture_id TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, scripture_id),
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (scripture_id) REFERENCES scriptures(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS external_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(display_order);
CREATE INDEX IF NOT EXISTS idx_modules_category ON modules(category_id, display_order);
CREATE INDEX IF NOT EXISTS idx_pages_module ON pages(module_id, display_order);
CREATE INDEX IF NOT EXISTS idx_page_scriptures_page ON page_scriptures(page_id);
CREATE INDEX IF NOT EXISTS idx_external_links_page ON external_links(page_id);
`);
}

function upsertById(db, table, rows, columns) {
  if (rows.length === 0) return;
  const cols = columns.join(', ');
  const placeholders = columns.map((c) => `@${c}`).join(', ');
  const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`);
  const tx = db.transaction((items) => {
    for (const it of items) stmt.run(it);
  });
  tx(rows);
}

async function main() {
  const args = parseArgs(process.argv);
  const projectId = resolveProjectId(args.projectId);
  if (!projectId) {
    throw new Error('Project ID not found. Pass --project or set GOOGLE_CLOUD_PROJECT, or set .firebaserc projects.default');
  }

  console.log('🔁 Firestore -> SQLite rebuild');
  console.log(`   project: ${projectId}`);
  console.log(`   out: ${args.outPath}`);
  console.log(`   icons: ${args.iconsDir}`);
  console.log(`   dry-run: ${args.dryRun ? 'yes' : 'no'}`);

  initializeApp({ credential: applicationDefault(), projectId });
  const firestore = getFirestore();
  firestore.settings({ ignoreUndefinedProperties: true });

  // Determine live content version (keyed or legacy).
  const cfgSnap = await firestore.collection('appConfig').doc('versionConfig').get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : { currentVersion: '0.1.0' };

  const versionKeyOrId = (cfg && typeof cfg.currentVersionKey === 'string' && cfg.currentVersionKey)
    ? cfg.currentVersionKey
    : (cfg && typeof cfg.currentVersion === 'string' ? cfg.currentVersion : '0.1.0');

  const versionField = isSemanticVersion(versionKeyOrId) ? 'versionId' : 'versionKey';

  console.log(`   live version key/id: ${versionKeyOrId} (${versionField})`);

  // Load base content
  const [catsSnap, modsSnap, pagesSnap, scriptsSnap, joinsSnap, linksSnap] = await Promise.all([
    firestore.collection('sqliteCategories').get(),
    firestore.collection('sqliteModules').get(),
    firestore.collection('sqlitePages').get(),
    firestore.collection('sqliteScriptures').get(),
    firestore.collection('sqlitePageScriptures').get(),
    firestore.collection('sqliteExternalLinks').get(),
  ]);

  const baseCats = catsSnap.docs.map((d) => d.data());
  const baseMods = modsSnap.docs.map((d) => d.data());
  const basePages = pagesSnap.docs.map((d) => d.data());
  const baseScripts = scriptsSnap.docs.map((d) => d.data());
  const baseJoins = joinsSnap.docs.map((d) => d.data());
  const baseLinks = linksSnap.docs.map((d) => d.data());

  console.log('📦 Base counts:', {
    categories: baseCats.length,
    modules: baseMods.length,
    pages: basePages.length,
    scriptures: baseScripts.length,
    pageScriptures: baseJoins.length,
    externalLinks: baseLinks.length,
  });

  // Load published overlays + edits for the live version.
  const [catOverSnap, modOverSnap, pageOverSnap, editsSnap] = await Promise.all([
    firestore.collection('contentCategories').where(versionField, '==', versionKeyOrId).where('status', '==', 'published').get(),
    firestore.collection('contentModules').where(versionField, '==', versionKeyOrId).where('status', '==', 'published').get(),
    firestore.collection('contentPages').where(versionField, '==', versionKeyOrId).where('status', '==', 'published').get(),
    firestore.collection('contentEdits').where(versionField, '==', versionKeyOrId).where('status', '==', 'published').get(),
  ]);

  const catOver = catOverSnap.docs.map((d) => d.data());
  const modOver = modOverSnap.docs.map((d) => d.data());
  const pageOver = pageOverSnap.docs.map((d) => d.data());
  const edits = editsSnap.docs.map((d) => d.data());

  console.log('🧩 Published overlays/edits:', {
    contentCategories: catOver.length,
    contentModules: modOver.length,
    contentPages: pageOver.length,
    contentEdits: edits.length,
  });

  // Index overlays
  const catOverlayBySlug = new Map(catOver.filter((d) => d.source !== 'custom').map((d) => [d.slug, d]));
  const modOverlayBySlug = new Map(modOver.filter((d) => d.source !== 'custom').map((d) => [d.slug, d]));

  // Custom catalog items (these do not exist in base).
  const customCats = catOver.filter((d) => d.source === 'custom');
  const customMods = modOver.filter((d) => d.source === 'custom');

  // Page overlays contain both sqlite and custom pages.
  const sqlitePageOverlayById = new Map(pageOver.filter((d) => d.source !== 'custom').map((d) => [d.id, d]));
  const customPages = pageOver.filter((d) => d.source === 'custom');

  // Content edits keyed by pageId
  const editsByPageId = new Map();
  for (const e of edits) {
    if (typeof e.pageId !== 'number') continue;
    if (!editsByPageId.has(e.pageId)) editsByPageId.set(e.pageId, []);
    editsByPageId.get(e.pageId).push(e);
  }

  // Resolve any referenced iconIds to local files.
  // Collect icon references from published overlays.
  const iconIds = new Set();
  const iconRefs = [];

  const collectIcon = (d) => {
    const res = resolveCustomIconLocalUrl(d);
    if (!res.iconId) return;
    iconIds.add(res.iconId);
    iconRefs.push({ iconId: res.iconId, iconUrl: res.sourceUrl || null });
  };

  for (const d of [...catOver, ...modOver]) collectIcon(d);

  // Download icons (best effort) unless dry-run.
  const iconManifest = new Map();
  if (!args.dryRun) {
    // Rebuild the directory to avoid stale assets.
    fs.rmSync(args.iconsDir, { recursive: true, force: true });
    ensureDir(args.iconsDir);

    for (const iconId of iconIds) {
      // Prefer canonical downloadUrl from contentIcons/{iconId} if present.
      let url = null;
      try {
        const snap = await firestore.collection('contentIcons').doc(iconId).get();
        if (snap.exists) {
          const data = snap.data();
          if (data && typeof data.downloadUrl === 'string') url = data.downloadUrl;
        }
      } catch {
        // ignore
      }

      if (!url) {
        const ref = iconRefs.find((r) => r.iconId === iconId);
        url = ref ? ref.iconUrl : null;
      }

      if (!url) {
        throw new Error(`Missing downloadUrl for custom icon ${iconId}.`);
      }

      const outFile = path.join(args.iconsDir, `${iconId}.png`);
      const result = await downloadToFile(url, outFile);
      iconManifest.set(iconId, { url, ...result, outFile });
    }
  }

  // Build effective categories
  const categories = [];

  for (const c of baseCats) {
    if (typeof c.legacyId !== 'number') continue;
    const patch = catOverlayBySlug.get(c.slug);

    // Mirror app behavior: published deletes are tombstones (not exported).
    if (patch?.isDeleted === true) continue;

    const iconType = patch?.iconType || 'feather';
    const iconRes = iconType === 'custom' ? resolveCustomIconLocalUrl(patch) : { iconUrl: null };
    if (iconType === 'custom' && !iconRes.iconUrl) {
      throw new Error(`Category ${c.slug} has iconType=custom but no iconId/iconUrl`);
    }
    const { iconUrl } = iconRes;

    categories.push({
      id: c.legacyId,
      name: patch?.name ?? c.name,
      slug: c.slug,
      icon: iconType === 'custom' ? null : (patch?.icon ?? c.icon ?? null),
      icon_type: iconType,
      icon_url: iconUrl,
      display_order: typeof patch?.displayOrder === 'number' ? patch.displayOrder : (c.display_order ?? 0),
      description: patch?.description ?? c.description ?? null,
      is_hidden: patch?.isHidden === true ? 1 : 0,
      is_deleted: 0,
      created_at: c.created_at ?? null,
    });
  }

  for (const c of customCats) {
    if (c.isDeleted === true) continue;

    const iconType = c.iconType || 'feather';
    const iconRes = iconType === 'custom' ? resolveCustomIconLocalUrl(c) : { iconUrl: null };
    if (iconType === 'custom' && !iconRes.iconUrl) {
      throw new Error(`Custom category ${c.slug} has iconType=custom but no iconId/iconUrl`);
    }
    const { iconUrl } = iconRes;

    const id = typeof c.id === 'number' ? c.id : negativeIdFromSlug(c.slug, 'category');

    categories.push({
      id,
      name: c.name || c.slug,
      slug: c.slug,
      icon: iconType === 'custom' ? null : (c.icon ?? 'book'),
      icon_type: iconType,
      icon_url: iconUrl,
      display_order: typeof c.displayOrder === 'number' ? c.displayOrder : 999,
      description: c.description ?? null,
      is_hidden: c.isHidden === true ? 1 : 0,
      is_deleted: 0,
      created_at: typeof c.updatedAt === 'string' ? c.updatedAt : null,
    });
  }

  ensureUniqueBy(categories, (c) => c.slug, 'category slug');
  ensureUniqueBy(categories, (c) => c.id, 'category id');

  // Map category slug -> id for module assignment
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const validCategoryIds = new Set(categories.map((c) => c.id));

  // Build effective modules
  const modules = [];

  for (const m of baseMods) {
    if (typeof m.legacyId !== 'number') continue;
    const patch = modOverlayBySlug.get(m.slug);

    // Mirror app behavior: published deletes are tombstones (not exported).
    if (patch?.isDeleted === true) continue;

    const iconType = patch?.iconType || 'feather';
    const iconRes = iconType === 'custom' ? resolveCustomIconLocalUrl(patch) : { iconUrl: null };
    if (iconType === 'custom' && !iconRes.iconUrl) {
      throw new Error(`Module ${m.slug} has iconType=custom but no iconId/iconUrl`);
    }
    const { iconUrl } = iconRes;

    const categoryId = typeof patch?.categorySlug === 'string'
      ? (categoryIdBySlug.get(patch.categorySlug) ?? m.categoryLegacyId)
      : m.categoryLegacyId;

    if (!validCategoryIds.has(categoryId)) {
      continue;
    }

    modules.push({
      id: m.legacyId,
      category_id: categoryId,
      title: patch?.title ?? m.title,
      slug: m.slug,
      description: patch?.description ?? m.description ?? null,
      icon: iconType === 'custom' ? null : (patch?.icon ?? m.icon ?? null),
      icon_type: iconType,
      icon_url: iconUrl,
      display_order: typeof patch?.displayOrder === 'number' ? patch.displayOrder : (m.display_order ?? 0),
      is_hidden: patch?.isHidden === true ? 1 : 0,
      is_deleted: 0,
      created_at: m.created_at ?? null,
    });
  }

  for (const m of customMods) {
    if (m.isDeleted === true) continue;

    const iconType = m.iconType || 'feather';
    const iconRes = iconType === 'custom' ? resolveCustomIconLocalUrl(m) : { iconUrl: null };
    if (iconType === 'custom' && !iconRes.iconUrl) {
      throw new Error(`Custom module ${m.slug} has iconType=custom but no iconId/iconUrl`);
    }
    const { iconUrl } = iconRes;

    const categoryId = typeof m.categorySlug === 'string' ? (categoryIdBySlug.get(m.categorySlug) ?? -1) : -1;
    if (!validCategoryIds.has(categoryId)) continue;

    const id = typeof m.id === 'number' ? m.id : negativeIdFromSlug(m.slug, 'module');

    modules.push({
      id,
      category_id: categoryId,
      title: m.title || m.slug,
      slug: m.slug,
      description: m.description ?? null,
      icon: iconType === 'custom' ? null : (m.icon ?? 'book'),
      icon_type: iconType,
      icon_url: iconUrl,
      display_order: typeof m.displayOrder === 'number' ? m.displayOrder : 999,
      is_hidden: m.isHidden === true ? 1 : 0,
      is_deleted: 0,
      created_at: typeof m.updatedAt === 'string' ? m.updatedAt : null,
    });
  }

  ensureUniqueBy(modules, (m) => m.slug, 'module slug');
  ensureUniqueBy(modules, (m) => m.id, 'module id');

  const moduleIdBySlug = new Map(modules.map((m) => [m.slug, m.id]));
  const validModuleIds = new Set(modules.map((m) => m.id));

  // Build effective pages
  const pages = [];

  for (const p of basePages) {
    if (typeof p.legacyId !== 'number') continue;

    const patch = sqlitePageOverlayById.get(p.legacyId);

    // Mirror app behavior: published deletes are tombstones (not exported).
    if (patch?.isDeleted === true) continue;

    const moduleId = typeof p.moduleLegacyId === 'number' ? p.moduleLegacyId : 0;
    if (!validModuleIds.has(moduleId)) continue;

    // Apply published content edits
    const pageEdits = editsByPageId.get(p.legacyId) || [];
    const editByField = new Map(pageEdits.map((e) => [e.field, e]));

    const title = editByField.get('title')?.editedValue ?? (patch?.title ?? p.title);
    const content = editByField.get('content')?.editedValue ?? (p.content);
    const purpose = editByField.get('purpose')?.editedValue ?? (p.purpose ?? null);

    pages.push({
      id: p.legacyId,
      module_id: moduleId,
      title,
      slug: p.slug,
      page_number: p.page_number ?? null,
      page_type: p.page_type ?? 'standard',
      sensitivity: p.sensitivity ?? 'low',
      display_order: p.display_order ?? 0,
      content,
      summary: p.summary ?? null,
      purpose,
      is_hidden: patch?.isHidden === true ? 1 : 0,
      is_deleted: 0,
      created_at: p.created_at ?? null,
    });
  }

  for (const p of customPages) {
    if (p.isDeleted === true) continue;

    const moduleId = typeof p.moduleSlug === 'string' ? (moduleIdBySlug.get(p.moduleSlug) ?? 0) : 0;
    if (!validModuleIds.has(moduleId)) continue;

    const id = typeof p.id === 'number' ? p.id : negativeIdFromSlug(`${p.moduleSlug}/${p.slug}`, 'page');

    const pageEdits = editsByPageId.get(id) || [];
    const editByField = new Map(pageEdits.map((e) => [e.field, e]));

    const title = editByField.get('title')?.editedValue ?? (p.title || p.slug);
    const content = editByField.get('content')?.editedValue ?? (p.content ?? '');
    const purpose = editByField.get('purpose')?.editedValue ?? (p.purpose ?? null);

    pages.push({
      id,
      module_id: moduleId,
      title,
      slug: p.slug,
      page_number: typeof p.pageNumber === 'number' ? p.pageNumber : null,
      page_type: 'standard',
      sensitivity: 'low',
      display_order: typeof p.displayOrder === 'number' ? p.displayOrder : 999,
      content,
      summary: null,
      purpose,
      is_hidden: p.isHidden === true ? 1 : 0,
      is_deleted: 0,
      created_at: typeof p.updatedAt === 'string' ? p.updatedAt : null,
    });
  }

  ensureUniqueBy(pages, (p) => p.slug, 'page slug');
  ensureUniqueBy(pages, (p) => p.id, 'page id');

  const validPageIds = new Set(pages.map((p) => p.id));

  // Materialize scriptures and joins
  const scriptures = baseScripts
    .filter((s) => typeof s.legacyId === 'string')
    .map((s) => ({
      id: s.legacyId,
      reference: s.reference,
      text: s.text ?? null,
      source: s.source,
      url: s.url ?? null,
      emphasis: s.emphasis ?? 'inline',
    }));

  const pageScriptures = baseJoins
    .filter((ps) => typeof ps.pageLegacyId === 'number' && typeof ps.scriptureLegacyId === 'string')
    .map((ps) => ({
      page_id: ps.pageLegacyId,
      scripture_id: ps.scriptureLegacyId,
      display_order: ps.display_order ?? 0,
    }))
    .filter((ps) => validPageIds.has(ps.page_id));

  const externalLinks = baseLinks
    .filter((l) => typeof l.legacyId === 'number')
    .map((l) => ({
      id: l.legacyId,
      page_id: l.pageLegacyId,
      title: l.title,
      url: l.url,
      type: l.type,
      description: l.description ?? null,
      display_order: l.display_order ?? 0,
      created_at: l.created_at ?? null,
    }))
    .filter((l) => validPageIds.has(l.page_id));

  console.log('🧱 Effective rows:', {
    categories: categories.length,
    modules: modules.length,
    pages: pages.length,
    scriptures: scriptures.length,
    page_scriptures: pageScriptures.length,
    external_links: externalLinks.length,
    icons: iconIds.size,
  });

  if (args.dryRun) {
    console.log('✅ Dry run complete (no files written).');
    return;
  }

  // Backup existing DB if present
  if (fs.existsSync(args.outPath)) {
    const backupsDir = path.resolve(process.cwd(), 'backups/firestore-to-sqlite');
    ensureDir(backupsDir);
    const backupPath = path.join(backupsDir, `content.db.${nowStamp()}.bak`);
    fs.copyFileSync(args.outPath, backupPath);
    console.log(`💾 Backed up existing DB: ${backupPath}`);
  }

  // Write to a temp file then replace
  const tmpPath = `${args.outPath}.tmp`;
  ensureDir(path.dirname(args.outPath));
  if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });

  const db = new Database(tmpPath);
  createSchema(db);

  // Deterministic inserts with explicit IDs.
  upsertById(db, 'categories', categories, [
    'id',
    'name',
    'slug',
    'icon',
    'icon_type',
    'icon_url',
    'display_order',
    'description',
    'is_hidden',
    'is_deleted',
    'created_at',
  ]);

  upsertById(db, 'modules', modules, [
    'id',
    'category_id',
    'title',
    'slug',
    'description',
    'icon',
    'icon_type',
    'icon_url',
    'display_order',
    'is_hidden',
    'is_deleted',
    'created_at',
  ]);

  upsertById(db, 'pages', pages, [
    'id',
    'module_id',
    'title',
    'slug',
    'page_number',
    'page_type',
    'sensitivity',
    'display_order',
    'content',
    'summary',
    'purpose',
    'is_hidden',
    'is_deleted',
    'created_at',
  ]);

  upsertById(db, 'scriptures', scriptures, ['id', 'reference', 'text', 'source', 'url', 'emphasis']);
  upsertById(db, 'page_scriptures', pageScriptures, ['page_id', 'scripture_id', 'display_order']);
  upsertById(db, 'external_links', externalLinks, [
    'id',
    'page_id',
    'title',
    'url',
    'type',
    'description',
    'display_order',
    'created_at',
  ]);

  if (args.verify) {
    const counts = {
      categories: db.prepare('SELECT COUNT(*) as n FROM categories').get().n,
      modules: db.prepare('SELECT COUNT(*) as n FROM modules').get().n,
      pages: db.prepare('SELECT COUNT(*) as n FROM pages').get().n,
      scriptures: db.prepare('SELECT COUNT(*) as n FROM scriptures').get().n,
      page_scriptures: db.prepare('SELECT COUNT(*) as n FROM page_scriptures').get().n,
      external_links: db.prepare('SELECT COUNT(*) as n FROM external_links').get().n,
    };

    // Basic integrity checks.
    const orphanModules = db.prepare(`
      SELECT COUNT(*) as n
      FROM modules m
      LEFT JOIN categories c ON c.id = m.category_id
      WHERE c.id IS NULL
    `).get().n;

    const orphanPages = db.prepare(`
      SELECT COUNT(*) as n
      FROM pages p
      LEFT JOIN modules m ON m.id = p.module_id
      WHERE m.id IS NULL
    `).get().n;

    console.log('🔍 Verify:', { counts, orphanModules, orphanPages });
    if (orphanModules > 0 || orphanPages > 0) {
      throw new Error(`Integrity check failed (orphanModules=${orphanModules}, orphanPages=${orphanPages}).`);
    }
  }

  db.close();

  fs.renameSync(tmpPath, args.outPath);
  console.log(`✅ Wrote: ${args.outPath}`);

  if (iconManifest.size > 0) {
    console.log(`🖼️  Downloaded ${iconManifest.size} icon(s) into: ${args.iconsDir}`);
  }
}

main().catch((err) => {
  console.error('❌ Rebuild failed:', err);
  process.exit(1);
});
