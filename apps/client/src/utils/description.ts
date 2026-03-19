/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

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
  const safe = stripHtml(text);
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
  const lower = term.toLowerCase();
  if (typeof parsed === 'string') return parsed.toLowerCase().includes(lower);
  return Object.values(parsed).some((v) => v.toLowerCase().includes(lower));
}

// ─── Vendor helpers (localized string) ────────────────────────────────────

/**
 * Parses vendor string: plain text (legacy) or LocalizedDesc JSON.
 */
export function parseVendor(raw: string): LocalizedDesc | string {
  if (!raw) return '';
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(raw) as LocalizedDesc;
    } catch {
      return stripHtml(raw);
    }
  }
  return stripHtml(raw);
}

/**
 * Resolves the best vendor string for a given locale.
 */
export function resolveVendor(raw: string, locale: string): string {
  const parsed = parseVendor(raw);
  if (typeof parsed === 'string') return parsed;
  for (const lang of [locale, ...DESCRIPTION_FALLBACK]) {
    if (parsed[lang]) return parsed[lang];
  }
  return '';
}

/**
 * Merges vendor for a specific locale with fallback logic:
 * - If raw is plain text: migrate to JSON, use provided locale, copy to en-US if not provided
 * - If raw is JSON: update/add the locale value
 */
export function mergeVendorLocale(
  raw: string,
  locale: string,
  text: string
): string {
  const safe = stripHtml(text);
  const parsed = parseVendor(raw);
  if (typeof parsed === 'string') {
    // Migration from plain text to JSON
    const result: LocalizedDesc = { [locale]: safe };
    // If editing a non-default locale and parsed is non-empty, use it as fallback for en-US
    if (locale !== 'en-US' && parsed) {
      result['en-US'] = parsed;
    }
    return JSON.stringify(result);
  }
  // Already JSON: update and ensure en-US exists
  const result = { ...parsed, [locale]: safe };
  if (!result['en-US'] && safe) {
    result['en-US'] = safe; // Use current value as fallback for en-US
  }
  return JSON.stringify(result);
}

/**
 * Gets vendor for a specific locale.
 */
export function getVendorForLocale(raw: string, locale: string): string {
  return resolveVendor(raw, locale);
}

// ─── Tags helpers (localized array/string) ───────────────────────────────────

/**
 * Parses tags: plain comma-separated (legacy) or LocalizedDesc JSON with comma-separated values.
 */
export function parseTags(raw: string): LocalizedDesc | string {
  if (!raw) return '';
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(raw) as LocalizedDesc;
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Resolves the best tags string for a given locale (comma-separated).
 */
export function resolveTags(raw: string, locale: string): string {
  const parsed = parseTags(raw);
  if (typeof parsed === 'string') return parsed;
  for (const lang of [locale, ...DESCRIPTION_FALLBACK]) {
    if (parsed[lang]) return parsed[lang];
  }
  return '';
}

/**
 * Merges tags for a specific locale (stored as comma-separated within JSON).
 */
export function mergeTagsLocale(
  raw: string,
  locale: string,
  tags: string
): string {
  const safe = tags.trim();
  const parsed = parseTags(raw);
  if (typeof parsed === 'string') {
    // Migration from plain text to JSON
    const result: LocalizedDesc = { [locale]: safe };
    if (locale !== 'en-US' && parsed) {
      result['en-US'] = parsed;
    }
    return JSON.stringify(result);
  }
  // Already JSON: update and ensure en-US exists
  const result = { ...parsed, [locale]: safe };
  if (!result['en-US'] && safe) {
    result['en-US'] = safe;
  }
  return JSON.stringify(result);
}

/**
 * Gets tags for a specific locale (comma-separated string).
 */
export function getTagsForLocale(raw: string, locale: string): string {
  return resolveTags(raw, locale);
}

// ─── Handle helpers (localized URL slug) ───────────────────────────────────

/**
 * Parses handle: plain text (legacy) or LocalizedDesc JSON.
 */
export function parseHandle(raw: string): LocalizedDesc | string {
  if (!raw) return '';
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as LocalizedDesc;
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, (v as string).toLowerCase()])
      ) as LocalizedDesc;
    } catch {
      return raw.toLowerCase();
    }
  }
  return raw.toLowerCase();
}

