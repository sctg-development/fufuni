# Plan d'action — Gestion avancée des frais de livraison
## Classes d'expédition produit, calcul de masse du panier et intégration Stripe complète

**Projet :** Merchant / Fufuni — Cloudflare Workers + Durable Objects + React/HeroUI
**Rédigé pour :** développeur junior
**Date :** mars 2026
**Statut de départ :** GAP-01 et GAP-02 partiellement implémentés

---

## Avant de commencer — Ce que tu vas construire

Actuellement, le système de livraison calcule le coût uniquement en fonction du **poids total du panier**.
C'est suffisant pour les produits standards, mais pas pour des cas comme :

- un canapé qui ne peut partir qu'en livraison palettisée (fret)
- une batterie lithium qui nécessite un supplément "matières dangereuses"
- un produit express-only (sur mesure, urgent)

La solution est d'ajouter des **classes d'expédition** (`shippingclasses`) sur les produits.
Chaque tarif d'expédition sera ensuite rattaché (ou non) à une classe.
Quand un panier contient un produit avec une classe spéciale, seuls les tarifs compatibles sont proposés.

### Vue d'ensemble des fichiers à modifier

```
apps/merchant/
├── migrations/
│   └── 018-add-shipping-classes.sql       ← NOUVEAU
├── src/
│   ├── do.ts                              ← MODIFIER (SCHEMA + migrations inline)
│   ├── schemas.ts                         ← MODIFIER (nouveaux types Zod)
│   ├── routes/
│   │   ├── checkout.ts                    ← MODIFIER (logique principale)
│   │   ├── regions.ts                     ← MODIFIER (CRUD shippingclasses)
│   │   └── catalog.ts                     ← MODIFIER (shippingclassid sur variants/products)
│   └── lib/
│       └── shipping.ts                    ← NOUVEAU (fonctions utilitaires)
apps/client/
├── src/
│   ├── pages/admin/
│   │   └── shipping-classes.tsx           ← NOUVEAU (page admin)
│   ├── lib/
│   │   └── store-api.ts                   ← MODIFIER (nouveaux appels API)
│   └── App.tsx                            ← MODIFIER (nouvelle route)
```

---

## Étape 1 — Migration SQL 018

### Fichier : `apps/merchant/migrations/018-add-shipping-classes.sql`

Ce fichier est exécuté **une seule fois** sur les bases de données existantes (D1 hébergée).
Il utilise `IF NOT EXISTS` et `ALTER TABLE ... ADD COLUMN` pour être sûr de ne pas casser une base déjà en production.

```sql
-- Migration 018: Add shipping classes for product-specific shipping options
-- This allows certain products (e.g. furniture, hazmat) to require specific carriers.
--
-- Run locally:
--   npx wrangler d1 execute merchant --local --file migrations/018-add-shipping-classes.sql
-- Run remotely:
--   npx wrangler d1 execute merchant-db --remote --file migrations/018-add-shipping-classes.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create the shippingclasses table
-- ─────────────────────────────────────────────────────────────────────────────
-- A shipping class groups products that share the same transport constraints.
-- resolution:
--   'exclusive' → if a cart contains this class, ONLY rates from this class are shown
--   'additive'  → rates from this class are shown IN ADDITION to universal rates
CREATE TABLE IF NOT EXISTS shippingclasses (
  id          TEXT    PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,          -- e.g. 'oversized', 'fragile', 'freight'
  displayname TEXT    NOT NULL,                  -- e.g. 'Hors-gabarit / Fret'
  description TEXT,
  resolution  TEXT    NOT NULL DEFAULT 'exclusive'
              CHECK (resolution IN ('exclusive', 'additive')),
  status      TEXT    NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  createdat   TEXT    NOT NULL DEFAULT (datetime('now')),
  updatedat   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shippingclasses_code   ON shippingclasses (code);
CREATE INDEX IF NOT EXISTS idx_shippingclasses_status ON shippingclasses (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Link products and variants to shipping classes
-- ─────────────────────────────────────────────────────────────────────────────
-- The class on the variant overrides the class on the product.
-- NULL on both = standard product, no transport restriction.
ALTER TABLE products  ADD COLUMN shippingclassid TEXT REFERENCES shippingclasses(id);
ALTER TABLE variants  ADD COLUMN shippingclassid TEXT REFERENCES shippingclasses(id);

CREATE INDEX IF NOT EXISTS idx_products_shippingclass ON products (shippingclassid);
CREATE INDEX IF NOT EXISTS idx_variants_shippingclass ON variants (shippingclassid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Link shipping rates to a class
-- ─────────────────────────────────────────────────────────────────────────────
-- NULL = universal rate (works for standard products with no special class)
-- A non-null value = this rate is ONLY available when the cart contains that class.
ALTER TABLE shippingrates ADD COLUMN shippingclassid TEXT REFERENCES shippingclasses(id);

CREATE INDEX IF NOT EXISTS idx_shippingrates_shippingclass ON shippingrates (shippingclassid);
```

---

## Étape 2 — Mettre à jour `do.ts`

`do.ts` contient deux choses à modifier :
1. **`SCHEMA`** — la chaîne SQL qui crée toutes les tables pour un Durable Object *neuf*
2. **`migrations`** — le tableau des migrations incrémentales pour les DO *existants*

### 2a. Ajouter la table `shippingclasses` dans `SCHEMA`

Dans le fichier `do.ts`, cherche le bloc `const SCHEMA = \`...\``.
La table `shippingrates` existe déjà. **Ajoute le bloc `shippingclasses` juste avant elle.**

