#!/usr/bin/env npx tsx
/**
 * MIT License
 *
 * Copyright (c) 2025 ygwyg
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Seed script - creates demo data via the API
 *
 * Usage:
 *   npx tsx scripts/seed.ts <api_url> <admin_key>
 *   npx tsx scripts/seed.ts http://localhost:8787 sk_...
 */

// images are embedded as base64 so this file can run even after the PNGs are removed
import { imageMap } from './image_map';
import {
  EUROPEAN_COUNTRIES,
  UK_COUNTRIES,
  US_COUNTRIES,
  OTHER_COUNTRIES,
} from './seed-data';

// helper converting SKUs to the filenames we generated above
const skuToImage: Record<string, string> = {
  // tee variants all use the same image regardless of size
  'TEE-BLK-S': 'tee-black.png',
  'TEE-BLK-M': 'tee-black.png',
  'TEE-BLK-L': 'tee-black.png',
  'TEE-WHT-S': 'tee-white.png',
  'TEE-WHT-M': 'tee-white.png',
  'TEE-WHT-L': 'tee-white.png',
  // hoodies share by colour
  'HOOD-BLK-M': 'hoodie-black.png',
  'HOOD-BLK-L': 'hoodie-black.png',
  'HOOD-GRY-M': 'hoodie-white.png',
  'HOOD-GRY-L': 'hoodie-white.png',
  // caps
  'CAP-BLK': 'cap-black.png',
  'CAP-NVY': 'cap-navy.png',
  // sticker pack
  'STICKER-5PK': 'stickers.png',
};

const API_URL = process.argv[2] || 'http://localhost:8787';
const API_KEY = process.argv[3];

if (!API_KEY) {
  console.log(`
🌱 Seed Script - Create demo data

Usage:
  npx tsx scripts/seed.ts <api_url> <admin_key>

Example:
  npx tsx scripts/seed.ts http://localhost:8787 sk_abc123...

First, start the API and create a store:
  npm run dev
  # Then in browser or curl, the first request will prompt you to set up
`);
  process.exit(1);
}