/**
 * Resolves the best handle for a given locale.
 */
export function resolveHandle(raw: string, locale: string): string {
  const parsed = parseHandle(raw);
  if (typeof parsed === 'string') return parsed;
  for (const lang of [locale, ...DESCRIPTION_FALLBACK]) {
    if (parsed[lang]) return parsed[lang];
  }
  return '';
}

/**
 * Merges handle for a specific locale.
 */
export function mergeHandleLocale(
  raw: string,
  locale: string,
  handle: string
): string {
  const safe = handle.toLowerCase().trim();
  const parsed = parseHandle(raw);
  if (typeof parsed === 'string') {
    // Migration from plain text to JSON
    const result: LocalizedDesc = { [locale]: safe };
    if (locale !== 'en-US' && parsed) {
      result['en-US'] = parsed;
    }
    return JSON.stringify(result);
  }
  // Already JSON: update and ensure en-US exists
  const result = { ...parsed, [locale]: safe };
  if (!result['en-US'] && safe) {
    result['en-US'] = safe;
  }
  return JSON.stringify(result);
}

/**
 * Gets handle for a specific locale.
 */
export function getHandleForLocale(raw: string, locale: string): string {
  return resolveHandle(raw, locale);
}

/**
 * Resolves a title that combines product title and variant title.
 * 
 * Format in cart: "Product Title - Variant Title"
 * OR: "Product Title" (no variant)
 * OR: JSON for product title, plain text for variant
 *
 * This function extracts both parts, resolves the product title to the correct locale,
 * and recombines them.
 * 
 * Examples:
 * - Input: '{"en-US": "Cap", "fr-FR": "Casquette"} - Red', locale 'fr-FR'
 *   Output: 'Casquette - Red'
 * - Input: 'Cap - Red', locale 'en-US'
 *   Output: 'Cap - Red'
 */
export function resolveTitleWithVariant(raw: string, locale: string): string {
  if (!raw) return '';

  // Try to split by ' - ' (the separator used in addItem)
  const parts = raw.split(' - ');

  if (parts.length === 1) {
    // No variant separator, just use resolveTitle
    return resolveTitle(raw, locale);
  }

  // parts[0] is the product title (may be JSON)
  // parts[1..] are the variant parts (concatenate them back in case variant has ' - ')
  const productTitleRaw = parts[0];
  const variantTitle = parts.slice(1).join(' - '); // rejoin in case variant contains ' - '

  // Resolve the product title for the locale
  const resolvedProductTitle = resolveTitle(productTitleRaw, locale);

  // Combine with variant
  return `${resolvedProductTitle} - ${variantTitle}`;
}
// ─── Tax Name helpers (localized string) ───────────────────────────────────

/**
 * Parses tax name: plain text (legacy) or LocalizedDesc JSON.
 */
export function parseTaxName(raw: string): LocalizedDesc | string {
  if (!raw) return '';
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(raw) as LocalizedDesc;
    } catch {
      return stripHtml(raw);
    }
  }
  return stripHtml(raw);
}

/**
 * Resolves the best tax name string for a given locale.
 */
export function resolveTaxName(raw: string, locale: string): string {
  const parsed = parseTaxName(raw);
  if (typeof parsed === 'string') return parsed;
  for (const lang of [locale, ...DESCRIPTION_FALLBACK]) {
    if (parsed[lang]) return parsed[lang];
  }
  return '';
}

/**
 * Merges tax name for a specific locale.
 */
export function mergeTaxNameLocale(
  raw: string,
  locale: string,
  text: string
): string {
  const safe = stripHtml(text);
  const parsed = parseTaxName(raw);
  if (typeof parsed === 'string') {
    // Migration from plain text to JSON
    const result: LocalizedDesc = { [locale]: safe };
    if (locale !== 'en-US' && parsed) {
      result['en-US'] = parsed;
    }
    return JSON.stringify(result);
  }
  // Already JSON: update and ensure en-US exists
  const result = { ...parsed, [locale]: safe };
  if (!result['en-US'] && safe) {
    result['en-US'] = safe;
  }
  return JSON.stringify(result);
}

/**
 * Gets tax name for a specific locale.
 */
export function getTaxNameForLocale(raw: string, locale: string): string {
  return resolveTaxName(raw, locale);
}