```typescript
// In do.ts, inside the SCHEMA string — add BEFORE the shippingrates table block

// ─── Shipping classes (product-specific transport constraints) ───────────────
// A shipping class groups products that require the same type of carrier.
// 'exclusive': only rates from this class are shown when the cart contains it
// 'additive':  rates from this class are added to the universal rates
`CREATE TABLE IF NOT EXISTS shippingclasses (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  displayname TEXT NOT NULL,
  description TEXT,
  resolution  TEXT NOT NULL DEFAULT 'exclusive'
              CHECK (resolution IN ('exclusive', 'additive')),
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  createdat   TEXT NOT NULL DEFAULT (datetime('now')),
  updatedat   TEXT NOT NULL DEFAULT (datetime('now'))
)`

// Also update the shippingrates table definition to include shippingclassid:
// (replace the existing CREATE TABLE IF NOT EXISTS shippingrates block)
`CREATE TABLE IF NOT EXISTS shippingrates (
  id              TEXT PRIMARY KEY,
  displayname     TEXT NOT NULL,
  description     TEXT,
  maxweightg      INTEGER,
  mindeliverydays INTEGER,
  maxdeliverydays INTEGER,
  shippingclassid TEXT REFERENCES shippingclasses(id),  -- NEW: null = universal
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive')),
  createdat       TEXT NOT NULL DEFAULT (datetime('now')),
  updatedat       TEXT NOT NULL DEFAULT (datetime('now'))
)`

// Also update products and variants to add shippingclassid:
`CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  imageurl        TEXT,
  shippingclassid TEXT REFERENCES shippingclasses(id),  -- NEW: default for all variants
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'draft')),
  createdat       TEXT NOT NULL DEFAULT (datetime('now'))
)`

`CREATE TABLE IF NOT EXISTS variants (
  id              TEXT PRIMARY KEY,
  productid       TEXT NOT NULL REFERENCES products(id),
  sku             TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  pricecents      INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  weightg         INTEGER NOT NULL,
  dimscm          TEXT,
  imageurl        TEXT,
  shippingclassid TEXT REFERENCES shippingclasses(id),  -- NEW: overrides product class
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'draft')),
  createdat       TEXT NOT NULL DEFAULT (datetime('now'))
)`
```

### 2b. Ajouter les index dans `SCHEMA`

Après les index existants, ajoute :

```typescript
// In do.ts, after the existing indexes in the SCHEMA string

`CREATE INDEX IF NOT EXISTS idx_shippingclasses_code    ON shippingclasses (code)`
`CREATE INDEX IF NOT EXISTS idx_shippingclasses_status  ON shippingclasses (status)`
`CREATE INDEX IF NOT EXISTS idx_products_shippingclass  ON products (shippingclassid)`
`CREATE INDEX IF NOT EXISTS idx_variants_shippingclass  ON variants (shippingclassid)`
`CREATE INDEX IF NOT EXISTS idx_shippingrates_class     ON shippingrates (shippingclassid)`
```

### 2c. Ajouter les migrations incrémentales

Dans la variable `migrations` de `do.ts`, cherche la fin du tableau
(après les entrées GAP-01 `cartbillingsameasshipping`).
Ajoute les nouvelles migrations à la suite :

