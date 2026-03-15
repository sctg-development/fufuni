# Plan d'action — Support Multi-Devises
**Projet : Fork Merchant — Extension Multi-Région + Auth0**
**Auteur : Ronan LE MEILLAT — SCTG Development**
**Date : 14 mars 2026**
**Version : 1.0**

---

## Sommaire

1. [État des lieux et diagnostic](#1-état-des-lieux-et-diagnostic)
2. [Règles fondamentales à respecter](#2-règles-fondamentales-à-respecter)
3. [Phase 0 — Utilitaire de formatage monétaire (Frontend)](#phase-0--utilitaire-de-formatage-monétaire-frontend)
4. [Phase 1 — Résolution du prix par région au niveau cart](#phase-1--résolution-du-prix-par-région-au-niveau-cart)
5. [Phase 2 — Checkout Stripe multi-devise](#phase-2--checkout-stripe-multi-devise)
6. [Phase 3 — Prix multi-devise sur les variantes (Admin)](#phase-3--prix-multi-devise-sur-les-variantes-admin)
7. [Phase 4 — UCP et route Test Order](#phase-4--ucp-et-route-test-order)
8. [Phase 5 — Cohérence de l'affichage Admin](#phase-5--cohérence-de-laffichage-admin)
9. [Phase 6 — Validation et guards](#phase-6--validation-et-guards)
10. [Récapitulatif et ordre d'exécution](#récapitulatif-et-ordre-dexécution)

---

## 1. État des lieux et diagnostic

### Infrastructure DB — déjà en place ✅

Le schéma SQLite dans `apps/merchant/src/do.ts` possède déjà les tables nécessaires :

```sql
-- Prix par devise par variante (existe mais NON utilisé au runtime)
CREATE TABLE IF NOT EXISTS variantprices (
  id TEXT PRIMARY KEY,
  variantid TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  currencyid TEXT NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
  pricecents INTEGER NOT NULL,
  UNIQUE(variantid, currencyid)
);

-- Région avec devise de référence (existe et partiellement utilisé)
CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  displayname TEXT NOT NULL,
  currencyid TEXT NOT NULL REFERENCES currencies(id),
  isdefault INTEGER NOT NULL DEFAULT 0,
  ...
);

-- Prix de livraison par devise (existe mais NON utilisé)
CREATE TABLE IF NOT EXISTS shippingrateprices (
  shippingrateid TEXT NOT NULL REFERENCES shippingrates(id) ON DELETE CASCADE,
  currencyid TEXT NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
  amountcents INTEGER NOT NULL,
  UNIQUE(shippingrateid, currencyid)
);
```

### Points bloquants — codés en dur ❌

| Fichier | Ligne problématique | Impact |
|---|---|---|
| `apps/merchant/src/do.ts` | `variants.currency TEXT DEFAULT 'USD'` | Prix de base en USD uniquement |
| `apps/merchant/src/do.ts` | `carts.currency TEXT DEFAULT 'USD'` | Cart par défaut en USD même avec région EUR |
| `apps/merchant/src/routes/checkout.ts` | `currency: 'usd'` dans lineItems Stripe | Stripe facture toujours en USD |
| `apps/merchant/src/routes/checkout.ts` | `couponParams.currency = 'usd'` | Coupons à montant fixe créés en USD |
| `apps/merchant/src/routes/checkout.ts` | `currency: 'usd'` dans defaultShippingOptions | Livraison gratuite en USD |
| `apps/merchant/src/routes/checkout.ts` | `unitpricecents: variant.pricecents` dans addCartItems | Ignore `variantprices` |
| `apps/merchant/src/routes/orders.ts` | `subtotal += variant.pricecents * qty` | Ignore `variantprices` pour test orders |
| `apps/client/src/pages/admin/customers.tsx` | `const formatCurrency = cents => ...` → pas de devise | Affichage `$` implicite |
| `apps/client/src/pages/admin/products.tsx` | `variant.pricecents / 100` dans `VariantCard` | Affichage sans devise |

---

## 2. Règles fondamentales à respecter

> ⚠️ Ces règles sont non-négociables et communes à tous les grands frameworks e-commerce (Medusa, Saleor, Shopify).

1. **Jamais de conversion de taux de change pour les prix produits** — un prix EUR est saisi en EUR, pas converti depuis USD.
2. **La devise est figée à la création du cart** — elle ne change plus ensuite, même si le client change de région.
3. **Toujours stocker des entiers (cents/pence/centimes)** — jamais de flottants.
4. **`Intl.NumberFormat` pour tout affichage** — jamais de `$` ou `€` codés en dur dans les templates.
5. **La devise du cart est transmise à Stripe telle quelle** — Stripe gère l'affichage local.
6. **Fallback sur `variants.pricecents` si aucun prix `variantprices` n'existe** pour la devise cible.

---

## Phase 0 — Utilitaire de formatage monétaire (Frontend)

**Priorité : P0 (bloquant, impact utilisateur immédiat)**
**Fichiers concernés :** nouveau fichier + tous les composants admin

### 0.1 — Créer `apps/client/src/utils/currency.ts`

```typescript
// apps/client/src/utils/currency.ts

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
  }).format(cents / 100);
}

/**
 * Variante avec décimales forcées (pour les affichages comptables admin).
 * Utile quand on veut toujours afficher 2 décimales même pour l'EUR.
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
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(cents / 100);
}

/**
 * Retourne uniquement le symbole de la devise pour une locale donnée.
 * @example currencySymbol("EUR", "fr-FR") // "€"
 * @example currencySymbol("USD", "en-US") // "$"
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
```

### 0.2 — Remplacer dans `apps/client/src/pages/admin/customers.tsx`

```typescript
// AVANT ❌
const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Utilisé comme:
formatCurrency(c.stats.totalspentcents)
// → "$125.50" — USD hardcodé

// APRÈS ✅
import { formatMoney } from "@/utils/currency";

// Dans le composant, récupérer la devise de la commande ou ordre:
formatMoney(c.stats.totalspentcents, "USD") // fallback temporaire

// Pour les détails de commande (order.currency est déjà retourné par l'API):
formatMoney(order.amounts.totalcents, order.amounts.currency)
```

### 0.3 — Remplacer dans `apps/client/src/pages/admin/products.tsx` (VariantCard)

```typescript
// AVANT ❌ (dans le composant VariantCard)
<p className="font-mono text-sm font-semibold">
  {(variant.pricecents / 100).toFixed(2)}
</p>
// → "29.99" — pas de devise visible

// APRÈS ✅
import { formatMoney } from "@/utils/currency";

<p className="font-mono text-sm font-semibold">
  {formatMoney(variant.pricecents, variant.currency ?? "USD")}
</p>
// → "$29.99" ou "29,99 €" selon la devise du variant
```

> 📝 **Note :** `variant.currency` doit être retourné par l'API. Vérifier que `VariantResponse` dans `schemas.ts` inclut bien le champ `currency`.

---

## Phase 1 — Résolution du prix par région au niveau cart

**Priorité : P1 (important — les prix des items du cart sont actuellement toujours en USD)**
**Fichier concerné :** `apps/merchant/src/routes/checkout.ts`

### 1.1 — Créer un helper de résolution de prix partagé

Créer `apps/merchant/src/lib/pricing.ts` :

```typescript
// apps/merchant/src/lib/pricing.ts
import type { Database } from "../db";

/**
 * Résout le prix d'un variant dans une devise donnée.
 * Cherche d'abord dans variantprices (prix spécifique par devise),
 * puis fallback sur variants.pricecents (prix de base, supposé USD).
 *
 * @param db          - instance Database
 * @param variantId   - UUID du variant
 * @param currencyId  - UUID de la devise cible (table currencies)
 * @returns prix en centimes dans la devise cible
 */
export async function resolveVariantPrice(
  db: Database,
  variantId: string,
  currencyId: string | null
): Promise<number> {
  if (currencyId) {
    const specificPrice = await db.queryAny<{ pricecents: number }>(
      `SELECT pricecents FROM variantprices
       WHERE variantid = ? AND currencyid = ?`,
      variantId,
      currencyId
    );
    if (specificPrice) return specificPrice.pricecents;
  }
  // Fallback sur le prix de base (USD par défaut)
  const variant = await db.queryAny<{ pricecents: number }>(
    `SELECT pricecents FROM variants WHERE id = ?`,
    variantId
  );
  return variant?.pricecents ?? 0;
}

/**
 * Résout le prix de livraison d'un shippingrate dans une devise donnée.
 * Fallback sur 0 si aucun prix trouvé.
 */
export async function resolveShippingPrice(
  db: Database,
  shippingRateId: string,
  currencyId: string | null
): Promise<number> {
  if (currencyId) {
    const price = await db.queryAny<{ amountcents: number }>(
      `SELECT amountcents FROM shippingrateprices
       WHERE shippingrateid = ? AND currencyid = ?`,
      shippingRateId,
      currencyId
    );
    if (price) return price.amountcents;
  }
  return 0;
}

/**
 * Retourne le currencyId associé à une région.
 * Retourne null si la région n'existe pas.
 */
export async function getCurrencyIdForRegion(
  db: Database,
  regionId: string | null
): Promise<string | null> {
  if (!regionId) return null;
  const region = await db.queryAny<{ currencyid: string }>(
    `SELECT currencyid FROM regions WHERE id = ? AND status = 'active'`,
    regionId
  );
  return region?.currencyid ?? null;
}
```

### 1.2 — Modifier `addCartItems` dans `checkout.ts`

```typescript
// AVANT ❌ dans addCartItems
import { resolveVariantPrice, getCurrencyIdForRegion } from "../lib/pricing";

// Ligne ~140 — résolution du prix ignorant la devise du cart
validatedItems.push({
  sku,
  title: variant.title,
  qty,
  unitpricecents: variant.pricecents, // ← TOUJOURS en USD
});

// APRÈS ✅
// Ajouter AVANT la boucle for:
const currencyId = await getCurrencyIdForRegion(db, cart.regionid);

// Dans la boucle:
const unitpricecents = await resolveVariantPrice(db, variant.id, currencyId);

validatedItems.push({
  sku,
  title: variant.title,
  qty,
  unitpricecents, // ← prix résolu dans la devise du cart
});
```

### 1.3 — Ajouter `currency` sur `cartitems` (snapshot comptable)

Migration SQL à ajouter dans `do.ts` (SCHEMA) :

```sql
-- Ajouter currency sur cartitems pour snapshot comptable
-- À ajouter dans le SCHEMA après la définition de cartitems
ALTER TABLE cartitems ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
```

Et dans `addCartItems`, lors du INSERT :

```typescript
// AVANT ❌
await db.run(
  `INSERT INTO cartitems (id, cartid, sku, title, qty, unitpricecents)
   VALUES (?, ?, ?, ?, ?, ?)`,
  uuid(), cartId, item.sku, item.title, item.qty, item.unitpricecents
);

// APRÈS ✅
await db.run(
  `INSERT INTO cartitems (id, cartid, sku, title, qty, unitpricecents, currency)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  uuid(), cartId, item.sku, item.title, item.qty, item.unitpricecents, cart.currency
);
```

---

## Phase 2 — Checkout Stripe multi-devise

**Priorité : P0 (bloquant en production hors USD — erreur Stripe)**
**Fichier concerné :** `apps/merchant/src/routes/checkout.ts`

### 2.1 — lineItems Stripe

```typescript
// AVANT ❌ (~ligne 220 dans checkoutCart)
const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map(
  (item) => ({
    price_data: {
      currency: "usd", // ← HARDCODÉ
      product_data: { name: item.title },
      unit_amount: item.unitpricecents,
    },
    quantity: item.qty,
  })
);

// APRÈS ✅
// cart.currency est déjà disponible (chargé depuis DB plus haut dans la route)
const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map(
  (item) => ({
    price_data: {
      currency: cart.currency.toLowerCase(), // "eur", "usd", "gbp"...
      product_data: { name: item.title },
      unit_amount: item.unitpricecents,
    },
    quantity: item.qty,
  })
);
```

### 2.2 — Coupon Stripe à montant fixe

```typescript
// AVANT ❌ (~ligne 260)
if (discount.type === "percentage" && discount.maxdiscountcents) {
  couponParams.amount_off = discountAmountCents;
  couponParams.currency = "usd"; // ← HARDCODÉ
} else if (discount.type !== "percentage") {
  couponParams.amount_off = discount.value;
  couponParams.currency = "usd"; // ← HARDCODÉ
}

// APRÈS ✅
if (discount.type === "percentage" && discount.maxdiscountcents) {
  couponParams.amount_off = discountAmountCents;
  couponParams.currency = cart.currency.toLowerCase();
} else if (discount.type !== "percentage") {
  couponParams.amount_off = discount.value;
  couponParams.currency = cart.currency.toLowerCase();
}
```

### 2.3 — Options de livraison par défaut

```typescript
// AVANT ❌ (~ligne 280)
const defaultShippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [
  {
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: { amount: 0, currency: "usd" }, // ← HARDCODÉ
      display_name: "Standard Shipping",
      ...
    },
  },
];

// APRÈS ✅
const defaultShippingOptions = buildDefaultShippingOptions(cart.currency.toLowerCase());

// Ajouter cette fonction helper dans le fichier:
function buildDefaultShippingOptions(
  currency: string
): Stripe.Checkout.SessionCreateParams.ShippingOption[] {
  return [
    {
      shipping_rate_data: {
        type: "fixed_amount",
        fixed_amount: { amount: 0, currency },
        display_name: "Standard Shipping",
        delivery_estimate: {
          minimum: { unit: "business_day", value: 5 },
          maximum: { unit: "business_day", value: 7 },
        },
      },
    },
  ];
}
```

---

## Phase 3 — Prix multi-devise sur les variantes (Admin)

**Priorité : P2 (enrichissement — la table existe mais n'est pas exposée)**
**Fichiers concernés :** `routes/catalog.ts` + `pages/admin/products.tsx`

### 3.1 — Nouvelles routes backend dans `catalog.ts`

```typescript
// apps/merchant/src/routes/catalog.ts — Ajouter après updateVariant

// GET /v1/products/:id/variants/:variantId/prices
const listVariantPrices = createRoute({
  method: "get",
  path: "/{id}/variants/{variantId}/prices",
  tags: ["Products"],
  summary: "List prices for a variant by currency",
  security: [{ bearerAuth: [] }],
  middleware: [adminOnly] as const,
  request: { params: VariantIdParam },
  responses: {
    200: {
      content: { "application/json": { schema: VariantPriceListResponse } },
      description: "List of prices",
    },
  },
});

app.openapi(listVariantPrices, async (c) => {
  const { id: productId, variantId } = c.req.valid("param");
  const db = getDb(c.var.db);

  const prices = await db.queryAny<any>(
    `SELECT vp.*, cu.code as currencycode, cu.displayname as currencyname, cu.symbol
     FROM variantprices vp
     JOIN currencies cu ON vp.currencyid = cu.id
     WHERE vp.variantid = ?
     ORDER BY cu.code ASC`,
    variantId
  );

  return c.json({ items: prices ?? [] }, 200);
});

// POST /v1/products/:id/variants/:variantId/prices
const upsertVariantPrice = createRoute({
  method: "post",
  path: "/{id}/variants/{variantId}/prices",
  tags: ["Products"],
  summary: "Set price for a variant in a specific currency",
  security: [{ bearerAuth: [] }],
  middleware: [adminOnly] as const,
  request: {
    params: VariantIdParam,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            currencyid: z.string().uuid(),
            pricecents: z.number().int().min(0),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ id: z.string(), pricecents: z.number() }) } },
      description: "Price upserted",
    },
  },
});

app.openapi(upsertVariantPrice, async (c) => {
  const { variantId } = c.req.valid("param");
  const { currencyid, pricecents } = c.req.valid("json");
  const db = getDb(c.var.db);

  const existing = await db.queryAny<{ id: string }>(
    `SELECT id FROM variantprices WHERE variantid = ? AND currencyid = ?`,
    variantId, currencyid
  );

  if (existing) {
    await db.run(
      `UPDATE variantprices SET pricecents = ?, updatedat = ? WHERE id = ?`,
      pricecents, now(), existing.id
    );
    return c.json({ id: existing.id, pricecents }, 200);
  }

  const id = uuid();
  await db.run(
    `INSERT INTO variantprices (id, variantid, currencyid, pricecents, createdat, updatedat)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id, variantId, currencyid, pricecents, now(), now()
  );
  return c.json({ id, pricecents }, 200);
});

// DELETE /v1/products/:id/variants/:variantId/prices/:currencyId
const deleteVariantPrice = createRoute({
  method: "delete",
  path: "/{id}/variants/{variantId}/prices/{currencyId}",
  tags: ["Products"],
  summary: "Remove price for a specific currency",
  security: [{ bearerAuth: [] }],
  middleware: [adminOnly] as const,
  request: { params: z.object({ id: z.string(), variantId: z.string(), currencyId: z.string() }) },
  responses: { 200: { content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } }, description: "Deleted" } },
});

app.openapi(deleteVariantPrice, async (c) => {
  const { variantId, currencyId } = c.req.valid("param");
  const db = getDb(c.var.db);
  await db.run(
    `DELETE FROM variantprices WHERE variantid = ? AND currencyid = ?`,
    variantId, currencyId
  );
  return c.json({ deleted: true }, 200);
});
```

### 3.2 — Interface Admin — Composant `VariantPrices`

```typescript
// apps/client/src/components/VariantPrices.tsx
import { useState, useEffect } from "react";
import { Button, Input } from "@heroui/react";
import { useSecuredApi } from "@/authentication";
import { formatMoney } from "@/utils/currency";

interface VariantPrice {
  id: string;
  currencyid: string;
  currencycode: string;
  currencyname: string;
  symbol: string;
  pricecents: number;
}

interface Currency {
  id: string;
  code: string;
  displayname: string;
}

interface Props {
  productId: string;
  variantId: string;
  basePriceCents: number; // variants.pricecents (USD)
}

export function VariantPrices({ productId, variantId, basePriceCents }: Props) {
  const { getJson, postJson, deleteJson } = useSecuredApi();
  const apiBase = (import.meta as any).env?.API_BASE_URL ?? "";

  const [prices, setPrices] = useState<VariantPrice[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, [variantId]);

  const loadData = async () => {
    const [pricesResp, currenciesResp] = await Promise.all([
      getJson(`${apiBase}/v1/products/${productId}/variants/${variantId}/prices`),
      getJson(`${apiBase}/v1/regions/currencies?limit=100`),
    ]);
    setPrices(pricesResp.items ?? []);
    setCurrencies(currenciesResp.items ?? []);
    // Initialiser les champs d'édition
    const initial: Record<string, string> = {};
    (pricesResp.items ?? []).forEach((p: VariantPrice) => {
      initial[p.currencyid] = String(p.pricecents);
    });
    setEditing(initial);
  };

  const handleSave = async (currencyId: string) => {
    const cents = parseInt(editing[currencyId] ?? "0", 10);
    await postJson(`${apiBase}/v1/products/${productId}/variants/${variantId}/prices`, {
      currencyid: currencyId,
      pricecents: cents,
    });
    await loadData();
  };

  const handleDelete = async (currencyId: string) => {
    if (!confirm("Supprimer ce prix ?")) return;
    await deleteJson(`${apiBase}/v1/products/${productId}/variants/${variantId}/prices/${currencyId}`);
    await loadData();
  };

  // Devises sans prix configuré
  const missingCurrencies = currencies.filter(
    (c) => !prices.find((p) => p.currencyid === c.id)
  );

  return (
    <div className="space-y-2 mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-default-500">
        Prix par devise
      </h4>

      {/* Prix de base (USD) — non modifiable ici */}
      <div className="flex items-center gap-3 p-2 rounded bg-default-50">
        <span className="font-mono text-xs w-12">USD</span>
        <span className="font-mono text-sm flex-1">
          {formatMoney(basePriceCents, "USD")} <span className="text-default-400 text-xs">(base)</span>
        </span>
      </div>

      {/* Prix configurés par devise */}
      {prices.map((price) => (
        <div key={price.currencyid} className="flex items-center gap-2">
          <span className="font-mono text-xs w-12">{price.currencycode}</span>
          <Input
            size="sm"
            type="number"
            className="flex-1"
            placeholder="centimes"
            value={editing[price.currencyid] ?? ""}
            onValueChange={(v) =>
              setEditing((prev) => ({ ...prev, [price.currencyid]: v }))
            }
            description={`= ${formatMoney(parseInt(editing[price.currencyid] ?? "0"), price.currencycode)}`}
          />
          <Button size="sm" color="primary" onPress={() => handleSave(price.currencyid)}>
            Sauver
          </Button>
          <Button size="sm" color="danger" variant="light" onPress={() => handleDelete(price.currencyid)}>
            ✕
          </Button>
        </div>
      ))}

      {/* Ajouter une devise manquante */}
      {missingCurrencies.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs cursor-pointer text-primary">
            + Ajouter une devise ({missingCurrencies.length} disponible(s))
          </summary>
          <div className="space-y-1 mt-2">
            {missingCurrencies.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="font-mono text-xs w-12">{c.code}</span>
                <Input
                  size="sm"
                  type="number"
                  placeholder="prix en centimes"
                  className="flex-1"
                  value={editing[c.id] ?? ""}
                  onValueChange={(v) =>
                    setEditing((prev) => ({ ...prev, [c.id]: v }))
                  }
                />
                <Button
                  size="sm"
                  color="primary"
                  isDisabled={!editing[c.id]}
                  onPress={() => handleSave(c.id)}
                >
                  Ajouter
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
```

---

## Phase 4 — UCP et route Test Order

**Priorité : P1**
**Fichiers concernés :** `routes/ucp.ts`, `routes/orders.ts`

### 4.1 — UCP : résolution du prix via `variantprices`

Dans `apps/merchant/src/routes/ucp.ts`, lors de la résolution des line items (POST et PUT checkout-sessions) :

```typescript
// AVANT ❌ — dans la boucle de résolution des items
const unitPrice = variant.pricecents; // ← toujours le prix USD

// APRÈS ✅ — importer le helper
import { resolveVariantPrice, getCurrencyIdForRegion } from "../lib/pricing";

// La devise de la session UCP est déjà dans `currency` (body ou session)
// Récupérer le currencyId de la table currencies:
const currencyRow = await db.queryAny<{ id: string }>(
  `SELECT id FROM currencies WHERE code = ? AND status = 'active'`,
  currency.toUpperCase()
);
const currencyId = currencyRow?.id ?? null;

// Dans la boucle:
const unitPrice = await resolveVariantPrice(db, variant.id, currencyId);
const totalPrice = unitPrice * quantity;
```

### 4.2 — Route Test Order : résolution du prix

Dans `apps/merchant/src/routes/orders.ts`, dans `createTestOrder` :

```typescript
// AVANT ❌ (~ligne 120)
subtotal += variant.pricecents * qty;
orderItems.push({
  sku,
  title: variant.title,
  qty,
  unitpricecents: variant.pricecents, // ← USD hardcodé
});

// APRÈS ✅
import { resolveVariantPrice, getCurrencyIdForRegion } from "../lib/pricing";

// Ajouter AVANT la boucle for(const {sku, qty} of items):
const currencyId = await getCurrencyIdForRegion(db, regionId);

// Dans la boucle:
const unitpricecents = await resolveVariantPrice(db, variant.id, currencyId);
subtotal += unitpricecents * qty;
orderItems.push({ sku, title: variant.title, qty, unitpricecents });
```

---

## Phase 5 — Cohérence de l'affichage Admin

**Priorité : P2**

### 5.1 — `customers.tsx` — affichage des montants commandes

```typescript
// AVANT ❌
const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Usage dans les stats:
<p>{formatCurrency(customerDetail.stats.totalspentcents)}</p>

// Dans les commandes récentes:
<p>{formatCurrency(order.amounts.totalcents)}</p>

// APRÈS ✅ — supprimer formatCurrency, utiliser le helper
import { formatMoney } from "@/utils/currency";

// Stats client — pas de devise connue → fallback USD temporaire
// TODO: ajouter customers.preferredcurrency dans l'API
<p>{formatMoney(customerDetail.stats.totalspentcents, "USD")}</p>

// Commandes récentes — order.amounts.currency est disponible dans l'API
<p>{formatMoney(order.amounts.totalcents, order.amounts.currency)}</p>
```

### 5.2 — `VariantResponse` dans `schemas.ts` — ajouter `currency`

```typescript
// apps/merchant/src/schemas.ts
// AVANT ❌
export const VariantResponse = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  title: z.string(),
  pricecents: z.number().int(),
  imageurl: z.string().nullable(),
});

// APRÈS ✅
export const VariantResponse = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  title: z.string(),
  pricecents: z.number().int(),
  currency: z.string().default("USD"), // ← ajouter
  imageurl: z.string().nullable(),
});
```

Et dans `catalog.ts`, lors du return des variants, inclure `currency` :

```typescript
return c.json({
  id: variant.id,
  sku: variant.sku,
  title: variant.title,
  pricecents: variant.pricecents,
  currency: variant.currency ?? "USD", // ← ajouter
  imageurl: variant.imageurl ?? null,
}, 200);
```

---

## Phase 6 — Validation et guards

**Priorité : P3**

### 6.1 — Empêcher la suppression d'une devise utilisée par une région active

Dans `apps/merchant/src/routes/regions.ts`, route `deleteCurrency` :

```typescript
// AVANT ❌ — suppression directe sans vérification
app.openapi(deleteCurrency, async (c) => {
  const { id } = c.req.valid("param");
  const db = getDb(c.var.db);
  // ...
  await db.run(`DELETE FROM currencies WHERE id = ?`, id);
  return c.json({ deleted: true }, 200);
});

// APRÈS ✅ — vérification avant suppression
app.openapi(deleteCurrency, async (c) => {
  const { id } = c.req.valid("param");
  const db = getDb(c.var.db);

  // Vérifier les régions actives utilisant cette devise
  const usedByRegion = await db.queryAny<{ id: string }>(
    `SELECT id FROM regions WHERE currencyid = ? AND status = 'active' LIMIT 1`,
    id
  );
  if (usedByRegion) {
    throw ApiError.conflict(
      "Cannot delete a currency used by an active region. " +
      "Deactivate or reassign the region first."
    );
  }

  // Vérifier les carts/orders ouverts dans cette devise
  const usedByCart = await db.queryAny<{ id: string }>(
    `SELECT c.id FROM carts c
     JOIN regions r ON c.regionid = r.id
     WHERE r.currencyid = ? AND c.status = 'open' LIMIT 1`,
    id
  );
  if (usedByCart) {
    throw ApiError.conflict(
      "Cannot delete a currency with open carts."
    );
  }

  await db.run(`DELETE FROM currencies WHERE id = ?`, id);
  return c.json({ deleted: true }, 200);
});
```

### 6.2 — Empêcher le changement de devise d'un cart non vide

Dans `checkout.ts` (si une route `PATCH /v1/carts/:cartId` existe ou sera créée) :

```typescript
// Guard à ajouter avant tout changement de région/devise sur un cart existant
const existingItems = await db.queryAny<{ count: number }>(
  `SELECT COUNT(*) as count FROM cartitems WHERE cartid = ?`,
  cartId
);

if (existingItems?.count > 0 && newRegionId !== cart.regionid) {
  throw ApiError.conflict(
    "Cannot change the region/currency of a cart that already contains items. " +
    "Clear the cart first."
  );
}
```

---

## Récapitulatif et ordre d'exécution

```
Sprint 1 (P0 — Bloquant)
├── Phase 0  : Créer utils/currency.ts + remplacer tous les $ hardcodés UI
└── Phase 2  : Corriger currency dans les appels Stripe (lineItems, coupons, shipping)

Sprint 2 (P1 — Important)
├── Phase 1  : Résolution variantprices dans addCartItems
└── Phase 4  : UCP et test order — utiliser resolveVariantPrice

Sprint 3 (P2 — Enrichissement)
├── Phase 3  : Routes API + UI admin pour prix multi-devises par variante
└── Phase 5  : VariantResponse schema + affichage admin cohérent

Sprint 4 (P3 — Qualité / Guards)
└── Phase 6  : Validation suppression devise + guard changement devise cart
```

### Dépendances entre phases

```
Phase 1 (pricing.ts helper) ──→ Phase 4 (UCP + test order l'utilise)
Phase 0 (utils/currency.ts) ──→ Phase 3 (VariantPrices UI) et Phase 5 (admin)
Phase 2 ──────────────────────→ indépendante, peut être faite en parallèle
Phase 6 ──────────────────────→ indépendante
```

---

*Document généré le 14 mars 2026 — SCTG Development*
*Fork : Fufuni/merchant — Extension multi-région + Auth0*
