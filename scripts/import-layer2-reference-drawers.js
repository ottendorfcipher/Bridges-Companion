#!/usr/bin/env node
/**
 * Import Layer 2 “reference drawer” content into the runtime SQLite DB.
 *
 * What it does:
 * - Reads the vendored app-content manifest + refs markdown.
 * - Creates/updates a hidden Layer 2 page for each drawer (slug: layer2-${basePage.slug}).
 * - Imports/upserts Layer 2 scripture objects from app-content/layer2/** and attaches them
 *   to the hidden Layer 2 pages via page_scriptures (when mappings exist in layer2/index.json).
 *
 * Usage:
 *   node scripts/import-layer2-reference-drawers.js \
 *     [--src content/app-content] \
 *     [--db public/content.db] \
 *     [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';

const DEFAULT_SRC = path.resolve(process.cwd(), 'content/app-content');
const DEFAULT_DB = path.resolve(process.cwd(), 'public/content.db');

const DRAWER_PREFIX = '<!-- reference-drawer:v1 -->\n';

const MODULE_SLUG_MAP = {
  'islamic-dilemma': 'islamic-dilemma',
  'reliability-of-the-bible': 'reliability-bible',
  'jesus-in-christianity-and-islam': 'jesus-christianity-islam',
  'trinity-contextualized-for-muslims': 'trinity-muslims',
  'practical-gospel-conversations': 'practical-gospel',
  'top-10-muslim-objections': 'muslim-objections',
  'testimony-tips': 'testimony-tips',
  'islam-basics': 'islam-basics',
};

const SECTION_LABELS = {
  '01-quran.md': { key: 'quran', label: "Qur'an" },
  '02-tafsir.md': { key: 'tafsir', label: 'Tafsir' },
  '03-hadith.md': { key: 'hadith', label: 'Hadith' },
  '04-bible.md': { key: 'bible', label: 'Bible' },
};

function parseArgs(argv) {
  const args = {
    srcDir: DEFAULT_SRC,
    dbPath: DEFAULT_DB,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--src') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value after --src');
      args.srcDir = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (a === '--db') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value after --db');
      args.dbPath = path.resolve(process.cwd(), next);
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function listFiles(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.join(dirPath, d.name));
}

function parseDrawerPageNumber(drawerKey) {
  // e.g. p01-manuscript-evidence
  const m = String(drawerKey).match(/^p(\d{2})-/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function normalizeScriptureType(type) {
  // Our runtime schema + UI support: bible, quran, hadith, tafsir, other.
  if (type === 'bible' || type === 'quran' || type === 'hadith' || type === 'tafsir') return type;
  return 'other';
}

function normalizeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    // Strip trailing slash only.
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
    url.pathname = normalizedPath;
    url.hash = '';
    return url.toString();
  } catch {
    return s.replace(/\/+$/, '');
  }
}

function sha1Short(input) {
  const hex = crypto.createHash('sha1').update(String(input || ''), 'utf8').digest('hex');
  return hex.slice(0, 12);
}

function toEnDashRange(label) {
  // Keep output stable but readable in UI.
  return String(label || '').replace(/(\d+):(\d+)-(\d+)/g, (_m, c, a, b) => `${c}:${a}–${b}`);
}

function parseQuranUrl(u) {
  // Supports:
  // - https://quran.com/2/256
  // - https://quran.com/5/44-47
  // - https://quran.com/103
  try {
    const url = new URL(u);
    if (!/quran\.com$/i.test(url.hostname)) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;

    const surah = parseInt(parts[0], 10);
    if (!Number.isFinite(surah)) return null;

    if (parts.length === 1) {
      return { surah, ayah: null, endAyah: null };
    }

    // ayah or range
    const second = parts[1];
    const m = String(second).match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return { surah, ayah: null, endAyah: null };

    const ayah = parseInt(m[1], 10);
    const endAyah = m[2] ? parseInt(m[2], 10) : null;
    if (!Number.isFinite(ayah)) return { surah, ayah: null, endAyah: null };

    return { surah, ayah, endAyah: Number.isFinite(endAyah) ? endAyah : null };
  } catch {
    return null;
  }
}

function parseBibleGatewaySearch(u) {
  // e.g. https://www.biblegateway.com/passage/?search=Romans%2012%3A18&version=CSB
  try {
    const url = new URL(u);
    if (!/biblegateway\.com$/i.test(url.hostname)) return null;
    const search = url.searchParams.get('search');
    if (!search) return null;
    const decoded = search.replace(/\+/g, ' ');
    return decoded.trim();
  } catch {
    return null;
  }
}

function ensureStubScripture({ id, reference, source, url }, availableIds, byUrl, byNormalizedLabel, upsertScripture, args) {
  const sid = String(id || '').trim();
  if (!sid) return null;

  if (!availableIds.has(sid)) {
    availableIds.add(sid);
    if (url) {
      const k = normalizeUrl(url);
      if (k && !byUrl.has(k)) byUrl.set(k, sid);
    }
    const k = normalizeLabel(reference);
    if (k && !byNormalizedLabel.has(k)) byNormalizedLabel.set(k, sid);
  }

  if (!args.dryRun) {
    upsertScripture.run({
      id: sid,
      reference: String(reference || sid),
      text: null,
      source: String(source || 'other'),
      url: url ? String(url) : null,
      emphasis: 'callout',
    });
  }

  return sid;
}

function normalizeLabel(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

function uniqueStable(items) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const k = String(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function stripHtmlTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '');
}

function normalizeTitleForMatch(s) {
  return normalizeLabel(stripHtmlTags(s))
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreTitleMatch(a, b) {
  const na = normalizeTitleForMatch(a);
  const nb = normalizeTitleForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 90;

  const ta = new Set(na.split(' ').filter(Boolean));
  const tb = new Set(nb.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;

  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const union = ta.size + tb.size - inter;
  const jacc = union === 0 ? 0 : inter / union;
  return Math.round(jacc * 80);
}

function resolveBasePageForDrawer(basePages, drawerKey, drawerTitle) {
  let best = null;
  let bestScore = 0;

  for (const p of basePages) {
    const score = scoreTitleMatch(drawerTitle, p.title);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (best && bestScore >= 55) return best;

  // Fallback: match by drawer key stem tokens (e.g., "core beliefs").
  const stem = String(drawerKey || '').replace(/^p\d{2}-/, '').replace(/-/g, ' ');
  const keyNorm = normalizeTitleForMatch(stem);
  if (!keyNorm) return bestScore > 0 ? best : null;

  let best2 = null;
  let best2Score = 0;
  for (const p of basePages) {
    const pNorm = normalizeTitleForMatch(p.title);
    if (!pNorm) continue;
    if (pNorm.includes(keyNorm) || keyNorm.includes(pNorm)) {
      const score = 70;
      if (score > best2Score) {
        best2Score = score;
        best2 = p;
      }
      continue;
    }

    // Token overlap.
    const tokens = keyNorm.split(' ').filter(Boolean);
    if (tokens.length === 0) continue;
    const hits = tokens.filter((t) => pNorm.includes(t)).length;
    const score = Math.round((hits / tokens.length) * 60);
    if (score > best2Score) {
      best2Score = score;
      best2 = p;
    }
  }

  if (best2 && best2Score >= 45) return best2;

  return bestScore > 0 ? best : null;
}

function sanitizeReferenceMarkdown(md) {
  const raw = String(md || '');
  if (!raw) return '';

  // Remove explicit architecture headings.
  const lines = raw.split(/\r?\n/);
  const cleanedLines = lines.filter((line) => {
    const s = String(line || '');
    if (/layer\s*2/i.test(s) && /reference\s*drawer/i.test(s)) return false;
    if (/reference\s*drawer/i.test(s) && /^\s*#{2,6}\s+/i.test(s)) return false;
    return true;
  });

  let cleaned = cleanedLines.join('\n');

  // Replace remaining explicit mentions in prose.
  cleaned = cleaned
    .replace(/\bLayer\s*2\b/gi, '')
    .replace(/\bLayer\s*1\b/gi, '')
    .replace(/\breference\s*drawer\b/gi, 'reference section')
    .replace(/\buse\s+this\s+drawer\b/gi, 'use this section')
    .replace(/\bthis\s+drawer\b/gi, 'this section')
    .replace(/\bthe\s+drawer\b/gi, 'this section')
    .replace(/\bdrawer\b/gi, 'section')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

function extractUrlsFromMarkdown(md) {
  if (!md) return [];
  const urls = [];

  // Markdown links: [label](url)
  const linkRe = /\[[^\]]+\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(md))) {
    urls.push(String(m[1] || '').trim());
  }

  // Raw URLs.
  const rawRe = /(https?:\/\/[^\s)\]]+)/g;
  while ((m = rawRe.exec(md))) {
    urls.push(String(m[1] || '').trim());
  }

  return urls;
}

function extractScriptureIdsFromMarkdown(md, availableIds, byNormalizedLabel) {
  const ids = [];
  const text = String(md || '');

  // Qur'an refs: Qur'an 10:94 or Qur'an 5:44–47
  const qRe = /Qur[’']?an\s+(\d+):(\d+)(?:\s*[–-]\s*(\d+))?/gi;
  let m;
  while ((m = qRe.exec(text))) {
    const surah = m[1];
    const start = parseInt(m[2], 10);
    const end = m[3] ? parseInt(m[3], 10) : null;

    if (!Number.isFinite(start)) continue;

    if (end && Number.isFinite(end) && end >= start) {
      const rangeId = `quran-${surah}-${start}-${end}`;
      if (availableIds.has(rangeId)) {
        ids.push(rangeId);
      } else {
        for (let a = start; a <= end; a += 1) {
          const verseId = `quran-${surah}-${a}`;
          if (availableIds.has(verseId)) ids.push(verseId);
        }
      }
      continue;
    }

    const verseId = `quran-${surah}-${start}`;
    if (availableIds.has(verseId)) {
      ids.push(verseId);
    }
  }

  // Bible refs: try to match common "Book 1:2" patterns and map via label.
  // Examples: "John 1:1", "1 Corinthians 15:3–8"
  const bRe = /\b([1-3]\s*)?([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+)*)\s+(\d+):(\d+)(?:\s*[–-]\s*(\d+))?\b/g;
  while ((m = bRe.exec(text))) {
    const prefix = String(m[1] || '').trim();
    const book = String(m[2] || '').trim();
    const chapter = parseInt(m[3], 10);
    const vStart = parseInt(m[4], 10);
    const vEnd = m[5] ? parseInt(m[5], 10) : null;

    if (!Number.isFinite(chapter) || !Number.isFinite(vStart)) continue;

    const bookFull = `${prefix ? `${prefix} ` : ''}${book}`.replace(/\s+/g, ' ').trim();
    const label = vEnd && Number.isFinite(vEnd) && vEnd >= vStart
      ? `${bookFull} ${chapter}:${vStart}-${vEnd}`
      : `${bookFull} ${chapter}:${vStart}`;

    const mapped = byNormalizedLabel.get(normalizeLabel(label));
    if (mapped && availableIds.has(mapped)) ids.push(mapped);
  }

  // Hadith refs: "Sahih al-Bukhari 4986" / "Sahih Muslim 123".
  const hRe = /Sahih\s+al-?Bukhari\s+(\d+)/gi;
  while ((m = hRe.exec(text))) {
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n)) continue;
    const id = `hadith-bukhari-${n}`;
    if (availableIds.has(id)) ids.push(id);
  }

  const hmRe = /Sahih\s+Muslim\s+(\d+)/gi;
  while ((m = hmRe.exec(text))) {
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n)) continue;
    const id = `hadith-muslim-${n}`;
    if (availableIds.has(id)) ids.push(id);
  }

  // Tafsir refs: "Ibn Kathir" + Qur'an x:y
  const tRe = /Ibn\s+Kathir[^\n]*?Qur[’']?an\s+(\d+):(\d+)(?:\s*[–-]\s*(\d+))?/gi;
  while ((m = tRe.exec(text))) {
    const surah = m[1];
    const start = parseInt(m[2], 10);
    const end = m[3] ? parseInt(m[3], 10) : null;
    if (!Number.isFinite(start)) continue;

    if (end && Number.isFinite(end) && end >= start) {
      const rangeId = `tafsir-ibn-kathir-${surah}-${start}-${end}`;
      if (availableIds.has(rangeId)) {
        ids.push(rangeId);
      } else {
        for (let a = start; a <= end; a += 1) {
          const id = `tafsir-ibn-kathir-${surah}-${a}`;
          if (availableIds.has(id)) ids.push(id);
        }
      }
      continue;
    }

    const id = `tafsir-ibn-kathir-${surah}-${start}`;
    if (availableIds.has(id)) ids.push(id);
  }

  return uniqueStable(ids);
}

function scriptureRowFromItem(item) {
  const id = String(item?.id ?? '').trim();
  if (!id) return null;

  const type = normalizeScriptureType(String(item?.type ?? '').trim());
  const reference = String(item?.label ?? '').trim() || id;

  let text = '';
  let url = null;

  const source = item?.source ?? null;

  if (type === 'quran') {
    text = String(source?.text ?? '').trim();
    url = typeof source?.url === 'string' ? source.url : null;
  } else if (type === 'bible') {
    text = String(source?.text ?? '').trim();
    url = typeof source?.url === 'string' ? source.url : null;
  } else if (type === 'hadith') {
    text = String(source?.summary ?? source?.text ?? '').trim();
    url = typeof source?.url === 'string' ? source.url : null;
  } else if (type === 'tafsir') {
    text = String(source?.summary ?? '').trim();
    url = typeof source?.url === 'string' ? source.url : null;
  } else {
    // type === other (includes "source" from app-content)
    text = String(source?.summary ?? source?.text ?? '').trim();
    url = typeof source?.url === 'string' ? source.url : null;
  }

  return {
    id,
    reference,
    text: text || null,
    source: type,
    url,
    emphasis: 'callout',
  };
}

function loadAllScriptureItems(srcDir) {
  const layer2Dir = path.join(srcDir, 'layer2');
  const folders = ['bible', 'quran', 'hadith', 'tafsir', 'source'];

  const items = [];
  for (const f of folders) {
    const dir = path.join(layer2Dir, f);
    if (!fs.existsSync(dir)) continue;

    const files = listFiles(dir).filter((p) => p.endsWith('.json'));
    for (const file of files) {
      try {
        const item = readJson(file);
        items.push(item);
      } catch (e) {
        console.warn(`⚠️  Failed to parse JSON: ${file} (${e?.message || String(e)})`);
      }
    }
  }

  return items;
}

function ensureDbExists(dbPath) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite DB not found: ${dbPath}`);
  }
}

function main() {
  const args = parseArgs(process.argv);

  const manifestPath = path.join(args.srcDir, 'src/content/layer2/manifest.json');
  const refsRoot = path.join(args.srcDir, 'src/content/layer2/refs');
  const indexPath = path.join(args.srcDir, 'layer2/index.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found at ${manifestPath}`);
  }
  if (!fs.existsSync(refsRoot)) {
    throw new Error(`refs/ not found at ${refsRoot}`);
  }

  ensureDbExists(args.dbPath);

  const manifest = readJson(manifestPath);
  const index = fs.existsSync(indexPath) ? readJson(indexPath) : {};

  const sqlite = new Database(args.dbPath);
  sqlite.pragma('foreign_keys = ON');

  const selectModuleId = sqlite.prepare('SELECT id FROM modules WHERE slug = ? LIMIT 1');

  const selectBasePagesForModule = sqlite.prepare(
    `SELECT id, slug, title, page_number, sensitivity, display_order
     FROM pages
     WHERE module_id = ? AND is_deleted = 0 AND is_hidden = 0
     ORDER BY (page_number IS NULL), page_number, display_order, id`
  );

  const selectLayer2SlugsForModule = sqlite.prepare(
    `SELECT slug
     FROM pages
     WHERE module_id = ? AND is_deleted = 0 AND page_type = 'layer2'`
  );

  const selectPageIdBySlug = sqlite.prepare('SELECT id FROM pages WHERE slug = ? LIMIT 1');

  const insertPage = sqlite.prepare(
    `INSERT INTO pages (
      module_id, title, slug, page_number, page_type, sensitivity, display_order,
      content, summary, purpose,
      is_hidden, is_deleted
    ) VALUES (
      ?, ?, ?, NULL, ?, ?, ?,
      ?, NULL, NULL,
      1, 0
    )`
  );

  const deletePageBySlug = sqlite.prepare('DELETE FROM pages WHERE slug = ?');

  const updatePage = sqlite.prepare(
    `UPDATE pages
     SET title = ?, content = ?, page_type = ?, is_hidden = 1
     WHERE id = ?`
  );

  const upsertScripture = sqlite.prepare(
    `INSERT INTO scriptures (id, reference, text, source, url, emphasis)
     VALUES (@id, @reference, @text, @source, @url, @emphasis)
     ON CONFLICT(id) DO UPDATE SET
       reference = excluded.reference,
       text = excluded.text,
       source = excluded.source,
       url = excluded.url,
       emphasis = excluded.emphasis`
  );

  const selectPageScriptureIds = sqlite.prepare(
    `SELECT scripture_id
     FROM page_scriptures
     WHERE page_id = ?
     ORDER BY display_order`
  );

  const deletePageScriptures = sqlite.prepare('DELETE FROM page_scriptures WHERE page_id = ?');
  const insertPageScripture = sqlite.prepare(
    `INSERT OR REPLACE INTO page_scriptures (page_id, scripture_id, display_order)
     VALUES (?, ?, ?)`
  );
  const hasScripture = sqlite.prepare('SELECT 1 FROM scriptures WHERE id = ? LIMIT 1');

  const run = sqlite.transaction(() => {
    // 1) Import/update scriptures first so FK constraints are satisfied when attaching.
    const scriptureItems = loadAllScriptureItems(args.srcDir);
    let scripturesUpserted = 0;

    const availableIds = new Set();
    const byUrl = new Map();
    const byNormalizedLabel = new Map();

    for (const item of scriptureItems) {
      const row = scriptureRowFromItem(item);
      if (!row) continue;

      availableIds.add(row.id);

      const itemUrl = item?.source?.url;
      if (typeof itemUrl === 'string' && itemUrl.trim()) {
        const key = normalizeUrl(itemUrl);
        if (key && !byUrl.has(key)) {
          byUrl.set(key, row.id);
        }
      }

      const label = typeof item?.label === 'string' ? item.label : null;
      if (label) {
        const k = normalizeLabel(label);
        if (k && !byNormalizedLabel.has(k)) {
          byNormalizedLabel.set(k, row.id);
        }
      }

      if (!args.dryRun) upsertScripture.run(row);
      scripturesUpserted += 1;
    }

    // 2) Import references.
    let drawersSeen = 0;
    let referencesWritten = 0;
    let attachmentsMade = 0;

    const defaultSectionFiles = [
      '01-quran.md',
      '02-tafsir.md',
      '03-hadith.md',
      '04-bible.md',
    ];

    for (const [moduleKey, drawers] of Object.entries(manifest)) {
      const moduleSlug = MODULE_SLUG_MAP[moduleKey];
      if (!moduleSlug) {
        console.warn(`⚠️  No module mapping for manifest module: ${moduleKey} (skipping)`);
        continue;
      }

      const moduleRow = selectModuleId.get(moduleSlug);
      if (!moduleRow) {
        console.warn(`⚠️  Module not found in DB for slug: ${moduleSlug} (manifest: ${moduleKey})`);
        continue;
      }

      const basePages = selectBasePagesForModule.all(moduleRow.id);
      if (!Array.isArray(basePages) || basePages.length === 0) {
        console.warn(`⚠️  No base pages found for module=${moduleSlug} (manifest: ${moduleKey})`);
        continue;
      }

      // Assign manifest drawers to base pages.
      // Strategy:
      // 1) Prefer page-number mapping with a per-module offset (computed by maximizing title similarity).
      // 2) Fall back to title matching if page-number mapping fails.
      const drawerEntries = [];
      for (const [drawerKey, drawerDef] of Object.entries(drawers || {})) {
        drawersSeen += 1;
        drawerEntries.push({
          drawerKey,
          drawerDef,
          drawerTitle: String(drawerDef?.title ?? '').trim() || 'Reference',
          pageNumber: parseDrawerPageNumber(drawerKey),
        });
      }

      const baseByNumber = new Map();
      for (const p of basePages) {
        if (typeof p.page_number === 'number' && Number.isFinite(p.page_number)) {
          baseByNumber.set(p.page_number, p);
        }
      }

      let bestOffset = 0;
      let bestScore = -1;
      let bestMatches = -1;

      for (let offset = -10; offset <= 10; offset += 1) {
        let scoreSum = 0;
        let matches = 0;

        for (const d of drawerEntries) {
          if (typeof d.pageNumber !== 'number' || !Number.isFinite(d.pageNumber)) continue;
          const target = baseByNumber.get(d.pageNumber + offset);
          if (!target) continue;
          matches += 1;
          scoreSum += scoreTitleMatch(d.drawerTitle, target.title);
        }

        if (matches === 0) continue;

        const isBetter =
          scoreSum > bestScore ||
          (scoreSum === bestScore && matches > bestMatches) ||
          (scoreSum === bestScore && matches === bestMatches && Math.abs(offset) < Math.abs(bestOffset));

        if (isBetter) {
          bestOffset = offset;
          bestScore = scoreSum;
          bestMatches = matches;
        }
      }

      const drawerByBaseId = new Map();
      const usedBaseIds = new Set();

      for (const d of drawerEntries) {
        let match = null;

        if (typeof d.pageNumber === 'number' && Number.isFinite(d.pageNumber)) {
          const candidate = baseByNumber.get(d.pageNumber + bestOffset) || null;
          if (candidate && !usedBaseIds.has(candidate.id)) {
            match = candidate;
          }
        }

        // Fallback: best title match among unused pages.
        if (!match) {
          const unused = basePages.filter((p) => !usedBaseIds.has(p.id));
          match = resolveBasePageForDrawer(unused, d.drawerKey, d.drawerTitle);
        }

        if (!match) {
          console.warn(`⚠️  Could not match drawer to base page: ${moduleKey}/${d.drawerKey} (${d.drawerTitle})`);
          continue;
        }

        usedBaseIds.add(match.id);
        drawerByBaseId.set(match.id, {
          drawerKey: d.drawerKey,
          drawerDef: d.drawerDef,
          drawerTitle: d.drawerTitle,
          pageNumber: d.pageNumber,
        });
      }

      const desiredSlugs = new Set();

      // Ensure every base page has a nested reference section.
      for (const basePage of basePages) {
        const layer2Slug = `layer2-${basePage.slug}`;
        desiredSlugs.add(layer2Slug);

        const assignment = drawerByBaseId.get(basePage.id) || null;
        const drawerKey = assignment?.drawerKey || null;
        const drawerDef = assignment?.drawerDef || null;
        const pageNumber = assignment?.pageNumber || null;

        const tabs = [];
        let links = [];

        const refDir = drawerKey ? path.join(refsRoot, moduleKey, drawerKey) : null;
        const folderExists = refDir ? fs.existsSync(refDir) : false;

        const sectionFilesRaw = Array.isArray(drawerDef?.sections) && drawerDef.sections.length > 0
          ? drawerDef.sections
          : defaultSectionFiles;

        // Remove summary/notes across all modules.
        const filteredSectionFiles = sectionFilesRaw.filter((f) => f !== '00-summary.md' && f !== '05-notes.md');
        const sectionFiles = filteredSectionFiles.length > 0 ? filteredSectionFiles : defaultSectionFiles;

        for (const sectionFile of sectionFiles) {
          const labelInfo = SECTION_LABELS[sectionFile] ?? { key: sectionFile, label: sectionFile };

          if (folderExists && refDir) {
            const mdPath = path.join(refDir, sectionFile);
            const md = readTextIfExists(mdPath);
            const sanitized = md ? sanitizeReferenceMarkdown(md) : '';
            tabs.push({ key: labelInfo.key, label: labelInfo.label, markdown: sanitized });
          } else {
            tabs.push({ key: labelInfo.key, label: labelInfo.label, markdown: '' });
          }
        }

        if (folderExists && refDir) {
          const linksPath = path.join(refDir, String(drawerDef?.links ?? 'links.json'));
          if (fs.existsSync(linksPath)) {
            try {
              links = readJson(linksPath);
            } catch (e) {
              console.warn(`⚠️  Failed to parse links.json for ${moduleKey}/${drawerKey}: ${e?.message || String(e)}`);
            }
          }
        } else if (drawerKey && !folderExists) {
          console.warn(`ℹ️  Reference folder missing for ${moduleKey}/${drawerKey} (creating empty reference section)`);
        }

        const payload = {
          version: 1,
          kind: 'reference-drawer',
          title: String(basePage.title || 'Reference'),
          base: {
            pageId: basePage.id,
            slug: basePage.slug,
            title: basePage.title,
          },
          drawer: assignment
            ? { moduleKey, drawerKey, pageNumber }
            : { moduleKey, drawerKey: null, pageNumber: null },
          tabs,
          links,
        };

        const content = `${DRAWER_PREFIX}${JSON.stringify(payload)}`;
        const existing = selectPageIdBySlug.get(layer2Slug);

        let layer2PageId;
        if (existing?.id) {
          layer2PageId = existing.id;
          if (!args.dryRun) {
            updatePage.run(String(basePage.title || 'Reference'), content, 'layer2', layer2PageId);
          }
        } else {
          if (!args.dryRun) {
            const displayOrder = typeof basePage.display_order === 'number' ? basePage.display_order : 0;
            const sensitivity = basePage.sensitivity || 'low';
            const info = insertPage.run(
              moduleRow.id,
              String(basePage.title || 'Reference'),
              layer2Slug,
              'layer2',
              sensitivity,
              displayOrder,
              content
            );
            layer2PageId = info.lastInsertRowid;
          } else {
            layer2PageId = -1;
          }
        }

        referencesWritten += 1;

        // Build callouts: merge drawer-derived callouts with any existing base page callouts.
        const derivedIds = [];

        if (assignment) {
          // Attach scriptures (try explicit index mapping first; otherwise derive from markdown + links).
          const idxKeyA = `${moduleKey}-${assignment.drawerKey}`;
          const idxKeyB = pageNumber ? `${moduleKey}-page-${pageNumber}` : null;
          const indexIds = (index[idxKeyA] ?? (idxKeyB ? index[idxKeyB] : null) ?? null);

          if (Array.isArray(indexIds) && indexIds.length > 0) {
            for (const sid of indexIds) {
              const s = String(sid ?? '').trim();
              if (s) derivedIds.push(s);
            }
          }

          // URLs from links.json (and labels as reference text)
          const linksText = links
            .map((l) => String(l?.label || ''))
            .filter(Boolean)
            .join('\n');

          for (const l of links) {
            const u = typeof l?.url === 'string' ? l.url : '';
            const label = typeof l?.label === 'string' ? l.label : '';

            const mapped = byUrl.get(normalizeUrl(u));
            if (mapped) {
              derivedIds.push(mapped);
              continue;
            }

            // If we can't map by URL, attempt to create a stub scripture that matches the link.
            const q = parseQuranUrl(u);
            if (q && Number.isFinite(q.surah)) {
              if (q.ayah && q.endAyah && q.endAyah >= q.ayah) {
                const sid = `quran-${q.surah}-${q.ayah}-${q.endAyah}`;
                const ref = `Qur'an ${q.surah}:${q.ayah}-${q.endAyah}`;
                const url = `https://quran.com/${q.surah}/${q.ayah}-${q.endAyah}`;
                {
                  const ensured = ensureStubScripture(
                    { id: sid, reference: toEnDashRange(ref), source: 'quran', url },
                    availableIds,
                    byUrl,
                    byNormalizedLabel,
                    upsertScripture,
                    args
                  );
                  if (ensured) derivedIds.push(ensured);
                }
                continue;
              }

              if (q.ayah) {
                const sid = `quran-${q.surah}-${q.ayah}`;
                const ref = `Qur'an ${q.surah}:${q.ayah}`;
                const url = `https://quran.com/${q.surah}/${q.ayah}`;
                {
                  const ensured = ensureStubScripture(
                    { id: sid, reference: ref, source: 'quran', url },
                    availableIds,
                    byUrl,
                    byNormalizedLabel,
                    upsertScripture,
                    args
                  );
                  if (ensured) derivedIds.push(ensured);
                }
                continue;
              }

              const sid = `quran-${q.surah}`;
              const ref = `Qur'an ${q.surah}`;
              const url = `https://quran.com/${q.surah}`;
              {
                const ensured = ensureStubScripture(
                  { id: sid, reference: ref, source: 'quran', url },
                  availableIds,
                  byUrl,
                  byNormalizedLabel,
                  upsertScripture,
                  args
                );
                if (ensured) derivedIds.push(ensured);
              }
              continue;
            }

            const bg = parseBibleGatewaySearch(u);
            if (bg) {
              const sid = `bible-ref-${sha1Short(bg)}`;
              {
                const ensured = ensureStubScripture(
                  { id: sid, reference: toEnDashRange(bg), source: 'bible', url: u },
                  availableIds,
                  byUrl,
                  byNormalizedLabel,
                  upsertScripture,
                  args
                );
                if (ensured) derivedIds.push(ensured);
              }
              continue;
            }

            void label;
          }

          const allMd = `${tabs.map((t) => t.markdown).join('\n\n')}\n\n${linksText}`;

          for (const u of extractUrlsFromMarkdown(allMd)) {
            const mapped = byUrl.get(normalizeUrl(u));
            if (mapped) derivedIds.push(mapped);
          }

          for (const s of extractScriptureIdsFromMarkdown(allMd, availableIds, byNormalizedLabel)) {
            derivedIds.push(s);
          }

          const stem = String(assignment.drawerKey).replace(/^p\d{2}-/, '').trim();
          const sourceId = `source-${stem}`;
          if (availableIds.has(sourceId)) {
            derivedIds.push(sourceId);
          }
        }

        const baseIds = selectPageScriptureIds.all(basePage.id).map((r) => String(r.scripture_id));
        const idsToAttach = uniqueStable([...derivedIds, ...baseIds]);

        if (!args.dryRun) {
          // Attach to reference page.
          deletePageScriptures.run(layer2PageId);

          let displayOrder = 0;
          for (const scriptureId of idsToAttach) {
            const sid = String(scriptureId ?? '').trim();
            if (!sid) continue;

            if (!hasScripture.get(sid)) {
              console.warn(`⚠️  Scripture missing in DB (skipping attach): ${sid} (module ${moduleKey})`);
              continue;
            }

            insertPageScripture.run(layer2PageId, sid, displayOrder);
            displayOrder += 1;
            attachmentsMade += 1;
          }

          // Remove callouts from the base page (they now live under the nested reference section).
          deletePageScriptures.run(basePage.id);
        }
      }

      // Prune stale reference pages for this module.
      const existingSlugs = selectLayer2SlugsForModule.all(moduleRow.id).map((r) => String(r.slug));
      for (const s of existingSlugs) {
        if (!desiredSlugs.has(s)) {
          if (!args.dryRun) {
            deletePageBySlug.run(s);
          }
        }
      }
    }

    return { scripturesUpserted, drawersSeen, referencesWritten, attachmentsMade };
  });

  const result = run();

  sqlite.close();

  console.log('✅ Layer 2 import complete');
  console.log(`   dry-run: ${args.dryRun ? 'yes' : 'no'}`);
  console.log(`   scriptures upserted: ${result.scripturesUpserted}`);
  console.log(`   drawers seen: ${result.drawersSeen}`);
  console.log(`   reference pages written: ${result.referencesWritten}`);
  console.log(`   page_scriptures attached: ${result.attachmentsMade}`);
}

try {
  main();
} catch (e) {
  console.error('❌ Import failed:', e);
  process.exitCode = 1;
}