```typescript
// In do.ts, inside the `migrations` array, add after the GAP-01 entries

// ─── Migration 018: Shipping classes ───────────────────────────────────────
// These entries run only once per Durable Object instance.
// The system skips entries already present in the schema_migrations table.

// Create the shippingclasses table
{ name: 'shippingclasses_table', sql: `
  CREATE TABLE IF NOT EXISTS shippingclasses (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    displayname TEXT NOT NULL,
    description TEXT,
    resolution  TEXT NOT NULL DEFAULT 'exclusive'
                CHECK (resolution IN ('exclusive', 'additive')),
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive')),
    createdat   TEXT NOT NULL DEFAULT (datetime('now')),
    updatedat   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`},
{ name: 'shippingclasses_idx_code',   sql: `CREATE INDEX IF NOT EXISTS idx_shippingclasses_code   ON shippingclasses (code)` },
{ name: 'shippingclasses_idx_status', sql: `CREATE INDEX IF NOT EXISTS idx_shippingclasses_status ON shippingclasses (status)` },

// Add shippingclassid to existing tables
// SQLite does not support adding a column with a foreign key inline via ALTER TABLE,
// so we add it as nullable TEXT and rely on the app to enforce the reference.
{ name: 'products_add_shippingclassid',   sql: `ALTER TABLE products      ADD COLUMN shippingclassid TEXT` },
{ name: 'variants_add_shippingclassid',   sql: `ALTER TABLE variants       ADD COLUMN shippingclassid TEXT` },
{ name: 'shippingrates_add_classid',      sql: `ALTER TABLE shippingrates  ADD COLUMN shippingclassid TEXT` },

// Indexes for the new columns
{ name: 'idx_products_shippingclass',   sql: `CREATE INDEX IF NOT EXISTS idx_products_shippingclass  ON products      (shippingclassid)` },
{ name: 'idx_variants_shippingclass',   sql: `CREATE INDEX IF NOT EXISTS idx_variants_shippingclass  ON variants       (shippingclassid)` },
{ name: 'idx_shippingrates_class',      sql: `CREATE INDEX IF NOT EXISTS idx_shippingrates_class      ON shippingrates  (shippingclassid)` },
```

> **Pourquoi deux endroits (SCHEMA + migrations) ?**
> - `SCHEMA` est utilisé quand un Durable Object est créé **pour la première fois** (base vide). Il doit refléter l'état final complet.
> - `migrations` est exécuté sur les Durable Objects **déjà existants** pour appliquer les changements progressivement.
> Les deux doivent rester synchronisés.

---

## Étape 3 — Mettre à jour `schemas.ts`

Ajoute les schémas Zod pour les nouvelles entités et modifie les schémas existants.

```typescript
// In apps/merchant/src/schemas.ts

import { z } from '@hono/zod-openapi';

// ─────────────────────────────────────────────────────────────────────────────
// NEW: ShippingClass schemas
// ─────────────────────────────────────────────────────────────────────────────

// Schema for a shipping class response (read from DB)
export const ShippingClassResponse = z.object({
  id:          z.string().uuid(),
  code:        z.string().min(1).max(50),
  displayname: z.string().min(1),
  description: z.string().nullable(),
  // 'exclusive': hides all other rates when this class is in the cart
  // 'additive':  adds this class's rates on top of universal rates
  resolution:  z.enum(['exclusive', 'additive']),
  status:      z.enum(['active', 'inactive']),
  createdat:   z.string().datetime(),
  updatedat:   z.string().datetime(),
}).openapi('ShippingClass');

// Schema for creating a new shipping class
export const CreateShippingClassBody = z.object({
  code:        z.string().min(1).max(50)
               .regex(/^[a-z0-9_-]+$/, 'Code must be lowercase letters, numbers, hyphens or underscores'),
  displayname: z.string().min(1),
  description: z.string().optional(),
  resolution:  z.enum(['exclusive', 'additive']).default('exclusive'),
}).openapi('CreateShippingClassBody');

// Schema for updating an existing shipping class
export const UpdateShippingClassBody = z.object({
  displayname: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  resolution:  z.enum(['exclusive', 'additive']).optional(),
  status:      z.enum(['active', 'inactive']).optional(),
}).openapi('UpdateShippingClassBody');

// Paginated list response for shipping classes
export const ShippingClassListResponse = z.object({
  items: z.array(ShippingClassResponse),
  pagination: z.object({
    hasmore:    z.boolean(),
    nextcursor: z.string().nullable(),
  }),
}).openapi('ShippingClassListResponse');

// ─────────────────────────────────────────────────────────────────────────────
// MODIFIED: Add shippingclassid to ShippingRateResponse
// ─────────────────────────────────────────────────────────────────────────────
// Find the existing ShippingRateResponse and add this field:
// shippingclassid: z.string().uuid().nullable(),

// Example of the updated shape (add only the new field to the existing object):
// export const ShippingRateResponse = z.object({
//   ...existing fields...
//   shippingclassid: z.string().uuid().nullable(),   // ← NEW
// });

// ─────────────────────────────────────────────────────────────────────────────
// MODIFIED: Add shippingclassid to CreateShippingRateBody and UpdateShippingRateBody
// ─────────────────────────────────────────────────────────────────────────────
// In CreateShippingRateBody, add:
//   shippingclassid: z.string().uuid().nullable().optional(),

// In UpdateShippingRateBody, add:
//   shippingclassid: z.string().uuid().nullable().optional(),

// ─────────────────────────────────────────────────────────────────────────────
// MODIFIED: AvailableShippingRateItem — add shippingclassid for the client
// ─────────────────────────────────────────────────────────────────────────────
// In AvailableShippingRatesResponse items, add:
//   shippingclassid: z.string().uuid().nullable().optional(),
```

---

## Étape 4 — Nouveau fichier `lib/shipping.ts`

Crée ce fichier pour centraliser toute la logique de calcul de livraison.
Cela évite de dupliquer le code dans `checkout.ts` et `regions.ts`.

```typescript
// File: apps/merchant/src/lib/shipping.ts
// Purpose: Centralized shipping calculation helpers.
// These functions are shared between checkout.ts and potentially other routes.

// Type for a resolved shipping rate (returned to the client)
export interface ShippingRateItem {
  id:              string;
  displayname:     string;
  description:     string | null;
  amountcents:     number;
  currency:        string;
  mindeliverydays: number | null;
  maxdeliverydays: number | null;
  maxweightg:      number | null;
  shippingclassid: string | null;
}

// Type alias for the DB query helper — matches what do.ts provides
type DB = { queryany: <T>(sql: string, ...params: unknown[]) => Promise<T[]> };

// ─────────────────────────────────────────────────────────────────────────────
// resolveCartItemClasses
// ─────────────────────────────────────────────────────────────────────────────
// Determines which shipping classes are present in a given cart.
// The variant's class takes priority over the product's class (variant override).
// Returns the set of class IDs and their resolution modes.
export async function resolveCartItemClasses(
  db: DB,
  cartId: string,
): Promise<{
  hasSpecialClass: boolean;
  classIds:        Set<string>;
  hasExclusive:    boolean;
}> {
  // Join cartitems → variants → products → shippingclasses to get effective class per item
  const rows = await db.queryany<{
    effectiveclassid: string | null;
    resolution:       string | null;
  }>(
    `SELECT
       COALESCE(v.shippingclassid, p.shippingclassid) AS effectiveclassid,
       COALESCE(sc_v.resolution, sc_p.resolution)     AS resolution
     FROM cartitems ci
     JOIN variants v       ON v.sku = ci.sku
     JOIN products p       ON p.id  = v.productid
     LEFT JOIN shippingclasses sc_v ON sc_v.id = v.shippingclassid
     LEFT JOIN shippingclasses sc_p ON sc_p.id = p.shippingclassid
     WHERE ci.cartid = ?`,
    cartId,
  );

  const classIds   = new Set<string>();
  let hasExclusive = false;

  for (const row of rows) {
    if (row.effectiveclassid) {
      classIds.add(row.effectiveclassid);
      if (row.resolution === 'exclusive') hasExclusive = true;
    }
  }

  return {
    hasSpecialClass: classIds.size > 0,
    classIds,
    hasExclusive,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeCartWeightG
// ─────────────────────────────────────────────────────────────────────────────
// Computes the total weight of a cart in grams by summing (variant.weightg × qty).
// Returns 0 if no cart items or if variants have no weight set.
export async function computeCartWeightG(db: DB, cartId: string): Promise<number> {
  const result = await db.queryany<{ totalweightg: number }>(
    `SELECT COALESCE(SUM(v.weightg * ci.qty), 0) AS totalweightg
     FROM cartitems ci
     JOIN variants v ON v.sku = ci.sku
     WHERE ci.cartid = ?`,
    cartId,
  );
  return result[0]?.totalweightg ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// getCompatibleShippingRates
// ─────────────────────────────────────────────────────────────────────────────
// Returns the list of shipping rates that are compatible with a given cart.
//
// Filtering logic:
//   1. The rate must belong to the cart's region (via regionshippingrates).
//   2. The rate's maxweightg must be >= the cart's total weight (or be null = no limit).
//   3. Class filtering:
//      - Cart has NO special class → only rates with shippingclassid IS NULL
//      - Cart has EXCLUSIVE class  → only rates that explicitly match one of those class IDs
//      - Cart has ADDITIVE class   → rates matching the class + universal rates (shippingclassid IS NULL)
//
// This replaces the old getCompatibleShippingRates in checkout.ts.
export async function getCompatibleShippingRates(
  db: DB,
  regionid:   string | null,
  cartId:     string,
  currencyid: string | undefined,
): Promise<ShippingRateItem[]> {
  // A cart without a region cannot have shipping rates
  if (!regionid) return [];

  // Step 1: compute cart weight
  const cartWeightG = await computeCartWeightG(db, cartId);

  // Step 2: determine shipping classes in the cart
  const { hasSpecialClass, classIds, hasExclusive } = await resolveCartItemClasses(db, cartId);

  // Step 3: build the WHERE clause for class filtering
  let classFilter: string;
  const classParams: unknown[] = [];

  if (!hasSpecialClass) {
    // Standard cart: only universal rates (no class restriction)
    classFilter = `AND sr.shippingclassid IS NULL`;
  } else if (hasExclusive) {
    // At least one exclusive class: only rates that explicitly match a class in the cart
    const placeholders = Array.from(classIds).map(() => '?').join(', ');
    classFilter = `AND sr.shippingclassid IN (${placeholders})`;
    classParams.push(...Array.from(classIds));
  } else {
    // Only additive classes: show rates matching a class + universal rates
    const placeholders = Array.from(classIds).map(() => '?').join(', ');
    classFilter = `AND (sr.shippingclassid IS NULL OR sr.shippingclassid IN (${placeholders}))`;
    classParams.push(...Array.from(classIds));
  }

  // Step 4: query the database
  // NOTE: parentheses around the maxweightg condition are critical —
  // without them, the OR would break the entire WHERE clause logic.
  const query = `
    SELECT
      sr.id,
      sr.displayname,
      sr.description,
      sr.maxweightg,
      sr.mindeliverydays,
      sr.maxdeliverydays,
      sr.shippingclassid,
      COALESCE(srp.amountcents, 0)  AS amountcents,
      COALESCE(c.code, 'USD')       AS currency
    FROM shippingrates sr
    JOIN regionshippingrates rsr
      ON rsr.shippingrateid = sr.id
    LEFT JOIN shippingrateprices srp
      ON  srp.shippingrateid = sr.id
      AND srp.currencyid     = ?
    LEFT JOIN currencies c
      ON c.id = srp.currencyid
    WHERE sr.status  = 'active'
      AND rsr.regionid = ?
      AND (sr.maxweightg IS NULL OR sr.maxweightg >= ?)
      ${classFilter}
    ORDER BY amountcents ASC
  `;

  const params: unknown[] = [currencyid ?? null, regionid, cartWeightG, ...classParams];
  const rows = await db.queryany<any>(query, ...params);

  return rows.map((r: any) => ({
    id:              r.id,
    displayname:     r.displayname,
    description:     r.description   ?? null,
    amountcents:     r.amountcents,
    currency:        r.currency,
    mindeliverydays: r.mindeliverydays ?? null,
    maxdeliverydays: r.maxdeliverydays ?? null,
    maxweightg:      r.maxweightg      ?? null,
    shippingclassid: r.shippingclassid ?? null,
  }));
}
```

---

## Étape 5 — Mettre à jour `routes/checkout.ts`

C'est la modification la plus importante. Trois zones à changer.

### 5a. Remplacer l'ancienne fonction `getCompatibleShippingRates` inline

Supprime entièrement la fonction `getCompatibleShippingRates` qui existe actuellement dans `checkout.ts`
et remplace-la par un import du nouveau fichier `lib/shipping.ts`.

```typescript
// In checkout.ts — ADD this import at the top of the file
import {
  getCompatibleShippingRates,
  computeCartWeightG,
  resolveCartItemClasses,
} from '../lib/shipping';
```

### 5b. Mettre à jour la route `GET /v1/carts/:cartId/available-shipping-rates`

La route actuelle appelle l'ancienne version de la fonction.
Elle doit maintenant passer `cartId` au lieu de `country` + `cartweightg` séparément.

```typescript
// In checkout.ts — route handler for GET /:cartId/available-shipping-rates
app.openapi(getAvailableShippingRates, async (c) => {
  const { cartId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const cart = await db.queryany<any>(`SELECT * FROM carts WHERE id = ?`, cartId);
  if (!cart) throw ApiError.notFound('Cart not found');
  if (cart.status !== 'open') throw ApiError.conflict('Cart is not open');

  // Resolve the currency for the cart's region
  const currencyId = await getCurrencyIdForRegion(db, cart.regionid);

  // Use the new centralized function — it handles weight + class filtering internally
  const rates = await getCompatibleShippingRates(db, cart.regionid, cartId, currencyId ?? undefined);

  // Also expose cart weight so the client can display it if needed
  const cartWeightG = await computeCartWeightG(db, cartId);

  return c.json({ items: rates, cartweightg: cartWeightG }, 200);
});
```

### 5c. Mettre à jour `PUT /v1/carts/:cartId/shipping-address` (revalidation)

Quand le client change son adresse, le tarif précédemment choisi doit être revalidé
avec le vrai poids du panier (et non `0` comme actuellement).

```typescript
// In checkout.ts — inside the setShippingAddress handler
// After updating the shipping address fields in the DB, revalidate the selected rate:

if (cart.shippingrateid) {
  // Revalidate using the REAL cart weight and the new class filtering logic
  const currencyId = await getCurrencyIdForRegion(db, cart.regionid);
  const compatibleRates = await getCompatibleShippingRates(
    db,
    cart.regionid,
    cartId,
    currencyId ?? undefined,
  );

  const stillValid = compatibleRates.some((r) => r.id === cart.shippingrateid);

  if (!stillValid) {
    // The previously selected rate is no longer valid for the new address/weight/class
    await db.run(
      `UPDATE carts SET shippingrateid = NULL, shippingcents = 0, updatedat = ? WHERE id = ?`,
      now(),
      cartId,
    );
  }
}
```

### 5d. Corriger `POST /v1/carts/:cartId/checkout` — intégration Stripe complète

C'est le cœur du changement. Voici la logique complète à remplacer dans `checkoutCart`.

```typescript
// In checkout.ts — inside the checkoutCart handler

// ─── STEP 1: Guard — require a shipping address if collection is enabled ─────
// Prevents opening a Stripe session without an address when collectshipping = true.
if (body.collectshipping && !cart.shippingcountry) {
  await revertCartStatus(); // reset cart status back to 'open'
  throw ApiError.invalidRequest(
    'A shipping address must be set on the cart before starting checkout. ' +
    'Call PUT /v1/carts/:cartId/shipping-address first.',
  );
}

// ─── STEP 2: Build real Stripe shipping_options from the database ─────────────
// Replace the old hardcoded defaultShippingOptions block entirely.

let stripeShippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [];

if (body.collectshipping) {
  const currencyId = await getCurrencyIdForRegion(db, cart.regionid);

  // Get rates that are compatible with the current cart (weight + class)
  const compatibleRates = await getCompatibleShippingRates(
    db,
    cart.regionid,
    cartId,
    currencyId ?? undefined,
  );

  if (compatibleRates.length === 0) {
    // No compatible rate found — we cannot continue
    await revertCartStatus();
    throw ApiError.invalidRequest(
      'No shipping option is available for the products in this cart. ' +
      'Please check that shipping rates are configured for this region and product type.',
    );
  }

  // If the customer already selected a rate in the cart UI, use only that rate.
  // This creates a consistent experience: what the customer chose is what Stripe shows.
  const selectedRate = cart.shippingrateid
    ? compatibleRates.find((r) => r.id === cart.shippingrateid)
    : null;

  const ratesToOffer = selectedRate ? [selectedRate] : compatibleRates;

  // Convert our internal rate objects to Stripe's shipping_option format
  stripeShippingOptions = ratesToOffer.map((rate) => {
    const option: Stripe.Checkout.SessionCreateParams.ShippingOption = {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount:   rate.amountcents,
          currency: cart.currency.toLowerCase(),
        },
        display_name: rate.displayname,
        // Store our internal rate ID in Stripe metadata so the webhook can reconcile
        metadata: {
          merchant_shippingrateid: rate.id,
        },
      },
    };

    // Add delivery estimate if we have the data
    if (rate.mindeliverydays && rate.maxdeliverydays) {
      (option.shipping_rate_data as any).delivery_estimate = {
        minimum: { unit: 'business_day', value: rate.mindeliverydays },
        maximum: { unit: 'business_day', value: rate.maxdeliverydays },
      };
    }

    return option;
  });
}

// ─── STEP 3: Build line items WITHOUT a separate shipping line item ────────────
// IMPORTANT: do NOT add shipping as a line item when using Stripe shipping_options.
// Stripe already handles shipping costs via shipping_options.
// Adding it as both a line item AND a shipping_option would charge the customer twice.

const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => ({
  price_data: {
    currency:     cart.currency.toLowerCase(),
    product_data: { name: item.title },
    unit_amount:  item.unitpricecents,
  },
  quantity: item.qty,
}));

// Add discount as a negative line item if applicable (keep existing logic)
if (discountAmountCents > 0) {
  lineItems.push({
    price_data: {
      currency:     cart.currency.toLowerCase(),
      product_data: { name: `Discount (${cart.discountcode})` },
      unit_amount:  -discountAmountCents,
    },
    quantity: 1,
  });
}

// ─── STEP 4: Create the Stripe session ────────────────────────────────────────

const sessionParams: Stripe.Checkout.SessionCreateParams = {
  payment_method_types: ['card'],
  line_items:           lineItems,
  mode:                 'payment',
  success_url:          `${body.successurl}?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url:           body.cancelurl,
  customer_email:       cart.customeremail,
  metadata: {
    cartid:  cartId,
    orderid: orderId,
  },
};

