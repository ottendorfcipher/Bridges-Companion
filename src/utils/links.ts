const COMMON_FILE_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'mp4',
  'mov',
  'mp3',
  'wav',
  'zip',
  'json',
  'xml',
  'txt',
  'csv',
  'html',
  'htm',
]);

function getHostishSegment(raw: string): string {
  return raw.split(/[/?#]/)[0] || '';
}

function isLikelyLocalhost(hostish: string): boolean {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostish);
}

function looksLikeDomainOrHost(hostish: string): boolean {
  if (!hostish) return false;
  if (isLikelyLocalhost(hostish)) return true;
  if (/^www\./i.test(hostish)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(hostish)) return true; // IPv4(+port)
  if (/:\d+$/.test(hostish)) return true; // host:port

  if (!hostish.includes('.')) return false;

  const tldOrExt = hostish.split('.').pop()?.toLowerCase() || '';
  if (!tldOrExt) return false;

  // Avoid rewriting obvious relative filenames like manual.pdf.
  if (COMMON_FILE_EXTENSIONS.has(tldOrExt)) return false;

  // Most TLDs are 2-10 chars.
  if (tldOrExt.length < 2 || tldOrExt.length > 10) return false;

  return true;
}

function isAllowedProtocol(protocol: string): boolean {
  const p = protocol.toLowerCase();
  return p === 'http:' || p === 'https:' || p === 'mailto:' || p === 'tel:';
}

/**
 * Returns true if `href` looks like an external URL that is missing a scheme.
 * Example: "example.com", "www.example.com/path", "localhost:5173".
 */
export function isLikelyUnschemedExternalUrl(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('//')) return true;

  // If it already parses as an absolute URL, it's not "unschemed".
  try {
    new URL(trimmed);
    return false;
  } catch {
    // continue
  }

  const hostish = getHostishSegment(trimmed);
  return looksLikeDomainOrHost(hostish);
}

/**
 * Normalize a user-provided href for storage in HTML.
 * - Keeps internal anchors/paths (#..., /...) unchanged
 * - Allows http(s), mailto, tel
 * - Converts protocol-relative (//example.com) -> https://example.com
 * - Converts likely external URLs missing a scheme (example.com) -> https://example.com
 * - Leaves other relative values unchanged (e.g. manual.pdf, docs/page)
 *
 * Returns null when the href is unsafe/invalid.
 */
export function normalizeHrefForStorage(rawHref: string): string | null {
  const trimmed = rawHref.trim();
  if (!trimmed) return '';
  if (/\s/.test(trimmed)) return null;

  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;

  if (trimmed.startsWith('//')) {
    const abs = `https:${trimmed}`;
    try {
      const u = new URL(abs);
      return isAllowedProtocol(u.protocol) ? abs : null;
    } catch {
      return null;
    }
  }

  // Already absolute?
  try {
    const u = new URL(trimmed);
    return isAllowedProtocol(u.protocol) ? trimmed : null;
  } catch {
    // not absolute
  }

  const hostish = getHostishSegment(trimmed);
  if (!looksLikeDomainOrHost(hostish)) {
    // Treat as a relative URL/path; keep as-is.
    return trimmed;
  }

  const withProtocol = isLikelyLocalhost(hostish) ? `http://${trimmed}` : `https://${trimmed}`;
  try {
    const u = new URL(withProtocol);
    return isAllowedProtocol(u.protocol) ? withProtocol : null;
  } catch {
    return null;
  }
}

/**
 * Normalize an href for navigation purposes. If no normalization is needed, returns the original.
 */
export function normalizeHrefForNavigation(rawHref: string): string | null {
  const normalized = normalizeHrefForStorage(rawHref);
  if (normalized === null) return null;
  return normalized;
}
