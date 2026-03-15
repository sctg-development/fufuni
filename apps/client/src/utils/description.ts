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
