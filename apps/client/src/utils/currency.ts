/**
 * Currency formatting utilities using Intl.NumberFormat
 * Handles ISO 4217 currency codes with proper localization
 */

/**
 * Formate un montant en centimes vers une chaîne monétaire localisée.
 * Utilise l'API standard Intl.NumberFormat — aucun symbole codé en dur.
 *
 * @param cents     - montant en centimes (ex: 2999 → 29,99)
 * @param currency  - code ISO 4217 (ex: "EUR", "USD", "JPY", "GBP")
 * @param locale    - locale optionnelle (ex: "fr-FR", "en-US") — défaut: navigateur
 * @returns string formatée (ex: "29,99 €" ou "$29.99")
 *
 * @example
 * formatMoney(2999, "EUR", "fr-FR") // "29,99 €"
 * formatMoney(2999, "USD", "en-US") // "$29.99"
 * formatMoney(9800, "JPY", "ja-JP") // "¥9,800" (pas de décimales pour le JPY)
 */
export function formatMoney(
  cents: number,
  currency: string,
  locale?: string
): string {
  // Récupère le nombre de décimales standard pour cette devise
  // Intl gère nativement JPY (0 décimales), KWD (3 décimales), etc.
  return new Intl.NumberFormat(locale ?? navigator.language, {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}

/**
 * Variante avec décimales forcées (pour les affichages comptables admin).
 * Utile quand on veut toujours afficher 2 décimales même pour le JPY.
 *
 * @param cents     - montant en centimes
 * @param currency  - code ISO 4217
 * @param decimals  - nombre de décimales à forcer (défaut: 2)
 * @param locale    - locale optionnelle
 * @returns string formatée avec décimales exactes
 *
 * @example
 * formatMoneyFixed(2999, "EUR", 2, "fr-FR") // "29,99 €"
 * formatMoneyFixed(10, "JPY", 2, "ja-JP")   // "¥0.10"
 */
export function formatMoneyFixed(
  cents: number,
  currency: string,
  decimals = 2,
  locale?: string
): string {
  return new Intl.NumberFormat(locale ?? navigator.language, {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(cents / 100);
}

/**
 * Retourne uniquement le symbole de la devise pour une locale donnée.
 *
 * @param currency - code ISO 4217
 * @param locale   - locale optionnelle
 * @returns string symbole (ex: "$", "€", "¥")
 *
 * @example
 * currencySymbol("EUR", "fr-FR") // "€"
 * currencySymbol("USD", "en-US") // "$"
 * currencySymbol("GBP", "en-GB") // "£"
 */
export function currencySymbol(currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale ?? navigator.language, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value ?? currency;
}

/**
 * Formate un montant en centimes sans symbole (juste le nombre).
 * Utile pour les champs d'affichage numérique pur.
 *
 * @param cents    - montant en centimes
 * @param currency - code ISO 4217 (pour déterminer les décimales standards)
 * @param locale   - locale optionnelle
 * @returns string nombre formaté (ex: "29,99" ou "29.99")
 *
 * @example
 * formatAmount(2999, "EUR", "fr-FR") // "29,99"
 * formatAmount(2999, "USD", "en-US") // "29.99"
 */
export function formatAmount(
  cents: number,
  currency: string,
  locale?: string
): string {
  return new Intl.NumberFormat(locale ?? navigator.language, {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