// Only add shipping options if collection is enabled
if (body.collectshipping && stripeShippingOptions.length > 0) {
  sessionParams.shipping_options = stripeShippingOptions;
  // Ask Stripe to collect a shipping address if we don't have one yet
  if (!cart.shippingcountry) {
    sessionParams.shipping_address_collection = {
      allowed_countries: ['FR', 'DE', 'BE', 'ES', 'IT', 'GB', 'US', 'CA'],
    };
  }
}

const session = await stripe.checkout.sessions.create(sessionParams);
```

### 5e. Mettre à jour le webhook Stripe (`routes/webhooks.ts`)

Quand Stripe confirme le paiement, il faut récupérer le vrai tarif sélectionné par le client
et mettre à jour la commande avec les frais de port réels.

```typescript
// In routes/webhooks.ts — inside the checkout.session.completed handler
// After creating the order, reconcile shipping from Stripe session data:

// session.total_details.amount_shipping contains the actual shipping amount charged
const stripeShippingCents = session.total_details?.amount_shipping ?? 0;

// Retrieve the merchant shipping rate ID from Stripe's metadata
// Stripe stores it in the selected shipping rate's metadata
let merchantShippingRateId: string | null = null;
if (session.shipping_rate) {
  // Expand the shipping rate to access its metadata
  const stripeRate = await stripe.shippingRates.retrieve(session.shipping_rate as string);
  merchantShippingRateId = stripeRate.metadata?.merchant_shippingrateid ?? null;
}