async function api(path: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${path}: ${err.error?.message || res.statusText}`);
  }

  return res.json();
}

async function apiWithRetry(path: string, body?: any, maxRetries = 5): Promise<any> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await api(path, body);
    } catch (error: any) {
      const message = error.message;

      // Check if it's a rate limit error
      if (message.includes('Rate limit exceeded')) {
        // Extract wait time from message or use exponential backoff
        const match = message.match(/Try again in (\d+) seconds/);
        const waitTime = match ? parseInt(match[1]) * 1000 : Math.pow(2, attempt) * 1000;

        attempt++;
        console.log(`   ⏳ Rate limited. Waiting ${waitTime}ms before retry (attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  throw new Error(`Max retries exceeded for ${path}`);
}

/**
 * Convert cents at a given rate and round to the nearest cent.
 * Rates are expressed relative to EUR (base currency for seeded products).
 */
function convertCents(cents: number, rate: number): number {
  return Math.round(cents * rate);
}

const EUR_TO_USD = 1.14;
const EUR_TO_GBP = 0.86;

async function seedTaxes() {
  console.log('💰 Creating VAT rates...');
  const vatNames = JSON.stringify({
    'en-US': 'VAT',
    'fr-FR': 'TVA',
    'es-ES': 'IVA',
    'ar-SA': 'ضريبة القيمة المضافة',
    'zh-CN': '增值税',
    'he-IL': 'מע"מ',
  });

  const tax20 = await api('/v1/tax-rates', {
    display_name: vatNames,
    tax_code: 'txcd_99999999',
    rate_percentage: 20.0,
  });

  const tax5 = await api('/v1/tax-rates', {
    display_name: vatNames,
    tax_code: 'txcd_20010000', // Reduced VAT for food in France
    rate_percentage: 5.5,
  });

  return { tax20, tax5 };
}

async function seedRegions() {
  console.log('📋 Fetching existing currencies and countries...');

  // Fetch existing currencies
  const { items: currencies } = await api('/v1/regions/currencies');
  const currencyMap: Record<string, string> = {};
  for (const curr of currencies) {
    currencyMap[curr.code] = curr.id;
  }

  // Fetch all countries in one batch request (no pagination)
  const countriesResponse = await api('/v1/regions/countries/batch');
  const countryMap: Record<string, string> = {};

  for (const country of countriesResponse.items) {
    countryMap[country.code] = country.id;
  }

  // Debug: verify we have countries
  if (Object.keys(countryMap).length === 0) {
    console.error('❌ No countries found! Make sure to run init.ts first.');
    process.exit(1);
  }

  console.log(`   Found ${Object.keys(countryMap).length} countries in database`);

  // Log sample countries
  const sampleCodes = ['FR', 'GB', 'US', 'IT'];
  const missingCodes = sampleCodes.filter(code => !countryMap[code]);
  if (missingCodes.length > 0) {
    console.warn(`   ⚠️  Missing country codes: ${missingCodes.join(', ')}`);
  }

  console.log('🏢 Creating warehouses...');
  const warehouse_fr = await api('/v1/regions/warehouses', {
    display_name: 'France Distribution Center',
    address_line1: '218 route Notre Dame de la Gorge',
    city: 'Les Contamines-Montjoie',
    postal_code: '74170',
    country_code: 'FR',
    priority: 1,
  });

  const warehouse_it = await api('/v1/regions/warehouses', {
    display_name: 'Italy Distribution Center',
    address_line1: '17 piazza San Marco',
    city: 'Venezia',
    postal_code: '30124',
    country_code: 'IT',
    priority: 2,
  });

  console.log('💰 Seeding taxes...');
  await seedTaxes();

  console.log('📦 Creating shipping rates...');
  const shippingRate = await api('/v1/regions/shipping-rates', {
    display_name: 'Standard Shipping',
    description: 'Standard international shipping',
    min_delivery_days: 5,
    max_delivery_days: 10,
    tax_code: 'txcd_99999999',
    tax_inclusive: true,
  });

  // Add shipping rate prices for each currency
  await api(`/v1/regions/shipping-rates/${shippingRate.id}/prices`, {
    currency_id: currencyMap.EUR,
    amount_cents: 999, // €9.99
  });

  await api(`/v1/regions/shipping-rates/${shippingRate.id}/prices`, {
    currency_id: currencyMap.GBP,
    amount_cents: 799, // £7.99
  });

  await api(`/v1/regions/shipping-rates/${shippingRate.id}/prices`, {
    currency_id: currencyMap.USD,
    amount_cents: 1299, // $12.99
  });

  console.log('🗺️ Creating regions...');

  // Europe region
  const region_eu = await api('/v1/regions', {
    display_name: 'Europe',
    currency_id: currencyMap.EUR,
    is_default: true,
    tax_inclusive: true,
  });

  // Add countries to Europe
  for (const country of EUROPEAN_COUNTRIES) {
    const countryId = countryMap[country.code];
    if (!countryId) {
      console.warn(`   ⚠️  Country not found in database: ${country.code} (${country.display_name}). Skipping.`);
      continue;
    }
    await api(`/v1/regions/${region_eu.id}/countries`, {
      country_id: countryId,
    });
  }

  // Add warehouses to Europe
  await api(`/v1/regions/${region_eu.id}/warehouses`, { warehouse_id: warehouse_fr.id });
  await api(`/v1/regions/${region_eu.id}/warehouses`, { warehouse_id: warehouse_it.id });

  // Add shipping rates to Europe
  await api(`/v1/regions/${region_eu.id}/shipping-rates`, { shipping_rate_id: shippingRate.id });

  // UK region
  const region_uk = await api('/v1/regions', {
    display_name: 'United Kingdom',
    currency_id: currencyMap.GBP,
    is_default: false,
    tax_inclusive: true,
  });

  for (const country of UK_COUNTRIES) {
    const countryId = countryMap[country.code];
    if (!countryId) {
      console.warn(`   ⚠️  Country not found in database: ${country.code} (${country.display_name}). Skipping.`);
      continue;
    }
    await api(`/v1/regions/${region_uk.id}/countries`, {
      country_id: countryId,
    });
  }

  await api(`/v1/regions/${region_uk.id}/warehouses`, { warehouse_id: warehouse_fr.id });
  await api(`/v1/regions/${region_uk.id}/shipping-rates`, { shipping_rate_id: shippingRate.id });

  // US region
  const region_us = await api('/v1/regions', {
    display_name: 'North America',
    currency_id: currencyMap.USD,
    is_default: false,
    tax_inclusive: true,
  });

  for (const country of US_COUNTRIES) {
    const countryId = countryMap[country.code];
    if (!countryId) {
      console.warn(`   ⚠️  Country not found in database: ${country.code} (${country.display_name}). Skipping.`);
      continue;
    }
    await api(`/v1/regions/${region_us.id}/countries`, {
      country_id: countryId,
    });
  }

  await api(`/v1/regions/${region_us.id}/warehouses`, { warehouse_id: warehouse_it.id });
  await api(`/v1/regions/${region_us.id}/warehouses`, { warehouse_id: warehouse_fr.id });
  await api(`/v1/regions/${region_us.id}/shipping-rates`, { shipping_rate_id: shippingRate.id });

  // World region
  const region_world = await api('/v1/regions', {
    display_name: 'Rest of World',
    currency_id: currencyMap.EUR,
    is_default: false,
    tax_inclusive: true,
  });

  for (const country of OTHER_COUNTRIES) {
    const countryId = countryMap[country.code];
    if (!countryId) {
      console.warn(`   ⚠️  Country not found in database: ${country.code} (${country.display_name}). Skipping.`);
      continue;
    }
    await api(`/v1/regions/${region_world.id}/countries`, {
      country_id: countryId,
    });
  }

  await api(`/v1/regions/${region_world.id}/warehouses`, { warehouse_id: warehouse_fr.id });
  await api(`/v1/regions/${region_world.id}/shipping-rates`, { shipping_rate_id: shippingRate.id });

  return {
    warehouses: { fr: warehouse_fr.id, it: warehouse_it.id },
    regions: { eu: region_eu.id, uk: region_uk.id, us: region_us.id, world: region_world.id },
    currencyMap,
    shippingRate,
  };
}

async function seed() {
  console.log('🌱 Seeding demo data...\n');

  // Create regions and other data
  const regionData = await seedRegions();

  // Products
  const products = [
    {
      title: '{"en-US":"Classic Tee", "fr-FR":"T-Shirt Classique", "es-ES":"Camiseta Clásica","zh-CN":"经典T恤","ar-SA":"تي شيرت كلاسيكي" ,"he-IL":"טי שירט קלאסי" }',
      description: '{"en-US":"<p>Premium cotton t-shirt. Soft, breathable, and built to last, with our logo…</p>", "fr-FR":"<p>T-shirt en coton premium. Doux, respirant et conçu pour durer, avec notre logo…</p>", "es-ES":"<p>Camiseta de algodón premium. Suave, transpirable y duradera, con nuestro logo…</p>","zh-CN":"<p>优质棉质T恤。柔软、透气、经久耐用，印有我们的标志…</p>","ar-SA":"<p>تي شيرت قطني فاخر. ناعم، قابل للتنفس، ومصمم ليدوم طويلاً، مع شعارنا…</p>" ,"he-IL":"<p>חולצת טי כותנה פרימיום. רכה, נושמת ובנויה להחזיק מעמד, עם הלוגו שלנו…</p>" }',
      vendor: '{"en-US":"SCTG","fr-FR":"SCTG","es-ES":"SCTG","zh-CN":"SCTG","ar-SA":"SCTG","he-IL":"SCTG"}',
    },
    {
      title: '{"en-US":"Hoodie", "fr-FR":"Sweat à capuche", "es-ES":"Sudadera con capucha", "zh-CN":"连帽衫", "ar-SA":"هودي", "he-IL":"סווטשירט עם כובע" }',
      description: '{"en-US":"<p>Cozy pullover hoodie with large logo. Perfect for coding sessions…</p>","fr-FR":"<p>Sweat à capuche confortable avec grand logo. Parfait pour les sessions de codage…</p>", "es-ES":"<p>Sudadera con capucha cómoda y gran logo. Perfecta para sesiones de programación…</p>","zh-CN":"<p>舒适的连帽衫，带有大标志。非常适合编码会话…</p>","ar-SA":"<p>سويت بالكلاو مريح مع شعار كبير. مثالية لجلسات البرمجة…</p>" ,"he-IL":"<p>חולצת קפואה נוחה עם לוגו גדול. מושלמת לישיבות תכנות…</p>" }',
      vendor: '{"en-US":"SCTG","fr-FR":"SCTG","es-ES":"SCTG","zh-CN":"SCTG","ar-SA":"SCTG","he-IL":"SCTG"}',
    },
    {
      title: '{"en-US":"Cap", "fr-FR":"Casquette", "es-ES":"Gorra", "zh-CN":"棒球帽", "ar-SA":"قبعة", "he-IL":"כובע" }',
      description: '{"en-US":"<p><strong>Embroidered</strong> baseball cap with logo. One size fits all heads…</p>", "fr-FR":"<p>Casquette de baseball brodée avec logo. Une taille convient à toutes les têtes…</p>", "es-ES":"<p>Gorra de béisbol bordada con logo. Talla única para todas las cabezas…</p>","zh-CN":"<p>刺绣棒球帽，带有标志。适合所有头型…</p>","ar-SA":"<p>قبعة بيسبول مخيطة بشعار. مقاس واحد يناسب جميع الرؤوس…</p>" ,"he-IL":"<p>כובע בייסבול רקום עם לוגו. גודל אחד מתאים לכל הראש…</p>" }',
      vendor: '{"en-US":"SCTG","fr-FR":"SCTG","es-ES":"SCTG","zh-CN":"SCTG","ar-SA":"SCTG","he-IL":"SCTG"}',
    },
    {
      title: '{"en-US":"Sticker Pack", "fr-FR":"Pack d’autocollants", "es-ES":"Paquete de pegatinas", "zh-CN":"贴纸包", "ar-SA":"مجموعة ملصقات", "he-IL":"חבילת מדבקות" }',
      description: '{"en-US":"<p>Set of 5 die-cut vinyl stickers. Beautiful, waterproof and durable…</p>", "fr-FR":"<p>Ensemble de 5 autocollants en vinyle découpés. Beaux, imperméables et durables…</p>", "es-ES":"<p>Set de 5 pegatinas de vinilo recortadas. Hermosas, impermeables y duraderas…</p>","zh-CN":"<p>5件套模切乙烯基贴纸。美观、防水且耐用…</ p>","ar-SA":"<p>مجموعة من 5 ملصقات فينيل مقطوعة. جميلة، مقاومة للماء ومتينة…</ p>" ,"he-IL":"< p>סט של 5 מדבקות ויניל חתוכות. יפות, עמידות למים ועמידות…</ p>" }',
      vendor: '{"en-US":"SCTG","fr-FR":"SCTG","es-ES":"SCTG","zh-CN":"SCTG","ar-SA":"SCTG","he-IL":"SCTG"}',
    },
  ];

  const variants: Record<string, any[]> = {
    'Classic Tee': [
      { sku: 'TEE-BLK-S', title: 'Black / S', price_cents: 2999, weight_g: 180, stock: 50 },
      { sku: 'TEE-BLK-M', title: 'Black / M', price_cents: 2999, weight_g: 200, stock: 75 },
      { sku: 'TEE-BLK-L', title: 'Black / L', price_cents: 2999, weight_g: 220, stock: 60 },
      { sku: 'TEE-WHT-S', title: 'White / S', price_cents: 2999, weight_g: 180, stock: 40 },
      { sku: 'TEE-WHT-M', title: 'White / M', price_cents: 2999, weight_g: 200, stock: 55 },
      { sku: 'TEE-WHT-L', title: 'White / L', price_cents: 2999, weight_g: 220, stock: 45 },
    ],
    Hoodie: [
      { sku: 'HOOD-BLK-M', title: 'Black / M', price_cents: 5999, weight_g: 520, stock: 30 },
      { sku: 'HOOD-BLK-L', title: 'Black / L', price_cents: 5999, weight_g: 560, stock: 25 },
      { sku: 'HOOD-GRY-M', title: 'Gray / M', price_cents: 5999, weight_g: 520, stock: 20 },
      { sku: 'HOOD-GRY-L', title: 'Gray / L', price_cents: 5999, weight_g: 560, stock: 15 },
    ],
    Cap: [
      { sku: 'CAP-BLK', title: 'Black', price_cents: 2499, weight_g: 120, stock: 100 },
      { sku: 'CAP-NVY', title: 'Navy', price_cents: 2499, weight_g: 120, stock: 80 },
    ],
    'Sticker Pack': [
      { sku: 'STICKER-5PK', title: '5 Pack', price_cents: 999, weight_g: 30, stock: 200 },
    ],
  };

  // Helper `JSON.parse` wrapper to avoid throwing on invalid JSON
  const safeJsonParse = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  for (const prod of products) {
    const rawTitle = prod.title;

    // Normalize title to a canonical key used in the `variants` map.
    // `prod.title` can be a plain string or a JSON string representing a locale map.
    const parsedTitleObj =
      typeof rawTitle === 'string' && rawTitle.trim().startsWith('{')
        ? safeJsonParse(rawTitle)
        : null;

    const titleObj =
      typeof rawTitle === 'object' && rawTitle !== null
        ? rawTitle
        : parsedTitleObj || null;

    const titleKey =
      typeof rawTitle === 'string' && !titleObj
        ? rawTitle
        : (titleObj && (titleObj['en-US'] || Object.values(titleObj)[0])) ||
        (typeof rawTitle === 'string' ? rawTitle : String(rawTitle));

    const displayTitle =
      (titleObj && (titleObj['en-US'] || Object.values(titleObj)[0])) ||
      (typeof rawTitle === 'string' ? rawTitle : String(rawTitle));

    console.log(`📦 Creating ${displayTitle}...`);

    // Send only the supported product fields to the API (exclude our helper keys if any)
    const { handle, ...productPayload } = prod as any;
    const product = await api('/v1/products', productPayload);

    const productVariants = variants[titleKey];
    if (!productVariants) {
      throw new Error(`No variants defined for product title key: ${titleKey}`);
    }

    for (const v of productVariants) {
      const { stock, ...variant } = v;

      // attach an image if we know which file corresponds to this SKU
      const imgFile = skuToImage[variant.sku];
      if (imgFile) {
        variant.image_url = imageMap[imgFile];
      }

      console.log(`   └─ ${variant.sku}`);

      // Create variant (base price is in EUR)
      const createdVariant = await api(`/v1/products/${product.id}/variants`, {
        ...variant,
        currency: 'EUR',
        tax_code: 'txcd_99999999',
      });

      // Add EUR/USD/GBP prices based on fixed conversion rates (EUR is the base currency here)
      const eurCurrencyId = regionData.currencyMap?.EUR;
      const usdCurrencyId = regionData.currencyMap?.USD;
      const gbpCurrencyId = regionData.currencyMap?.GBP;

      if (eurCurrencyId) {
        await api(`/v1/products/${product.id}/variants/${createdVariant.id}/prices`, {
          currency_id: eurCurrencyId,
          price_cents: variant.price_cents,
        });
      }

      if (usdCurrencyId) {
        await api(`/v1/products/${product.id}/variants/${createdVariant.id}/prices`, {
          currency_id: usdCurrencyId,
          price_cents: convertCents(variant.price_cents, EUR_TO_USD),
        });
      }
      if (gbpCurrencyId) {
        await api(`/v1/products/${product.id}/variants/${createdVariant.id}/prices`, {
          currency_id: gbpCurrencyId,
          price_cents: convertCents(variant.price_cents, EUR_TO_GBP),
        });
      }

      // Add warehouse inventory
      // Special case: 10 TEE-BLK-S in Italy, rest in France
      if (variant.sku === 'TEE-BLK-S') {
        // 10 in Italy
        await api(`/v1/inventory/${encodeURIComponent(variant.sku)}/warehouse-adjust`, {
          warehouse_id: regionData.warehouses.it,
          delta: 10,
          reason: 'restock',
        });
        // Rest (40, 35, 10) in France based on sizes
        const stock_fr = stock - 10;
        await api(`/v1/inventory/${encodeURIComponent(variant.sku)}/warehouse-adjust`, {
          warehouse_id: regionData.warehouses.fr,
          delta: stock_fr,
          reason: 'restock',
        });
      } else {
        // All other SKUs go to France warehouse
        await api(`/v1/inventory/${encodeURIComponent(variant.sku)}/warehouse-adjust`, {
          warehouse_id: regionData.warehouses.fr,
          delta: stock,
          reason: 'restock',
        });
      }
    }
  };

  // Create test orders across different regions
  console.log('\n🛒 Creating test orders...');

  // Addresses for each test customer/region
  const addressesByRegion: Record<string, Record<string, any>> = {
    eu: {
      'sarah@eu.example.com': {
        name: 'Sarah Dupont',
        line1: '123 Rue de la Paix',
        city: 'Paris',
        postal_code: '75001',
        country: 'FR',
      },
      'mike@eu.example.com': {
        name: 'Mike Schmidt',
        line1: '456 Hauptstrasse',
        city: 'Berlin',
        postal_code: '10115',
        country: 'DE',
      },
      'emma@eu.example.com': {
        name: 'Emma García',
        line1: '789 Calle Principal',
        city: 'Madrid',
        postal_code: '28001',
        country: 'ES',
      },
      'oliver@eu.example.com': {
        name: 'Oliver Rossi',
        line1: '321 Via Roma',
        city: 'Roma',
        postal_code: '00184',
        country: 'IT',
      },
    },
    uk: {
      'james@uk.example.com': {
        name: 'James Williams',
        line1: '100 Oxford Street',
        city: 'London',
        state: 'England',
        postal_code: 'W1D 1LL',
        country: 'GB',
      },
      'olivia@uk.example.com': {
        name: 'Olivia Brown',
        line1: '50 Regent Street',
        city: 'Manchester',
        state: 'England',
        postal_code: 'M1 1JQ',
        country: 'GB',
      },
    },
    us: {
      'noah@us.example.com': {
        name: 'Noah Johnson',
        line1: '1600 Pennsylvania Avenue NW',
        city: 'Washington',
        state: 'DC',
        postal_code: '20500',
        country: 'US',
      },
      'ava@us.example.com': {
        name: 'Ava Smith',
        line1: '350 5th Avenue',
        city: 'New York',
        state: 'NY',
        postal_code: '10118',
        country: 'US',
      },
    },
  };

  const testOrdersByRegion: Record<string, Array<{ customer_email: string; items: Array<{ sku: string; qty: number }> }>> = {
    eu: [
      {
        customer_email: 'sarah@eu.example.com',
        items: [
          { sku: 'TEE-BLK-M', qty: 2 },
          { sku: 'CAP-BLK', qty: 1 },
        ],
      },
      {
        customer_email: 'mike@eu.example.com',
        items: [{ sku: 'HOOD-BLK-L', qty: 1 }],
      },
      {
        customer_email: 'emma@eu.example.com',
        items: [
          { sku: 'TEE-WHT-S', qty: 1 },
          { sku: 'TEE-WHT-M', qty: 1 },
          { sku: 'CAP-NVY', qty: 2 },
        ],
      },
      {
        customer_email: 'oliver@eu.example.com',
        items: [
          { sku: 'STICKER-5PK', qty: 3 },
          { sku: 'TEE-BLK-S', qty: 1 },
        ],
      },
    ],
    uk: [
      {
        customer_email: 'james@uk.example.com',
        items: [
          { sku: 'HOOD-GRY-M', qty: 1 },
          { sku: 'TEE-BLK-L', qty: 2 },
        ],
      },
      {
        customer_email: 'olivia@uk.example.com',
        items: [{ sku: 'CAP-BLK', qty: 1 }],
      },
    ],
    us: [
      {
        customer_email: 'noah@us.example.com',
        items: [
          { sku: 'TEE-BLK-S', qty: 1 },
          { sku: 'TEE-WHT-L', qty: 1 },
          { sku: 'HOOD-BLK-M', qty: 1 },
        ],
      },
      {
        customer_email: 'ava@us.example.com',
        items: [{ sku: 'HOOD-GRY-L', qty: 2 }],
      },
    ],
  };

  // Create orders for each region
  for (const [regionKey, orders] of Object.entries(testOrdersByRegion)) {
    const regionId = regionData.regions[regionKey as keyof typeof regionData.regions];
    const shippingRateId = regionData.shippingRate.id; // from seedRegions()

    // Use region-specific shipping prices
    let shippingCents = 999; // EUR default
    if (regionKey === 'uk') shippingCents = 799; // GBP
    if (regionKey === 'us') shippingCents = 1299; // USD

    for (const order of orders) {
      const address = addressesByRegion[regionKey]?.[order.customer_email];

      const result = await api('/v1/orders/test', {
        ...order,
        region_id: regionId,
        shipping_address: address,
        shipping_rate_id: shippingRateId,
        shipping_cents: shippingCents,
        stripe_checkout_session_id: `cs_test_${Math.random().toString(36).substr(2, 20).toUpperCase()}`,
        stripe_payment_intent_id: `pi_test_${Math.random().toString(36).substr(2, 20).toUpperCase()}`,
      });
      const itemsSummary = order.items.map((i) => `${i.qty}x ${i.sku}`).join(', ');
      console.log(`   └─ [${regionKey.toUpperCase()}] ${result.number}: ${order.customer_email} (${itemsSummary})`);
    }
  }

  console.log('\n✅ Done! Demo data created.\n');

  // Show summary
  const { items: allProducts } = await api('/v1/products');
  const { items: allOrders } = await api('/v1/orders');
  console.log(`Products: ${allProducts.length}`);
  console.log(
    `Variants: ${allProducts.reduce((sum: number, p: any) => sum + p.variants.length, 0)}`
  );
  console.log(`Orders: ${allOrders.length}`);

  const totalRevenue = allOrders.reduce((sum: number, o: any) => sum + o.amounts.total_cents, 0);
  console.log(`Revenue: $${(totalRevenue / 100).toFixed(2)}`);

  console.log(`\n📊 Admin dashboard: cd admin && npm run dev`);
  console.log(`   Connect with: ${API_URL}`);
}

seed().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
