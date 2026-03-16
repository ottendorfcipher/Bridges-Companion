export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  const normalizedBase = base.trim();
  if (!normalizedBase) return '';

  if (!taken.has(normalizedBase)) return normalizedBase;

  let i = 2;
  while (taken.has(`${normalizedBase}-${i}`)) {
    i += 1;
  }
  return `${normalizedBase}-${i}`;
}
