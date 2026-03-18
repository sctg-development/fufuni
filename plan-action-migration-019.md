# Plan d'action — Migration 019 : Enrichissement des variantes produit

> **Public cible :** développeur junior connaissant TypeScript et React  
> **Projet :** Fufuni — backend Cloudflare Workers + frontend React/HeroUI  
> **Date :** Mars 2026  
> **Branche suggérée :** `feat/variant-enrichment`

---

## Table des matières

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Vue d'ensemble des changements](#2-vue-densemble-des-changements)
3. [Étape 1 — Migration base de données](#3-étape-1--migration-base-de-données)
   - [3.1 Fichier SQL standalone](#31-fichier-sql-standalone)
   - [3.2 Mise à jour du SCHEMA inline (do.ts)](#32-mise-à-jour-du-schema-inline-dots)
   - [3.3 Mise à jour de ensureInitialized()](#33-mise-à-jour-de-ensureinitialized)
4. [Étape 2 — Backend : schémas Zod (schemas.ts)](#4-étape-2--backend--schémas-zod-schemasts)
5. [Étape 3 — Backend : routes catalogue (catalog.ts)](#5-étape-3--backend--routes-catalogue-catalogts)
6. [Étape 4 — Backend : calcul du poids (lib/shipping.ts)](#6-étape-4--backend--calcul-du-poids-libshippingts)
7. [Étape 5 — Backend : checkout Stripe (checkout.ts)](#7-étape-5--backend--checkout-stripe-checkoutts)
8. [Étape 6 — Frontend : types API (store-api.ts)](#8-étape-6--frontend--types-api-store-apits)
9. [Étape 7 — Frontend : formulaire variant (admin/products.tsx)](#9-étape-7--frontend--formulaire-variant-adminproductstsx)
10. [Étape 8 — Mise à jour README.md](#10-étape-8--mise-à-jour-readmemd)
11. [Checklist de validation](#11-checklist-de-validation)
12. [Ordre d'exécution recommandé](#12-ordre-dexécution-recommandé)

---

## 1. Contexte et objectifs

### Problème actuel

Le champ `weightg` (poids en grammes) existe dans la table `variants` de la base de données,
mais il est **absent des schémas Zod et des handlers API**. Résultat : lors de la création ou
la mise à jour d'une variante, le poids est toujours inséré à `0`.

La fonction `computeCartWeightG()` calcule le poids total du panier en faisant
`SUM(variant.weightg × quantité)`. Avec tous les poids à 0, le résultat est toujours 0 g,
et seuls les tarifs de livraison sans limite de poids sont retournés.

### Ce que ce plan ajoute

| Champ | Table | Priorité | Description |
|---|---|---|---|
| `weightg` | `variants` | 🔴 Bloquant | Poids en grammes — déjà en DB, manque dans l'API |
| `requiresshipping` | `variants` | 🔴 Bloquant | `false` pour les produits numériques/virtuels |
| `dimscm` | `variants` | 🟠 Haute | Dimensions L×W×H en cm (déjà en DB en JSON brut) |
| `compareatpricecents` | `variants` | 🟡 Moyenne | Prix barré (prix avant promo) |
| `barcode` | `variants` | 🟡 Moyenne | Code-barres EAN-13, UPC-A, GTIN |
| `taxcode` | `variants` | 🟡 Moyenne | Code fiscal Stripe Tax (ex: `txcd_99999999`) |
| `vendor` | `products` | 🟡 Moyenne | Marque / fabricant |
| `tags` | `products` | 🟡 Moyenne | Tableau de mots-clés JSON pour le filtrage |
| `handle` | `products` | 🟡 Moyenne | Slug URL-friendly pour le SEO |

---

## 2. Vue d'ensemble des changements

```
apps/
├── merchant/
│   ├── migrations/
│   │   └── 019-variant-enrichment.sql        ← NOUVEAU fichier SQL
│   └── src/
│       ├── do.ts                             ← Modifier SCHEMA + ensureInitialized()
│       ├── schemas.ts                        ← Modifier CreateVariantBody + UpdateVariantBody
│       │                                        + Modifier VariantResponse
│       │                                        + Modifier CreateProductBody + UpdateProductBody
│       │                                        + Modifier ProductResponse
│       ├── routes/
│       │   ├── catalog.ts                    ← Modifier createVariant, updateVariant
│       │   │                                    + Modifier getProduct, listProducts
│       │   │                                    + Modifier createProduct, updateProduct
│       │   └── checkout.ts                   ← Modifier taxcode dans Stripe line_items
│       └── lib/
│           └── shipping.ts                   ← Modifier computeCartWeightG()
└── client/
    └── src/
        ├── lib/
        │   └── store-api.ts                  ← Modifier types Variant + Product
        └── pages/admin/
            └── products.tsx                  ← Modifier formulaire d'ajout/édition variante
                                                 + Modifier formulaire produit
```

---

## 3. Étape 1 — Migration base de données

### 3.1 Fichier SQL standalone

Créer le fichier `apps/merchant/migrations/019-variant-enrichment.sql` :

```sql
-- =============================================================================
-- Migration 019: Variant and product enrichment
-- Adds shipping-critical fields (requiresshipping) and common e-commerce fields
-- (barcode, compare-at price, tax code, vendor, tags, SEO handle).
--
-- NOTE: weightg and dimscm already exist in the variants table.
--       This migration only adds the missing columns.
--
-- Run locally:
--   npx wrangler d1 execute merchant --local --file migrations/019-variant-enrichment.sql
-- Run remotely:
--   npx wrangler d1 execute merchant --remote --file migrations/019-variant-enrichment.sql
-- =============================================================================

-- -------------------------------------------------------------------------
-- VARIANTS TABLE — new columns
-- -------------------------------------------------------------------------

-- requiresshipping: set to 0 for digital/downloadable/virtual products.
-- When false, the variant is excluded from cart weight calculation.
-- Default 1 (true) = physical product that needs shipping.
ALTER TABLE variants ADD COLUMN requiresshipping INTEGER NOT NULL DEFAULT 1;

-- barcode: EAN-13, UPC-A, ISBN-13 or any GTIN format.
-- Used for warehouse scanning and marketplace exports.
ALTER TABLE variants ADD COLUMN barcode TEXT;

-- compareatpricecents: the "before sale" price displayed crossed-out in the storefront.
-- Must be greater than pricecents to make sense, but this is NOT enforced at DB level —
-- validation is done in the API layer (schemas.ts).
ALTER TABLE variants ADD COLUMN compareatpricecents INTEGER;

-- taxcode: Stripe Tax product tax code (e.g. 'txcd_99999999' for general physical goods,
-- 'txcd_10000000' for digital services).
-- See https://stripe.com/docs/tax/tax-categories
ALTER TABLE variants ADD COLUMN taxcode TEXT;

-- -------------------------------------------------------------------------
-- PRODUCTS TABLE — new columns
-- -------------------------------------------------------------------------

-- vendor: brand or manufacturer name (e.g. "Nike", "Apple", "Acme Corp").
-- Used for catalog filtering and display.
ALTER TABLE products ADD COLUMN vendor TEXT;

-- tags: JSON array of keyword strings for catalog search and filtering.
-- Example: '["cotton","summer","new-arrival"]'
ALTER TABLE products ADD COLUMN tags TEXT;

-- handle: URL-friendly slug for SEO-friendly product pages.
-- Example: "classic-cotton-t-shirt"
-- Must be unique — two products cannot share the same handle.
ALTER TABLE products ADD COLUMN handle TEXT UNIQUE;

-- -------------------------------------------------------------------------
-- INDEXES — improve query performance on new columns
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_variants_requiresshipping
  ON variants(requiresshipping);

CREATE INDEX IF NOT EXISTS idx_variants_barcode
  ON variants(barcode);

CREATE INDEX IF NOT EXISTS idx_products_vendor
  ON products(vendor);

-- Partial index: only index products that have a handle set (saves space)
CREATE INDEX IF NOT EXISTS idx_products_handle
  ON products(handle)
  WHERE handle IS NOT NULL;
```

---

### 3.2 Mise à jour du SCHEMA inline (do.ts)

Dans `apps/merchant/src/do.ts`, le `SCHEMA` déclare la structure complète des tables.
Il faut ajouter les nouvelles colonnes pour que les environnements créés **from scratch**
(ex: nouveau déploiement, reset DB) aient d'emblée la bonne structure.

**Trouver le bloc :**
```typescript
// Dans do.ts — chercher cette ligne
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  productid TEXT NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  pricecents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  weightg INTEGER NOT NULL,
  dimscm TEXT,
  imageurl TEXT,
  shippingclassid TEXT REFERENCES shippingclasses(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft')),
  createdat TEXT NOT NULL DEFAULT datetime('now')
```

**Remplacer par :**
```typescript
// Updated variants table — adds requiresshipping, barcode, compareatpricecents, taxcode
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  productid TEXT NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  pricecents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  weightg INTEGER NOT NULL DEFAULT 0,
  dimscm TEXT,
  requiresshipping INTEGER NOT NULL DEFAULT 1,
  barcode TEXT,
  compareatpricecents INTEGER,
  taxcode TEXT,
  imageurl TEXT,
  shippingclassid TEXT REFERENCES shippingclasses(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft')),
  createdat TEXT NOT NULL DEFAULT datetime('now')
)
```

**Trouver le bloc products :**
```typescript
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  imageurl TEXT,
  shippingclassid TEXT REFERENCES shippingclasses(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft')),
  createdat TEXT NOT NULL DEFAULT datetime('now')
)
```

**Remplacer par :**
```typescript
// Updated products table — adds vendor, tags, handle
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  imageurl TEXT,
  shippingclassid TEXT REFERENCES shippingclasses(id),
  vendor TEXT,
  tags TEXT,       -- JSON array: '["cotton","summer"]'
  handle TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft')),
  createdat TEXT NOT NULL DEFAULT datetime('now')
)
```

**Ajouter les index dans le bloc CREATE INDEX du SCHEMA :**
```typescript
CREATE INDEX IF NOT EXISTS idx_variants_requiresshipping ON variants(requiresshipping)
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON variants(barcode)
CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor)
CREATE INDEX IF NOT EXISTS idx_products_handle ON products(handle)
```

---

### 3.3 Mise à jour de ensureInitialized()

Les migrations inline dans `ensureInitialized()` permettent de mettre à jour les Durable
Objects **déjà déployés** sans avoir à tout réinitialiser. Il faut ajouter un bloc de
migrations 019 à la suite des migrations 018 existantes.

**Dans `do.ts`, chercher la fin du tableau `migrations` (après les entrées 018) et ajouter :**

```typescript
// ── Migration 019 ── Variant enrichment ───────────────────────────────────
// Add requiresshipping (blocking for shipping calculation) and optional
// enrichment fields: barcode, compareatpricecents, taxcode.
// Also adds vendor, tags, handle to products.
{
  name: 'variants_add_requiresshipping',
  sql: `ALTER TABLE variants ADD COLUMN requiresshipping INTEGER NOT NULL DEFAULT 1`,
},
{
  name: 'variants_add_barcode',
  sql: `ALTER TABLE variants ADD COLUMN barcode TEXT`,
},
{
  name: 'variants_add_compareatpricecents',
  sql: `ALTER TABLE variants ADD COLUMN compareatpricecents INTEGER`,
},
{
  name: 'variants_add_taxcode',
  sql: `ALTER TABLE variants ADD COLUMN taxcode TEXT`,
},
{
  name: 'products_add_vendor',
  sql: `ALTER TABLE products ADD COLUMN vendor TEXT`,
},
{
  name: 'products_add_tags',
  sql: `ALTER TABLE products ADD COLUMN tags TEXT`,
},
{
  name: 'products_add_handle',
  sql: `ALTER TABLE products ADD COLUMN handle TEXT UNIQUE`,
},
{
  name: 'idx_variants_requiresshipping',
  sql: `CREATE INDEX IF NOT EXISTS idx_variants_requiresshipping ON variants(requiresshipping)`,
},
{
  name: 'idx_variants_barcode',
  sql: `CREATE INDEX IF NOT EXISTS idx_variants_barcode ON variants(barcode)`,
},
{
  name: 'idx_products_vendor',
  sql: `CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor)`,
},
{
  name: 'idx_products_handle',
  sql: `CREATE INDEX IF NOT EXISTS idx_products_handle ON products(handle)`,
},
```

> **Pourquoi ce double système (SCHEMA + migrations) ?**
> - Le `SCHEMA` sert à créer la DB depuis zéro (nouveau déploiement).
> - Les entrées dans `ensureInitialized()` servent à migrer une DB existante.
> - Le fichier `.sql` standalone permet de migrer manuellement via `wrangler d1 execute`.
> Les trois doivent rester cohérents.

---

## 4. Étape 2 — Backend : schémas Zod (schemas.ts)

### 4.1 VariantResponse — ajout des nouveaux champs dans la réponse API

Chercher `VariantResponse` dans `schemas.ts` et ajouter les champs :

```typescript
export const VariantResponse = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  title: z.string(),
  pricecents: z.number().int(),
  currency: z.string(),
  imageurl: z.string().nullable(),
  shippingclassid: z.string().uuid().nullable().optional(),

  // ── Shipping fields ──────────────────────────────────────────────────────
  // Weight in grams. Used by computeCartWeightG() for shipping rate filtering.
  weightg: z.number().int().openapi({ example: 500 }),

  // Parsed dimensions object (null if not set)
  dimscm: z.object({ l: z.number(), w: z.number(), h: z.number() })
    .nullable()
    .openapi({ example: { l: 30, w: 20, h: 5 } }),

  // false = virtual/digital product, excluded from cart weight calculation
  requiresshipping: z.boolean().openapi({ example: true }),

  // ── Optional enrichment fields ──────────────────────────────────────────
  // EAN-13, UPC-A or any GTIN barcode
  barcode: z.string().nullable().openapi({ example: '3760093570015' }),

  // Original price before discount — shown crossed-out in the storefront
  compareatpricecents: z.number().int().nullable().openapi({ example: 4999 }),

  // Stripe Tax product code — used in Stripe checkout line_items
  taxcode: z.string().nullable().openapi({ example: 'txcd_99999999' }),
}).openapi('Variant')
```

### 4.2 CreateVariantBody — exposer les champs à la création

```typescript
export const CreateVariantBody = z.object({
  sku: z.string().min(1).openapi({ example: 'TEE-BLK-M' }),
  title: z.string().min(1).openapi({ example: 'Black Medium' }),
  pricecents: z.number().int().min(0).openapi({ example: 2999 }),
  currency: z.string().length(3).optional().openapi({
    example: 'EUR',
    description: 'ISO 4217 currency code for base price',
  }),
  imageurl: z.string().url().optional().openapi({ example: 'https://example.com/img.jpg' }),
  shippingclassid: z.string().uuid().nullable().optional(),

  // Weight in grams — required for shipping calculation, default 0
  weightg: z.number().int().min(0).default(0).openapi({
    example: 500,
    description: 'Weight in grams. Used for shipping rate filtering.',
  }),

  // Dimensions in centimetres (length × width × height)
  // Used for dimensional weight (DIM weight) calculation with carriers
  dimscm: z.object({
    l: z.number().min(0),
    w: z.number().min(0),
    h: z.number().min(0),
  }).nullable().optional().openapi({
    example: { l: 30, w: 20, h: 5 },
    description: 'Package dimensions in centimetres (L×W×H)',
  }),

  // Set to false for digital products (eBooks, software licenses, etc.)
  requiresshipping: z.boolean().default(true).openapi({
    description: 'Set to false for virtual/digital products — excluded from weight total',
  }),

  // Optional enrichment fields
  barcode: z.string().optional().openapi({ example: '3760093570015' }),
  compareatpricecents: z.number().int().min(0).optional().openapi({
    example: 4999,
    description: 'Original price shown crossed-out (must be > pricecents)',
  }),
  taxcode: z.string().optional().openapi({
    example: 'txcd_99999999',
    description: 'Stripe Tax product code — see https://stripe.com/docs/tax/tax-categories',
  }),
}).openapi('CreateVariant')
```

### 4.3 UpdateVariantBody — rendre tous les champs optionnels pour PATCH

```typescript
export const UpdateVariantBody = z.object({
  sku: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  pricecents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  imageurl: z.string().url().nullable().optional(),
  shippingclassid: z.string().uuid().nullable().optional(),

  // Shipping fields — all optional for PATCH
  weightg: z.number().int().min(0).optional(),
  dimscm: z.object({ l: z.number().min(0), w: z.number().min(0), h: z.number().min(0) })
    .nullable().optional(),
  requiresshipping: z.boolean().optional(),

  // Enrichment fields — all optional for PATCH
  barcode: z.string().nullable().optional(),
  compareatpricecents: z.number().int().min(0).nullable().optional(),
  taxcode: z.string().nullable().optional(),
}).openapi('UpdateVariant')
```

### 4.4 ProductResponse, CreateProductBody, UpdateProductBody

```typescript
// ── ProductResponse ──────────────────────────────────────────────────────
export const ProductResponse = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  shippingclassid: z.string().uuid().nullable().optional(),
  status: ProductStatus,
  createdat: z.string().datetime(),
  variants: z.array(VariantResponse),

  // New product-level fields
  vendor: z.string().nullable().openapi({ example: 'Acme Corp' }),
  tags: z.array(z.string()).nullable().openapi({ example: ['cotton', 'summer'] }),
  handle: z.string().nullable().openapi({ example: 'classic-cotton-t-shirt' }),
}).openapi('Product')

// ── CreateProductBody ─────────────────────────────────────────────────────
export const CreateProductBody = z.object({
  title: z.string().min(1).openapi({ example: 'Classic T-Shirt' }),
  description: z.string().optional(),
  shippingclassid: z.string().uuid().nullable().optional(),

  // Brand/manufacturer — used for catalog filtering
  vendor: z.string().optional().openapi({ example: 'Acme Corp' }),

  // Keyword tags for search/filtering — stored as JSON array in SQLite
  tags: z.array(z.string()).optional().openapi({ example: ['cotton', 'summer'] }),

  // URL slug — auto-generated from title if not provided
  handle: z.string().regex(/^[a-z0-9-]+$/, 'Handle must be lowercase letters, numbers and hyphens')
    .optional().openapi({ example: 'classic-cotton-t-shirt' }),
}).openapi('CreateProduct')

// ── UpdateProductBody ─────────────────────────────────────────────────────
export const UpdateProductBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  shippingclassid: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'draft']).optional(),
  vendor: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  handle: z.string().regex(/^[a-z0-9-]+$/).nullable().optional(),
}).openapi('UpdateProduct')
```

---

## 5. Étape 3 — Backend : routes catalogue (catalog.ts)

### 5.1 Ajouter une fonction utilitaire de sérialisation

En haut de `catalog.ts`, après les imports, ajouter ces deux helpers :

```typescript
// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parses a dimscm JSON string from SQLite into a typed object.
 * Returns null if the value is missing or invalid.
 */
function parseDimscm(raw: unknown): { l: number; w: number; h: number } | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.l === 'number' && typeof parsed.w === 'number' && typeof parsed.h === 'number') {
      return { l: parsed.l, w: parsed.w, h: parsed.h }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Parses a tags JSON string from SQLite into a string array.
 * Returns null if the value is missing or invalid.
 */
function parseTags(raw: unknown): string[] | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Generates a URL-friendly slug from a product title.
 * Example: "Classic Cotton T-Shirt!" → "classic-cotton-t-shirt"
 */
function generateHandle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')                  // decompose accented chars
    .replace(/[\u0300-\u036f]/g, '')   // remove accent marks
    .replace(/[^a-z0-9\s-]/g, '')      // remove special chars
    .trim()
    .replace(/\s+/g, '-')             // spaces → hyphens
    .replace(/-+/g, '-')              // collapse multiple hyphens
}

/**
 * Maps a raw variant row from SQLite to the API response shape.
 * Call this everywhere you return a variant to avoid repeating the mapping.
 */
function mapVariant(v: Record<string, unknown>) {
  return {
    id: v.id,
    sku: v.sku,
    title: v.title,
    pricecents: v.pricecents,
    currency: (v.currency as string) ?? 'USD',
    imageurl: v.imageurl ?? null,
    shippingclassid: v.shippingclassid ?? null,
    weightg: (v.weightg as number) ?? 0,
    dimscm: parseDimscm(v.dimscm),
    requiresshipping: v.requiresshipping !== 0,   // SQLite stores 0/1
    barcode: v.barcode ?? null,
    compareatpricecents: v.compareatpricecents ?? null,
    taxcode: v.taxcode ?? null,
  }
}

/**
 * Maps a raw product row (with its variants) to the API response shape.
 */
function mapProduct(p: Record<string, unknown>, variants: Record<string, unknown>[]) {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? null,
    shippingclassid: p.shippingclassid ?? null,
    status: p.status,
    createdat: p.createdat,
    vendor: p.vendor ?? null,
    tags: parseTags(p.tags),
    handle: p.handle ?? null,
    variants: variants.map(mapVariant),
  }
}
```

### 5.2 Handler createVariant

Remplacer le handler complet :

```typescript
app.openapi(createVariant, async (c) => {
  const { id: productId } = c.req.valid('param')
  const {
    sku, title, pricecents, currency, imageurl, shippingclassid,
    weightg, dimscm, requiresshipping,
    barcode, compareatpricecents, taxcode,
  } = c.req.valid('json')

  const db = getDb(c.var.db)

  // Verify parent product exists
  const product = await db.queryany(`SELECT id FROM products WHERE id = ?`, productId)
  if (!product) throw ApiError.notFound('Product not found')

  // Prevent duplicate SKU
  const existingSku = await db.queryany(`SELECT id FROM variants WHERE sku = ?`, sku)
  if (existingSku) throw ApiError.conflict(`SKU ${sku} already exists`)

  const id = uuid()
  const timestamp = now()

  await db.run(
    `INSERT INTO variants
       (id, productid, sku, title, pricecents, currency,
        weightg, dimscm, requiresshipping,
        barcode, compareatpricecents, taxcode,
        imageurl, shippingclassid, createdat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, productId, sku, title, pricecents, currency ?? 'USD',
    weightg ?? 0,
    dimscm ? JSON.stringify(dimscm) : null,
    requiresshipping === false ? 0 : 1,   // store as SQLite integer
    barcode ?? null,
    compareatpricecents ?? null,
    taxcode ?? null,
    imageurl ?? null,
    shippingclassid ?? null,
    timestamp,
  )

  // Auto-create inventory entry for this new SKU
  await db.run(
    `INSERT INTO inventory (id, sku, onhand, reserved, updatedat) VALUES (?, ?, 0, 0, ?)`,
    uuid(), sku, timestamp,
  )

  // Return the newly created variant
  const variant = await db.queryany(`SELECT * FROM variants WHERE id = ?`, id)
  return c.json(mapVariant(variant), 201)
})
```

### 5.3 Handler updateVariant

Dans le bloc qui construit `updates[]`, ajouter après les champs existants :

```typescript
// ── Shipping fields ──────────────────────────────────────────────────────
if (body.weightg !== undefined) {
  updates.push('weightg = ?')
  params.push(body.weightg)
}
if (body.dimscm !== undefined) {
  updates.push('dimscm = ?')
  params.push(body.dimscm ? JSON.stringify(body.dimscm) : null)
}
if (body.requiresshipping !== undefined) {
  updates.push('requiresshipping = ?')
  params.push(body.requiresshipping ? 1 : 0)
}

// ── Enrichment fields ─────────────────────────────────────────────────────
if (body.barcode !== undefined) {
  updates.push('barcode = ?')
  params.push(body.barcode)
}
if (body.compareatpricecents !== undefined) {
  updates.push('compareatpricecents = ?')
  params.push(body.compareatpricecents)
}
if (body.taxcode !== undefined) {
  updates.push('taxcode = ?')
  params.push(body.taxcode)
}
```

Remplacer le `return c.json(...)` final par :
```typescript
const updated = await db.queryany(`SELECT * FROM variants WHERE id = ?`, variantId)
return c.json(mapVariant(updated), 200)
```

### 5.4 Handlers createProduct et updateProduct

```typescript
// ── createProduct ─────────────────────────────────────────────────────────
app.openapi(createProduct, async (c) => {
  const { title, description, shippingclassid, vendor, tags, handle } = c.req.valid('json')
  const db = getDb(c.var.db)

  const id = uuid()
  const timestamp = now()

  // Auto-generate handle from title if not provided
  const resolvedHandle = handle ?? generateHandle(title)

  // Check handle uniqueness
  const existingHandle = await db.queryany(
    `SELECT id FROM products WHERE handle = ?`, resolvedHandle
  )
  if (existingHandle) throw ApiError.conflict(`Handle "${resolvedHandle}" already exists`)

  await db.run(
    `INSERT INTO products (id, title, description, status, vendor, tags, handle, createdat)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
    id, title, description ?? null,
    vendor ?? null,
    tags ? JSON.stringify(tags) : null,
    resolvedHandle,
    timestamp,
  )

  const product = await db.queryany(`SELECT * FROM products WHERE id = ?`, id)
  return c.json(mapProduct(product, []), 201)
})

// ── updateProduct ─────────────────────────────────────────────────────────
// Dans le bloc qui construit updates[], ajouter :
if (body.vendor !== undefined) { updates.push('vendor = ?'); params.push(body.vendor) }
if (body.tags !== undefined)   { updates.push('tags = ?');   params.push(body.tags ? JSON.stringify(body.tags) : null) }
if (body.handle !== undefined) {
  if (body.handle) {
    const existingHandle = await db.queryany(
      `SELECT id FROM products WHERE handle = ? AND id != ?`, body.handle, id
    )
    if (existingHandle) throw ApiError.conflict(`Handle "${body.handle}" already exists`)
  }
  updates.push('handle = ?')
  params.push(body.handle ?? null)
}
```

### 5.5 Mettre à jour les réponses de getProduct et listProducts

Partout où les variantes sont retournées, remplacer le `.map(v => ({...}))` manuel
par l'appel à `mapVariant(v)` et `mapProduct(p, variants)` définis en 5.1 :

```typescript
// Avant — mapping manuel (à supprimer)
variants: variants.map(v => ({
  id: v.id, sku: v.sku, title: v.title, pricecents: v.pricecents,
  imageurl: v.imageurl, currency: v.currency ?? 'USD',
}))

// Après — utiliser le helper centralisé
variants: variantsByProduct[p.id]?.map(mapVariant) ?? []
```

---

## 6. Étape 4 — Backend : calcul du poids (lib/shipping.ts)

Modifier `computeCartWeightG` pour exclure les produits virtuels :

```typescript
/**
 * Computes the total physical weight of a cart in grams.
 * Virtual/digital variants (requiresshipping = 0) are excluded.
 *
 * @param db - Database instance
 * @param cartId - UUID of the cart
 * @returns Total weight in grams (0 if no physical items)
 */
export async function computeCartWeightG(db: Database, cartId: string): Promise<number> {
  const result = await db.queryany<{ totalweightg: number }>(`
    SELECT COALESCE(SUM(v.weightg * ci.qty), 0) AS totalweightg
    FROM cartitems ci
    JOIN variants v ON v.sku = ci.sku
    WHERE ci.cartid = ?
      AND v.requiresshipping = 1
  `, cartId)
  return result[0]?.totalweightg ?? 0
}
```

---

## 7. Étape 5 — Backend : checkout Stripe (checkout.ts)

Si `taxcode` est défini sur une variante, le passer à Stripe dans `line_items`
pour activer Stripe Tax automatiquement :

```typescript
// Dans la construction des line_items Stripe, remplacer le mapping actuel par :
const lineItems = validatedItems.map((item) => ({
  price_data: {
    currency: cart.currency.toLowerCase(),
    unit_amount: item.unitpricecents,
    product_data: {
      name: item.title,
      // Pass Stripe Tax code if the variant has one configured
      ...(item.taxcode && {
        tax_code: item.taxcode,
      }),
    },
  },
  quantity: item.qty,
}))
```

Pour avoir `item.taxcode` disponible, il faut l'inclure dans la requête SQL
qui récupère les variantes lors du checkout :

```typescript
// Dans la requête de récupération des variantes pour le checkout :
const variant = await db.queryany<{
  id: string; title: string; pricecents: number; weightg: number;
  requiresshipping: number; taxcode: string | null
}>(
  `SELECT v.id, v.title, v.pricecents, v.weightg, v.requiresshipping, v.taxcode
   FROM variants v WHERE v.sku = ? AND v.status = 'active'`,
  item.sku
)
```

---

## 8. Étape 6 — Frontend : types API (store-api.ts)

Mettre à jour l'interface TypeScript `Variant` et `Product` dans `store-api.ts` :

```typescript
// ── Variant ───────────────────────────────────────────────────────────────
export interface Variant {
  id: string
  sku: string
  title: string
  pricecents: number
  currency: string
  imageurl: string | null
  shippingclassid?: string | null

  // Shipping fields
  weightg: number
  dimscm: { l: number; w: number; h: number } | null
  requiresshipping: boolean

  // Enrichment fields
  barcode: string | null
  compareatpricecents: number | null
  taxcode: string | null
}

// ── Product ───────────────────────────────────────────────────────────────
export interface Product {
  id: string
  title: string
  description: string | null
  shippingclassid?: string | null
  status: 'active' | 'draft'
  createdat: string
  variants: Variant[]

  // New product-level fields
  vendor: string | null
  tags: string[] | null
  handle: string | null
}

// ── CreateVariantPayload ──────────────────────────────────────────────────
export interface CreateVariantPayload {
  sku: string
  title: string
  pricecents: number
  currency?: string
  imageurl?: string
  shippingclassid?: string | null
  // Shipping
  weightg?: number
  dimscm?: { l: number; w: number; h: number } | null
  requiresshipping?: boolean
  // Enrichment
  barcode?: string
  compareatpricecents?: number
  taxcode?: string
}

// ── CreateProductPayload ──────────────────────────────────────────────────
export interface CreateProductPayload {
  title: string
  description?: string
  shippingclassid?: string | null
  vendor?: string
  tags?: string[]
  handle?: string
}
```

---

## 9. Étape 7 — Frontend : formulaire variant (admin/products.tsx)

### 9.1 Formulaire d'ajout / édition de variante

Dans le composant de création/édition de variante, ajouter les champs suivants.
Les ajouter **après le champ `currency`** et **avant le bouton de soumission**.

```tsx
{/* ── Shipping section ─────────────────────────────────────────────── */}
<div className="col-span-2">
  <p className="text-sm font-semibold text-default-700 mb-2">Expédition</p>
</div>

{/* Weight — required for shipping rate calculation */}
<Input
  label="Poids (grammes)"
  placeholder="500"
  type="number"
  min={0}
  value={String(form.weightg ?? 0)}
  onChange={(e) => setForm({ ...form, weightg: parseInt(e.target.value) || 0 })}
  description="Poids du colis en grammes. Utilisé pour filtrer les tarifs de livraison."
  endContent={<span className="text-default-400 text-sm">g</span>}
/>

{/* Dimensions L × W × H */}
<div className="flex gap-2">
  <Input
    label="Longueur (cm)"
    type="number" min={0}
    value={String(form.dimscm?.l ?? '')}
    onChange={(e) => setForm({ ...form, dimscm: { ...form.dimscm, l: parseFloat(e.target.value) || 0 } })}
  />
  <Input
    label="Largeur (cm)"
    type="number" min={0}
    value={String(form.dimscm?.w ?? '')}
    onChange={(e) => setForm({ ...form, dimscm: { ...form.dimscm, w: parseFloat(e.target.value) || 0 } })}
  />
  <Input
    label="Hauteur (cm)"
    type="number" min={0}
    value={String(form.dimscm?.h ?? '')}
    onChange={(e) => setForm({ ...form, dimscm: { ...form.dimscm, h: parseFloat(e.target.value) || 0 } })}
  />
</div>

{/* requiresshipping toggle — disable for digital products */}
<Switch
  isSelected={form.requiresshipping !== false}
  onValueChange={(v) => setForm({ ...form, requiresshipping: v })}
>
  Produit physique (nécessite une expédition)
</Switch>
<p className="text-xs text-default-400 col-span-2">
  Désactiver pour les produits numériques — ils seront exclus du calcul du poids.
</p>

{/* ── Enrichment section ───────────────────────────────────────────── */}
<div className="col-span-2 mt-4">
  <p className="text-sm font-semibold text-default-700 mb-2">Informations complémentaires</p>
</div>

{/* Barcode */}
<Input
  label="Code-barres (EAN / UPC / GTIN)"
  placeholder="3760093570015"
  value={form.barcode ?? ''}
  onChange={(e) => setForm({ ...form, barcode: e.target.value || undefined })}
  description="Code-barres EAN-13, UPC-A ou GTIN pour la gestion en entrepôt."
/>

{/* Compare-at price */}
<Input
  label="Prix barré (centimes)"
  placeholder="4999"
  type="number" min={0}
  value={String(form.compareatpricecents ?? '')}
  onChange={(e) => setForm({ ...form, compareatpricecents: parseInt(e.target.value) || undefined })}
  description="Prix avant promotion, affiché barré en vitrine. Doit être supérieur au prix de vente."
  endContent={<span className="text-default-400 text-sm">cts</span>}
/>

{/* Stripe Tax code */}
<Input
  label="Code fiscal Stripe Tax"
  placeholder="txcd_99999999"
  value={form.taxcode ?? ''}
  onChange={(e) => setForm({ ...form, taxcode: e.target.value || undefined })}
  description={
    <span>
      Code catégorie Stripe Tax.{' '}
      <a href="https://stripe.com/docs/tax/tax-categories" target="_blank" rel="noreferrer"
         className="text-primary underline">Voir la liste</a>
    </span>
  }
/>
```

### 9.2 Formulaire produit — vendor, tags, handle

Dans le formulaire produit (section informations générales), ajouter :

```tsx
{/* Vendor / Brand */}
<Input
  label="Marque / Fabricant"
  placeholder="Acme Corp"
  value={productForm.vendor ?? ''}
  onChange={(e) => setProductForm({ ...productForm, vendor: e.target.value || undefined })}
  description="Nom de la marque ou du fabricant. Utilisé pour le filtrage catalogue."
/>

{/* Handle / Slug */}
<Input
  label="Identifiant URL (slug)"
  placeholder="classic-cotton-t-shirt"
  value={productForm.handle ?? ''}
  onChange={(e) => setProductForm({ ...productForm, handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
  description="Identifiant unique pour les URLs. Généré automatiquement depuis le titre si laissé vide."
  startContent={<span className="text-default-400 text-sm">/products/</span>}
/>

{/* Tags */}
<Input
  label="Mots-clés (tags)"
  placeholder="cotton, summer, new-arrival"
  value={(productForm.tags ?? []).join(', ')}
  onChange={(e) => setProductForm({
    ...productForm,
    tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
  })}
  description="Mots-clés séparés par des virgules pour la recherche et le filtrage."
/>
```

---

## 10. Étape 8 — Mise à jour README.md

Ajouter / modifier les sections suivantes dans le README.

### Section « Products & Catalog » — ajouter les lignes :

```markdown
- **Poids et dimensions** par variante (`weightg` en grammes, `dimscm` en cm L×W×H)
  — utilisés automatiquement pour filtrer les tarifs de livraison selon la limite `maxweightg`
- **Produits virtuels** (`requiresshipping: false`) — exclus du calcul du poids du panier,
  aucun tarif de livraison requis
- **Code-barres** (EAN-13, UPC-A, GTIN) par variante pour la gestion en entrepôt
- **Prix barré** (`compareatpricecents`) pour afficher l'économie réalisée en vitrine
- **Code fiscal Stripe Tax** (`taxcode`) par variante pour la collecte automatique de TVA
- **Marque / Fabricant** (`vendor`) au niveau produit
- **Tags** — tableau de mots-clés JSON pour le filtrage catalogue
- **Handle / Slug** — identifiant URL unique auto-généré depuis le titre du produit
```

### Section « Database Schema » — Migrations — ajouter la ligne 019 :

```markdown
| `019` | Enrichissement variantes : `requiresshipping`, `barcode`, `compareatpricecents`, `taxcode` sur `variants` + `vendor`, `tags`, `handle` sur `products` |
```

### Section « Products & Variants » — mettre à jour le tableau de l'API :

```markdown
| `POST` | `/v1/products/:id/variants` | `adminstore` | Créer une variante — champs : `sku`, `title`, `pricecents`, `currency`, `weightg`, `dimscm`, `requiresshipping`, `shippingclassid`, `barcode`, `compareatpricecents`, `taxcode` |
```

---

## 11. Checklist de validation

Après avoir appliqué toutes les étapes, vérifier les points suivants :

### Tests manuels

- [ ] **Créer un variant** avec `weightg: 500` → vérifier que la DB contient bien 500 (et pas 0)
- [ ] **Créer un variant** sans `weightg` → vérifier que la valeur par défaut est 0
- [ ] **Créer un variant** avec `requiresshipping: false`
- [ ] **Ajouter ce variant au panier** → appeler `/v1/carts/:id/available-shipping-rates`
      → vérifier que `carttotalweightg` est 0 (produit virtuel exclu)
- [ ] **Mélanger** un variant physique (500 g) et un virtuel dans le même panier
      → `carttotalweightg` doit correspondre au seul variant physique
- [ ] **PATCH** d'un variant existant avec `weightg: 1200` → vérifier la mise à jour
- [ ] **Créer un produit** sans `handle` → vérifier que le handle est auto-généré depuis le titre
- [ ] **Créer deux produits** avec le même handle → l'API doit retourner `409 Conflict`
- [ ] **Créer un variant** avec `taxcode: 'txcd_99999999'` → vérifier que Stripe reçoit `tax_code`
      dans les `line_items` lors du checkout
- [ ] **Vérifier l'OpenAPI** via `/openapi` → tous les nouveaux champs doivent apparaître
      dans les schémas `Variant` et `Product`

### Vérifications DB

```sql
-- Vérifier les nouvelles colonnes sur variants
PRAGMA table_info(variants);
-- Doit afficher : requiresshipping, barcode, compareatpricecents, taxcode

-- Vérifier les nouvelles colonnes sur products
PRAGMA table_info(products);
-- Doit afficher : vendor, tags, handle

-- Vérifier qu'aucun variant existant n'a requiresshipping = NULL
SELECT COUNT(*) FROM variants WHERE requiresshipping IS NULL;
-- Doit retourner 0
```

---

## 12. Ordre d'exécution recommandé

Suivre cet ordre pour éviter les erreurs de dépendance :

```
1. [ ] Étape 1.1 — Créer apps/merchant/migrations/019-variant-enrichment.sql
2. [ ] Étape 1.2 — Mettre à jour le SCHEMA dans do.ts (tables variants + products)
3. [ ] Étape 1.3 — Ajouter les entrées dans ensureInitialized() de do.ts
4. [ ] Étape 2   — Mettre à jour schemas.ts (VariantResponse, CreateVariantBody,
                   UpdateVariantBody, ProductResponse, CreateProductBody, UpdateProductBody)
5. [ ] Étape 3.1 — Ajouter les helpers (parseDimscm, parseTags, generateHandle,
                   mapVariant, mapProduct) dans catalog.ts
6. [ ] Étape 3.2 — Mettre à jour createVariant handler
7. [ ] Étape 3.3 — Mettre à jour updateVariant handler
8. [ ] Étape 3.4 — Mettre à jour createProduct et updateProduct handlers
9. [ ] Étape 3.5 — Remplacer les mappings manuels par mapVariant() / mapProduct()
                   dans getProduct, listProducts, searchProducts
10.[ ] Étape 4   — Mettre à jour computeCartWeightG() dans lib/shipping.ts
11.[ ] Étape 5   — Ajouter le taxcode dans checkout.ts
12.[ ] Étape 6   — Mettre à jour les interfaces TypeScript dans store-api.ts
13.[ ] Étape 7.1 — Ajouter les champs au formulaire variante (admin/products.tsx)
14.[ ] Étape 7.2 — Ajouter les champs au formulaire produit (admin/products.tsx)
15.[ ] Étape 8   — Mettre à jour README.md
16.[ ] Étape 11  — Exécuter la checklist de validation complète
```

> **Conseil :** faire un commit Git entre chaque étape numérotée.
> En cas d'erreur, `git revert` ne touche qu'un seul changement à la fois.

---

*Document généré le 18 mars 2026 — applicable sur la branche main post-migration-018.*
