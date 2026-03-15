// apps/client/src/utils/description.ts

/** Map locale → HTML content, stored as JSON string in the DB */
export type LocalizedDesc = Record<string, string>;

// Fallback chain: order in which locales are tried when the requested
// locale is missing from the stored JSON.
export const DESCRIPTION_FALLBACK = [
  'en-US', 'fr-FR', 'es-ES', 'zh-CN', 'ar-SA', 'he-IL',
] as const;

/**
 * Detects whether a raw DB string is a LocalizedDesc JSON or plain HTML.
 * Returns the parsed object or the original string.
 */
export function parseDescription(raw: string): LocalizedDesc | string {
  if (!raw) return '';
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(raw) as LocalizedDesc;
    } catch {
      // Malformed JSON: treat as plain HTML
    }
  }
  return raw;
}

/**
 * Resolves the best description string for a given locale.
 * - If raw is plain HTML: returns it as-is (legacy).
 * - If raw is JSON: returns the value for `locale`, or walks the fallback
 *   chain to find the first non-empty value.
 */
export function resolveDescription(raw: string, locale: string): string {
  const parsed = parseDescription(raw);
  if (typeof parsed === 'string') return parsed;

  // Exact match first, then fallback chain
  for (const lang of [locale, ...DESCRIPTION_FALLBACK]) {
    if (parsed[lang]) return parsed[lang];
  }
  return '';
}

/**
 * Merges a new HTML string for a specific locale into the existing raw value.
 * - If raw is plain HTML: migrates it to JSON using the provided locale as key.
 * - If raw is already JSON: updates or adds the locale key.
 */
export function mergeLocale(
  raw: string,
  locale: string,
  html: string
): string {
  const parsed = parseDescription(raw);
  if (typeof parsed === 'string') {
    // First call ever: migrate from plain HTML.
    // The plain HTML becomes the content for the current locale.
    return JSON.stringify({ [locale]: html });
  }
  return JSON.stringify({ ...parsed, [locale]: html });
}

/**
 * Returns the content that should fill the editor when the admin opens
 * a product or switches locale.
 *
 * Rule:
 * - Plain HTML → always show the plain HTML regardless of locale.
 * - JSON + locale exists → show that locale's content.
 * - JSON + locale missing → show the first non-empty fallback locale.
 */
export function getEditorContent(raw: string, locale: string): string {
  const parsed = parseDescription(raw);
  if (typeof parsed === 'string') return parsed;
  return resolveDescription(raw, locale);
}

/**
 * Returns true if the raw value is already a LocalizedDesc JSON object.
 */
export function isLocalized(raw: string): boolean {
  return typeof parseDescription(raw) === 'object';
}

// ─── Plain-text title helpers (same logic, HTML-free) ─────────────────────────

/**
 * Strips any accidental HTML tags from a plain-text title value.
 * Titles must never contain HTML — this is a safety guard.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Parses a raw DB title string: plain text (legacy) or LocalizedDesc JSON.
 * Identical to parseDescription but strips HTML from all values as a guard.
 */
export function parseTitle(raw: string): LocalizedDesc | string {
  if (!raw) return '';
  const parsed = parseDescription(raw);
  if (typeof parsed === 'string') return stripHtml(parsed);

  // Strip HTML from every locale value (safety guard)
  return Object.fromEntries(
    Object.entries(parsed).map(([k, v]) => [k, stripHtml(v)])
  ) as LocalizedDesc;
}

/**
 * Resolves the best plain-text title for a given locale.
 * Walks the same fallback chain as resolveDescription.
 */
export function resolveTitle(raw: string, locale: string): string {
  const parsed = parseTitle(raw);
  if (typeof parsed === 'string') return parsed;

  for (const lang of [locale, ...DESCRIPTION_FALLBACK]) {
    if (parsed[lang]) return parsed[lang];
  }
  return '';
}

/**
 * Merges a new plain-text string for a locale into the existing raw title.
 * - Legacy plain string → migrates to JSON on first write.
 * - Existing JSON → updates or adds the locale key.
 * HTML is stripped before storing.
 * 
 * IMPORTANT: When migrating from plain text, we preserve the original content
 * in the default locale (en-US) as a fallback, so other locales can inherit it.
 */
export function mergeTitleLocale(
  raw: string,
  locale: string,
  text: string
): string {
  const safe   = stripHtml(text);
  const parsed = parseTitle(raw);
  if (typeof parsed === 'string') {
    // Migration: when converting plain text to JSON,
    // preserve the original text as fallback in en-US
    const defaultLocale = 'en-US';
    if (locale === defaultLocale) {
      // We're editing the default locale directly
      return JSON.stringify({ [locale]: safe });
    } else {
      // We're adding a new locale: preserve the plain text as en-US fallback
      return JSON.stringify({ [defaultLocale]: parsed, [locale]: safe });
    }
  }
  return JSON.stringify({ ...parsed, [locale]: safe });
}

/**
 * Returns the value to display in the title input for a given locale.
 * - Plain text → always returns it as-is.
 * - JSON → returns the locale value, with fallback.
 */
export function getTitleForLocale(raw: string, locale: string): string {
  return resolveTitle(raw, locale);
}

/**
 * Returns true if the raw title is stored as LocalizedDesc JSON.
 */
export function isTitleLocalized(raw: string): boolean {
  return typeof parseTitle(raw) === 'object';
}

/**
 * Searches the raw title value across ALL stored locales.
 * Used for admin search — matches if any locale contains the term.
 */
export function titleMatchesTerm(raw: string, term: string): boolean {
  const parsed = parseTitle(raw);
  const lower  = term.toLowerCase();
  if (typeof parsed === 'string') return parsed.toLowerCase().includes(lower);
  return Object.values(parsed).some((v) => v.toLowerCase().includes(lower));
}