// Update the order with the actual shipping information from Stripe
await db.run(
  `UPDATE orders
   SET shippingcents   = ?,
       shippingrateid  = ?,
       totalcents      = subtotalcents + ? + taxcents - discountamountcents
   WHERE id = ?`,
  stripeShippingCents,
  merchantShippingRateId,
  stripeShippingCents,
  orderId,
);
```

---

## Étape 6 — Mettre à jour `routes/regions.ts` (CRUD shippingclasses)

Ajoute les routes CRUD pour gérer les classes d'expédition depuis l'interface admin.
Ces routes suivent exactement le même pattern que les autres entités de `regions.ts`.

```typescript
// In apps/merchant/src/routes/regions.ts
// Add after the existing shipping rates section

// ─────────────────────────────────────────────────────────────────────────────
// SHIPPING CLASSES CRUD
// Admin-only routes for managing product shipping classes.
// ─────────────────────────────────────────────────────────────────────────────

// --- GET /v1/regions/shipping-classes (list) ---

const listShippingClasses = createRoute({
  method: 'get',
  path:   '/shipping-classes',
  tags:   ['Regions - Shipping Classes'],
  summary: 'List all shipping classes',
  security: [{ bearerAuth: [] }, { 'legacy sk': [] }, { adminstore: [] }],
  middleware: [adminOnly] as const,
  request: { query: PaginationQuery },
  responses: {
    200: {
      content: { 'application/json': { schema: ShippingClassListResponse } },
      description: 'List of shipping classes',
    },
  },
});

app.openapi(listShippingClasses, async (c) => {
  const { limit: limitStr, cursor } = c.req.valid('query');
  const limit = Math.min(parseInt(limitStr ?? '20'), 100);
  const db = getDb(c.var.db);

  let query  = `SELECT * FROM shippingclasses WHERE status = 'active'`;
  const params: unknown[] = [];

  if (cursor) { query += ` AND createdat > ?`; params.push(cursor); }
  query += ` ORDER BY createdat DESC LIMIT ?`;
  params.push(limit + 1);

  const rows = await db.queryany<any>(query, ...params);
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  return c.json({
    items: rows,
    pagination: {
      hasmore:    hasMore,
      nextcursor: hasMore && rows.length > 0 ? rows[rows.length - 1].createdat : null,
    },
  }, 200);
});

// --- POST /v1/regions/shipping-classes (create) ---

const createShippingClass = createRoute({
  method: 'post',
  path:   '/shipping-classes',
  tags:   ['Regions - Shipping Classes'],
  summary: 'Create a shipping class',
  security: [{ bearerAuth: [] }, { 'legacy sk': [] }, { adminstore: [] }],
  middleware: [adminOnly] as const,
  request: {
    body: { content: { 'application/json': { schema: CreateShippingClassBody } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: ShippingClassResponse } },
      description: 'Shipping class created',
    },
    409: {
      content: { 'application/json': { schema: ErrorResponse } },
      description: 'Code already exists',
    },
  },
});

app.openapi(createShippingClass, async (c) => {
  const { code, displayname, description, resolution } = c.req.valid('json');
  const db = getDb(c.var.db);

  // Ensure the code is unique
  const existing = await db.queryany<any>(`SELECT id FROM shippingclasses WHERE code = ?`, code);
  if (existing) throw ApiError.conflict(`Shipping class code '${code}' already exists`);

  const id        = uuid();
  const timestamp = now();

  await db.run(
    `INSERT INTO shippingclasses (id, code, displayname, description, resolution, createdat, updatedat)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, code, displayname, description ?? null, resolution ?? 'exclusive', timestamp, timestamp,
  );

  return c.json(
    await db.queryany<any>(`SELECT * FROM shippingclasses WHERE id = ?`, id),
    201,
  );
});

// --- PATCH /v1/regions/shipping-classes/:id (update) ---
// --- DELETE /v1/regions/shipping-classes/:id (delete) ---
// (Follow the exact same pattern as the existing updateShippingRate / deleteShippingRate above)
```

### Modifier aussi `createShippingRate` et `updateShippingRate`

Dans les routes existantes pour créer/modifier un tarif, ajoute le support de `shippingclassid` :

```typescript
// In the createShippingRate handler, add to the INSERT:
// shippingclassid = body.shippingclassid ?? null

// In the updateShippingRate handler, add:
// if (body.shippingclassid !== undefined) {
//   updates.push('shippingclassid = ?');
//   params.push(body.shippingclassid);
// }
```

---

## Étape 7 — Mettre à jour `routes/catalog.ts`

Expose le `shippingclassid` dans les réponses produit/variante et permets de le modifier.

```typescript
// In catalog.ts — product response, add to the returned object:
// shippingclassid: product.shippingclassid ?? null,

// In the updateProduct handler, add:
// if (body.shippingclassid !== undefined) {
//   updates.push('shippingclassid = ?');
//   params.push(body.shippingclassid);  // can be null to reset
// }

// Same pattern for updateVariant — allows overriding the product's class per variant.
```

---

## Étape 8 — Mettre à jour `lib/store-api.ts` (client)

Ajoute les fonctions pour appeler les nouvelles routes depuis le frontend.

```typescript
// In apps/client/src/lib/store-api.ts

// ─── Shipping Classes ─────────────────────────────────────────────────────────

export interface ShippingClass {
  id:          string;
  code:        string;
  displayname: string;
  description: string | null;
  resolution:  'exclusive' | 'additive';
  status:      'active' | 'inactive';
  createdat:   string;
  updatedat:   string;
}

// List all active shipping classes (used in product/variant forms and shipping rate forms)
export async function getShippingClasses(): Promise<PaginationResponse<ShippingClass>> {
  return request<PaginationResponse<ShippingClass>>(
    'v1/regions/shipping-classes?limit=100',
  );
}

export async function createShippingClass(
  data: { code: string; displayname: string; description?: string; resolution?: 'exclusive' | 'additive' },
): Promise<ShippingClass> {
  return request<ShippingClass>('v1/regions/shipping-classes', {
    method: 'POST',
    body:   JSON.stringify(data),
  });
}

export async function updateShippingClass(
  id:   string,
  data: Partial<Pick<ShippingClass, 'displayname' | 'description' | 'resolution' | 'status'>>,
): Promise<ShippingClass> {
  return request<ShippingClass>(`v1/regions/shipping-classes/${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(data),
  });
}

export async function deleteShippingClass(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`v1/regions/shipping-classes/${id}`, {
    method: 'DELETE',
  });
}
```

---

## Étape 9 — Nouvelle page admin `shipping-classes.tsx`

Cette page suit **exactement le même pattern** que `regions.tsx` ou `shipping-rates.tsx` existants.
Copie l'un de ces fichiers et adapte-le.

```tsx
// File: apps/client/src/pages/admin/shipping-classes.tsx
// Pattern: identical to regions.tsx — copy and adapt

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button }  from '@heroui/button';
import { Input }   from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/table';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
} from '@heroui/modal';
import { Card, CardBody } from '@heroui/card';
import { Tooltip }   from '@heroui/tooltip';
import { Badge }     from '@heroui/badge';
import { Plus, Edit2, Trash2, Package } from 'lucide-react';
import { SearchIcon } from '@/components/icons';
import DefaultLayout  from '@/layouts/default';
import { useSecuredApi } from '@/authentication';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShippingClass {
  id:          string;
  code:        string;
  displayname: string;
  description: string | null;
  resolution:  'exclusive' | 'additive';
  status:      'active' | 'inactive';
  createdat:   string;
  updatedat:   string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['active', 'inactive'] as const;
const RESOLUTION_OPTIONS = ['exclusive', 'additive'] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export default function ShippingClassesPage() {
  const { t }    = useTranslation();
  const { getJson, postJson, patchJson, deleteJson } = useSecuredApi();
  const apiBase  = (import.meta as any).env?.APIBASEURL ?? '';

  // List state
  const [classes,       setClasses]       = useState<ShippingClass[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [globalFilter,  setGlobalFilter]  = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [isEditMode,    setIsEditMode]   = useState(false);
  const [editingClass,  setEditingClass] = useState<ShippingClass | null>(null);
  const [formData, setFormData] = useState({
    code:        '',
    displayname: '',
    description: '',
    resolution:  'exclusive' as 'exclusive' | 'additive',
    status:      'active'    as 'active' | 'inactive',
  });

  // ─── Load data ─────────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const resp = await getJson(`${apiBase}/v1/regions/shipping-classes?limit=100`);
      setClasses(resp.items ?? []);
    } catch (err) {
      console.error('Failed to load shipping classes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ─── Filtered list ─────────────────────────────────────────────────────────

  const displayed = useMemo(() => {
    let filtered = classes;
    if (statusFilter) filtered = filtered.filter((c) => c.status === statusFilter);
    const term = globalFilter.trim().toLowerCase();
    if (term) filtered = filtered.filter(
      (c) => c.displayname.toLowerCase().includes(term) || c.code.toLowerCase().includes(term),
    );
    return filtered;
  }, [classes, statusFilter, globalFilter]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingClass(null);
    setFormData({ code: '', displayname: '', description: '', resolution: 'exclusive', status: 'active' });
    onOpen();
  };

  const handleOpenEdit = (cls: ShippingClass) => {
    setIsEditMode(true);
    setEditingClass(cls);
    setFormData({
      code:        cls.code,
      displayname: cls.displayname,
      description: cls.description ?? '',
      resolution:  cls.resolution,
      status:      cls.status,
    });
    onOpen();
  };

  const handleSave = async () => {
    try {
      if (isEditMode && editingClass) {
        const updated = await patchJson(
          `${apiBase}/v1/regions/shipping-classes/${editingClass.id}`,
          { displayname: formData.displayname, description: formData.description || null,
            resolution: formData.resolution, status: formData.status },
        );
        if (updated) setClasses((prev) => prev.map((c) => c.id === editingClass.id ? updated : c));
        else await loadData();
      } else {
        const created = await postJson(
          `${apiBase}/v1/regions/shipping-classes`,
          { code: formData.code, displayname: formData.displayname,
            description: formData.description || null, resolution: formData.resolution },
        );
        if (created) setClasses((prev) => [...prev, created]);
        else await loadData();
      }
      onOpenChange();
    } catch (err) {
      console.error('Failed to save shipping class', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette classe d\'expédition ?')) return;
    try {
      await deleteJson(`${apiBase}/v1/regions/shipping-classes/${id}`);
      await loadData();
    } catch (err) {
      console.error('Failed to delete shipping class', err);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <DefaultLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Classes d'expédition</h1>
              <p className="text-sm text-default-500 mt-1">
                Définissez les contraintes de transport pour vos produits (hors-gabarit, fragile, fret…)
              </p>
            </div>
          </div>
          <Button color="primary" endContent={<Plus className="w-4 h-4" />} onPress={handleOpenCreate}>
            Nouvelle classe
          </Button>
        </div>

        {/* Info banner explaining resolution modes */}
        <Card className="mb-6 border-l-4 border-blue-400">
          <CardBody className="py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold text-orange-600">Mode exclusif</span>
                <p className="text-default-500 mt-1">
                  Si un produit de cette classe est dans le panier, seuls les tarifs de cette classe sont proposés.
                  Exemple : canapé → fret uniquement.
                </p>
              </div>
              <div>
                <span className="font-semibold text-green-600">Mode additif</span>
                <p className="text-default-500 mt-1">
                  Les tarifs de cette classe s'ajoutent aux tarifs standards.
                  Exemple : batterie Li-Ion → supplément matières dangereuses.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Filters */}
        <Card className="mb-6">
          <CardBody className="flex gap-4">
            <Input
              isClearable
              className="w-full"
              placeholder="Rechercher par nom ou code…"
              startContent={<SearchIcon className="w-4 h-4" />}
              value={globalFilter}
              onValueChange={setGlobalFilter}
            />
            <Select
              label="Statut"
              selectedKeys={statusFilter ? [statusFilter] : []}
              onSelectionChange={(key) => setStatusFilter(Array.from(key).join(''))}
            >
              <SelectItem key="">Tous</SelectItem>
              <SelectItem key="active">Actif</SelectItem>
              <SelectItem key="inactive">Inactif</SelectItem>
            </Select>
          </CardBody>
        </Card>

        {/* Table */}
        <Card>
          <CardBody>
            <Table isStriped>
              <TableHeader>
                <TableColumn key="code">Code</TableColumn>
                <TableColumn key="displayname">Nom</TableColumn>
                <TableColumn key="resolution">Mode</TableColumn>
                <TableColumn key="description">Description</TableColumn>
                <TableColumn key="status">Statut</TableColumn>
                <TableColumn key="actions">Actions</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={<div>Aucune classe d'expédition configurée</div>}
                isLoading={loading}
                items={displayed}
                loadingContent={<div>Chargement…</div>}
              >
                {(cls) => (
                  <TableRow key={cls.id}>
                    <TableCell>
                      <code className="text-xs bg-default-100 px-2 py-0.5 rounded">{cls.code}</code>
                    </TableCell>
                    <TableCell className="font-medium">{cls.displayname}</TableCell>
                    <TableCell>
                      {/* Visual badge to make the resolution mode immediately obvious */}
                      {cls.resolution === 'exclusive' ? (
                        <Badge color="warning" variant="flat">Exclusif</Badge>
                      ) : (
                        <Badge color="success" variant="flat">Additif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-default-500 text-sm">
                      {cls.description ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span className={cls.status === 'active' ? 'text-green-600' : 'text-gray-400'}>
                        {cls.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Tooltip content="Modifier">
                          <Button isIconOnly size="sm" variant="light" onPress={() => handleOpenEdit(cls)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Supprimer" color="danger">
                          <Button isIconOnly color="danger" size="sm" variant="light"
                            onPress={() => handleDelete(cls.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        {/* Create / Edit Modal */}
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
          <ModalContent>
            <ModalHeader>
              {isEditMode ? 'Modifier la classe' : 'Nouvelle classe d\'expédition'}
            </ModalHeader>
            <ModalBody className="gap-4">
              {/* Code — only editable on creation */}
              <Tooltip content="Identifiant unique en minuscules (ex: oversized, freight, fragile)">
                <Input
                  isRequired
                  isDisabled={isEditMode} // Code cannot be changed after creation
                  label="Code"
                  placeholder="ex: freight"
                  value={formData.code}
                  onValueChange={(v) => setFormData({ ...formData, code: v.toLowerCase() })}
                />
              </Tooltip>
              <Input
                isRequired
                label="Nom affiché"
                placeholder="ex: Hors-gabarit / Fret"
                value={formData.displayname}
                onValueChange={(v) => setFormData({ ...formData, displayname: v })}
              />
              <Input
                label="Description (optionnel)"
                placeholder="ex: Pour les colis > 30 kg ou palette obligatoire"
                value={formData.description}
                onValueChange={(v) => setFormData({ ...formData, description: v })}
              />
              <Select
                isRequired
                label="Mode de résolution"
                description={
                  formData.resolution === 'exclusive'
                    ? '⚠ Exclusif : masque tous les autres tarifs quand ce produit est dans le panier'
                    : '✓ Additif : ajoute ces tarifs en complément des tarifs standards'
                }
                selectedKeys={[formData.resolution]}
                onSelectionChange={(key) =>
                  setFormData({ ...formData, resolution: Array.from(key).join('') as any })
                }
              >
                <SelectItem key="exclusive">Exclusif — remplace les autres tarifs</SelectItem>
                <SelectItem key="additive">Additif — s'ajoute aux autres tarifs</SelectItem>
              </Select>
              {isEditMode && (
                <Select
                  label="Statut"
                  selectedKeys={[formData.status]}
                  onSelectionChange={(key) =>
                    setFormData({ ...formData, status: Array.from(key).join('') as any })
                  }
                >
                  <SelectItem key="active">Actif</SelectItem>
                  <SelectItem key="inactive">Inactif</SelectItem>
                </Select>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="light" onPress={onOpenChange}>Annuler</Button>
              <Button
                color="primary"
                isDisabled={!formData.code || !formData.displayname}
                onPress={handleSave}
              >
                Enregistrer
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
```

---

## Étape 10 — Ajouter le sélecteur de classe dans les formulaires produit/variante

Dans la page admin des produits (`pages/admin/products.tsx`), ajoute un sélecteur de classe.

```tsx
// In apps/client/src/pages/admin/products.tsx
// Inside the product form modal, add after the status selector:

// Load shipping classes when the modal opens
const [shippingClasses, setShippingClasses] = useState<ShippingClass[]>([]);

useEffect(() => {
  // Load available shipping classes for the selector
  getJson(`${apiBase}/v1/regions/shipping-classes?limit=100`)
    .then((resp) => setShippingClasses(resp.items ?? []))
    .catch(() => {});
}, []);

// In the modal JSX — add this Select after the status field:
<Select
  label="Classe d'expédition (optionnel)"
  description="Laissez vide pour un produit standard"
  selectedKeys={formData.shippingclassid ? [formData.shippingclassid] : []}
  onSelectionChange={(key) => {
    const val = Array.from(key).join('');
    setFormData({ ...formData, shippingclassid: val || null });
  }}
>
  {/* Empty option to unset the class */}
  <SelectItem key="">Standard (aucune contrainte)</SelectItem>
  {shippingClasses.map((cls) => (
    <SelectItem key={cls.id} textValue={cls.displayname}>
      <div className="flex items-center gap-2">
        <Badge
          color={cls.resolution === 'exclusive' ? 'warning' : 'success'}
          size="sm"
          variant="flat"
        >
          {cls.resolution === 'exclusive' ? 'EX' : 'AD'}
        </Badge>
        {cls.displayname}
        {cls.description && (
          <span className="text-xs text-default-400">— {cls.description}</span>
        )}
      </div>
    </SelectItem>
  ))}
</Select>
```

### Même chose dans le formulaire de tarif d'expédition (`shipping-rates.tsx`)

```tsx
// In apps/client/src/pages/admin/shipping-rates.tsx
// In the modal form, add after the maxweightg field:

<Select
  label="Classe d'expédition (optionnel)"
  description="Laissez vide pour un tarif universel (tous les produits standards)"
  selectedKeys={formData.shippingclassid ? [formData.shippingclassid] : []}
  onSelectionChange={(key) => {
    const val = Array.from(key).join('');
    setFormData({ ...formData, shippingclassid: val || null });
  }}
>
  <SelectItem key="">Universel — tous produits standards</SelectItem>
  {shippingClasses.map((cls) => (
    <SelectItem key={cls.id}>
      {cls.displayname} ({cls.resolution === 'exclusive' ? 'exclusif' : 'additif'})
    </SelectItem>
  ))}
</Select>
```

---

## Étape 11 — Ajouter la route dans `App.tsx`

```tsx
// In apps/client/src/App.tsx

import ShippingClassesPage from './pages/admin/shipping-classes';

// Inside the <Routes> component, add alongside the other admin routes:
<Route
  element={
    <AuthenticationGuardWithPermission
      permission={import.meta.env.ADMINSTOREPERMISSION}
    >
      <ShippingClassesPage />
    </AuthenticationGuardWithPermission>
  }
  path="/admin/shipping-classes"
/>
```

### Ajouter le lien dans la navigation admin

Dans le composant `Navbar` ou le menu de navigation admin, ajoute le lien vers la nouvelle page :

```tsx
// In the admin navigation menu (usually navbar.tsx or a sidebar component):
{hasPermission(adminStorePermission) && (
  <NavItem href="/admin/shipping-classes" icon={<Package />}>
    Classes d'expédition
  </NavItem>
)}
```

---

## Étape 12 — Vérification et tests

### Check-list backend

```bash
# 1. Apply the migration to local D1
npx wrangler d1 execute merchant --local --file migrations/018-add-shipping-classes.sql

# 2. Verify the new table exists
npx wrangler d1 execute merchant --local --command "SELECT * FROM shippingclasses"

# 3. Test create a shipping class
curl -X POST http://localhost:8787/v1/regions/shipping-classes \
  -H "Authorization: Bearer sk-your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"code":"freight","displayname":"Fret / Palettisé","resolution":"exclusive"}'

# 4. Assign the class to a product
curl -X PATCH http://localhost:8787/v1/products/PRODUCT_ID \
  -H "Authorization: Bearer sk-your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"shippingclassid":"CLASS_UUID"}'

# 5. Create a shipping rate for this class
curl -X POST http://localhost:8787/v1/regions/shipping-rates \
  -H "Authorization: Bearer sk-your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"displayname":"Fret Standard","shippingclassid":"CLASS_UUID","mindeliverydays":5,"maxdeliverydays":10}'

# 6. Test available rates — cart with the special product
curl http://localhost:8787/v1/carts/CART_ID/available-shipping-rates \
  -H "Authorization: Bearer pk-your-public-key"
# Expected: only freight rates, no standard Colissimo/DHL rates
```

### Scénarios de test à couvrir

| Scénario | Résultat attendu |
|---|---|
| Panier avec uniquement des produits sans classe | Tarifs universels (shippingclassid IS NULL) |
| Panier avec un produit de classe `exclusive` | Uniquement les tarifs de cette classe |
| Panier mixte (standard + exclusive) | Uniquement les tarifs de la classe exclusive |
| Panier avec un produit de classe `additive` | Tarifs universels + tarifs de la classe additive |
| Panier lourd dépassant `maxweightg` d'un tarif | Ce tarif n'apparaît pas |
| Changement d'adresse avec tarif déjà choisi | Tarif invalidé si plus compatible |
| Checkout Stripe sans adresse + collectshipping=true | Erreur 400 claire |
| Checkout Stripe — session créée | `shipping_options` contient les vrais tarifs DB |
| Webhook Stripe `checkout.session.completed` | `orders.shippingcents` = montant réel Stripe |

---

## Résumé des fichiers modifiés

| Fichier | Type | Modification |
|---|---|---|
| `migrations/018-add-shipping-classes.sql` | **NOUVEAU** | Table + colonnes |
| `src/do.ts` | **MODIFIER** | SCHEMA + migrations inline |
| `src/schemas.ts` | **MODIFIER** | Nouveaux schémas Zod |
| `src/lib/shipping.ts` | **NOUVEAU** | Fonctions utilitaires |
| `src/routes/checkout.ts` | **MODIFIER** | Logique filtrage + Stripe |
| `src/routes/regions.ts` | **MODIFIER** | CRUD shippingclasses |
| `src/routes/catalog.ts` | **MODIFIER** | shippingclassid sur produits/variantes |
| `src/routes/webhooks.ts` | **MODIFIER** | Réconciliation Stripe shipping |
| `apps/client/src/lib/store-api.ts` | **MODIFIER** | Nouvelles fonctions API |
| `apps/client/src/pages/admin/shipping-classes.tsx` | **NOUVEAU** | Page admin |
| `apps/client/src/pages/admin/products.tsx` | **MODIFIER** | Sélecteur de classe |
| `apps/client/src/pages/admin/shipping-rates.tsx` | **MODIFIER** | Sélecteur de classe |
| `apps/client/src/App.tsx` | **MODIFIER** | Nouvelle route |
