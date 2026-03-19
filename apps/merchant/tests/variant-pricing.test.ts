/**
 * MIT License
 *
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
 * Variant Pricing Integration Tests
 * Tests for multi-currency variant pricing routes and pricing resolution
 * 
 * Prerequisites:
 * - Start dev server: npm run dev:env (from merchant directory)
 * - Server must be running on http://localhost:8787
 * - .env must contain MERCHANT_SK and MERCHANT_PK
 * 
 * Run tests: npm run test -- variant-pricing.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '/Users/rlemeill/Development/fufuni/.env' });

const API_URL = 'http://localhost:8787';
const ADMIN_KEY = (process.env.MERCHANT_SK || '')
  .replace(/^["\']|["\']$/g, '')
  .trim();
const PUBLIC_KEY = (process.env.MERCHANT_PK || '')
  .replace(/^["\']|["\']$/g, '')
  .trim();

interface TestData {
  currencies: string[];
  countries: string[];
  warehouses: string[];
  shippingRates: string[];
  regions: string[];
  products: string[];
  variants: string[];
}

let testData: TestData;

// API helper function with rate limit handling
async function api<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: any,
  token?: string,
  expectError = false
): Promise<T> {
  const key = token || ADMIN_KEY;
  
  const attempt = async (retryCount = 0): Promise<T> => {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok && !expectError) {
      const errorData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      
      // Handle rate limiting (429)
      if (res.status === 429 && retryCount < 5) {
        const message = errorData.error?.message || '';
        const match = message.match(/Try again in (\d+) seconds/);
        const waitSeconds = match ? parseInt(match[1]) : 5;
        
        console.log(`⏳ Rate limited. Waiting ${waitSeconds}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        return attempt(retryCount + 1);
      }
      
      throw new Error(`${method} ${path} failed: ${res.status} ${JSON.stringify(errorData)}`);
    }

    return res.json();
  };
  
  return attempt();
}

describe('Variant Pricing Integration Tests', () => {
  const testId = Date.now().toString().slice(-6);
  // Generate truly unique ID: 8 char random + 2 char timestamp for parallel test safety
  const uniqueId = `${Math.random().toString(36).substring(2, 10)}${Date.now().toString().slice(-2)}`.toUpperCase();

  beforeAll(async () => {
    testData = {
      currencies: [],
      countries: [],
      warehouses: [],
      shippingRates: [],
      regions: [],
      products: [],
      variants: [],
    };

    if (!ADMIN_KEY) throw new Error('MERCHANT_SK not set in .env');
    if (!PUBLIC_KEY) throw new Error('MERCHANT_PK not set in .env');

    console.log('✓ Setting up test data for variant pricing...');

    // Create 2 currencies for testing with unique codes (exactly 3 chars)
    const usdRes = await api('/v1/regions/currencies', 'POST', {
      code: `US${uniqueId[0]}`,
      display_name: 'Test USD',
      symbol: '$',
      decimal_places: 2,
    });
    testData.currencies.push(usdRes.id);

    const eurRes = await api('/v1/regions/currencies', 'POST', {
      code: `EU${uniqueId[1]}`,
      display_name: 'Test EUR',
      symbol: '€',
      decimal_places: 2,
    });
    testData.currencies.push(eurRes.id);

    // Create country with unique code (exactly 2 chars)
    const countryCode = uniqueId.substring(2, 4);
    const countryRes = await api('/v1/regions/countries', 'POST', {
      code: countryCode,
      display_name: `Test Country ${testId}`,
      country_name: `Test Country ${testId}`,
      language_code: 'en',
    });
    testData.countries.push(countryRes.id);

    // Create warehouse
    const warehouseRes = await api('/v1/regions/warehouses', 'POST', {
      display_name: `Test Warehouse ${testId}`,
      address_line1: '123 Test St',
      city: 'Test City',
      postal_code: '12345',
      country_code: countryCode,
      priority: 1,
    });
    testData.warehouses.push(warehouseRes.id);

    // Create shipping rate
    const shippingRes = await api('/v1/regions/shipping-rates', 'POST', {
      display_name: 'Standard',
      rate_code: `STD${uniqueId.substring(4, 6)}`,
      sort_order: 1,
    });
    testData.shippingRates.push(shippingRes.id);

    // Add prices to shipping rate for both currencies
    await api(
      `/v1/regions/shipping-rates/${shippingRes.id}/prices`,
      'POST',
      { currency_id: usdRes.id, amount_cents: 1000 }
    );
    await api(
      `/v1/regions/shipping-rates/${shippingRes.id}/prices`,
      'POST',
      { currency_id: eurRes.id, amount_cents: 900 }
    );

    // Create region
    const regionRes = await api('/v1/regions', 'POST', {
      display_name: 'Test Region',
      currency_id: usdRes.id,
    });
    testData.regions.push(regionRes.id);

    await api(`/v1/regions/${regionRes.id}/warehouses`, 'POST', {
      warehouse_id: warehouseRes.id,
    });

    await api(`/v1/regions/${regionRes.id}/shipping-rates`, 'POST', {
      shipping_rate_id: shippingRes.id,
    });

    // Create product
    const productRes = await api('/v1/products', 'POST', {
      title: 'Test Product',
      description: 'Test product for pricing',
    });
    testData.products.push(productRes.id);

    // Create variant
    const variantRes = await api(`/v1/products/${productRes.id}/variants`, 'POST', {
      sku: `SKU${testId}`,
      title: 'Test Variant',
      price_cents: 2999,
    });
    testData.variants.push(variantRes.id);

    console.log('✓ Test data setup complete');
  });

  afterAll(async () => {
    console.log('\n📋 Cleaning up test data...');

    for (const variantId of testData.variants.reverse()) {
      try {
        const [variant] = await api(`/v1/products/${testData.products[0]}/variants/${variantId}`, 'GET');
        if (variant?.sku) {
          await api(`/v1/inventory/${encodeURIComponent(variant.sku)}`, 'DELETE', undefined, ADMIN_KEY, true);
        }
      } catch (e) {
        // Ignore
      }
    }

    for (const productId of testData.products.reverse()) {
      try {
        await api(`/v1/products/${productId}`, 'DELETE');
      } catch (e) {
        // Ignore
      }
    }

    for (const regionId of testData.regions.reverse()) {
      try {
        await api(`/v1/regions/${regionId}`, 'DELETE');
      } catch (e) {
        // Ignore
      }
    }

    for (const rateId of testData.shippingRates.reverse()) {
      try {
        await api(`/v1/regions/shipping-rates/${rateId}`, 'DELETE');
      } catch (e) {
        // Ignore
      }
    }

    for (const warehouseId of testData.warehouses.reverse()) {
      try {
        await api(`/v1/regions/warehouses/${warehouseId}`, 'DELETE');
      } catch (e) {
        // Ignore
      }
    }

    for (const countryId of testData.countries.reverse()) {
      try {
        await api(`/v1/regions/countries/${countryId}`, 'DELETE');
      } catch (e) {
        // Ignore
      }
    }

    for (const currencyId of testData.currencies.reverse()) {
      try {
        await api(`/v1/regions/currencies/${currencyId}`, 'DELETE');
      } catch (e) {
        // Ignore
      }
    }

    console.log('✓ Cleanup complete');
  });

  describe('Variant Pricing Management', () => {
    it('should list empty prices for new variant', async () => {
      const result = await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices`,
        'GET'
      );

      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(0);
    });

    it('should upsert price for first currency', async () => {
      const result = await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices`,
        'POST',
        {
          currency_id: testData.currencies[0],
          price_cents: 2999,
        }
      );

      expect(result.id).toBeDefined();
      expect(result.price_cents).toBe(2999);
    });

    it('should upsert price for second currency', async () => {
      const result = await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices`,
        'POST',
        {
          currency_id: testData.currencies[1],
          price_cents: 2699,
        }
      );

      expect(result.id).toBeDefined();
      expect(result.price_cents).toBe(2699);
    });

    it('should list prices for variant with both currencies', async () => {
      const result = await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices`,
        'GET'
      );

      expect(result.items).toBeDefined();
      expect(result.items.length).toBe(2);

      // Check both currency prices exist
      const currencyIds = result.items.map((p: any) => p.currency_id);
      expect(currencyIds).toContain(testData.currencies[0]);
      expect(currencyIds).toContain(testData.currencies[1]);

      // Check prices
      const usdPrice = result.items.find((p: any) => p.currency_id === testData.currencies[0]);
      const eurPrice = result.items.find((p: any) => p.currency_id === testData.currencies[1]);

      expect(usdPrice.price_cents).toBe(2999);
      expect(eurPrice.price_cents).toBe(2699);
    });

    it('should update existing price when upserting', async () => {
      // First upsert
      await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices`,
        'POST',
        {
          currency_id: testData.currencies[0],
          price_cents: 1999,
        }
      );

      // Verify update
      const result = await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices`,
        'GET'
      );

      const updatedPrice = result.items.find((p: any) => p.currency_id === testData.currencies[0]);
      expect(updatedPrice.price_cents).toBe(1999);
    });

    it('should delete price for currency', async () => {
      // Delete EUR price
      const deleteResult = await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices/${testData.currencies[1]}`,
        'DELETE'
      );

      expect(deleteResult.deleted).toBe(true);

      // Verify deletion
      const listResult = await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices`,
        'GET'
      );

      expect(listResult.items.length).toBe(1);
      expect(listResult.items[0].currency_id).toBe(testData.currencies[0]);
    });

    it('should reject invalid currency ID', async () => {
      const result = await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices`,
        'POST',
        {
          currency_id: 'invalid-id',
          price_cents: 2999,
        },
        undefined,
        true
      );

      expect(result.error).toBeDefined();
    });

    it('should reject invalid variant ID', async () => {
      const result = await api(
        `/v1/products/${testData.products[0]}/variants/invalid-variant/prices`,
        'GET',
        undefined,
        undefined,
        true
      );

      expect(result.error).toBeDefined();
    });

    it('should require admin authorization for pricing routes', async () => {
      const result = await api(
        `/v1/products/${testData.products[0]}/variants/${testData.variants[0]}/prices`,
        'POST',
        {
          currency_id: testData.currencies[0],
          price_cents: 2999,
        },
        PUBLIC_KEY,
        true
      );

      // Public key should be rejected
      expect(result.error).toBeDefined();
    });
  });

  describe('Multi-Devise Cart & Checkout Flow', () => {
    it('should create cart with pricing in default region currency', async () => {
      const cart = await api('/v1/carts', 'POST', {
        region_id: testData.regions[0],
        customer_email: 'multi@test.com',
      });

      expect(cart.id).toBeDefined();
      expect(cart.region_id).toBe(testData.regions[0]);
    });

    it('should include currency in variant response', async () => {
      const product = await api(`/v1/products/${testData.products[0]}`, 'GET');

      expect(product.variants).toBeDefined();
      expect(product.variants.length > 0).toBe(true);

      const variant = product.variants[0];
      expect(variant.currency).toBeDefined();
      expect(typeof variant.currency).toBe('string');
    });

    it('should store currency correctly in cart items', async () => {
      const cart = await api('/v1/carts', 'POST', {
        region_id: testData.regions[0],
        customer_email: 'cart-currency@test.com',
      });

      // Get cart details
      const cartDetails = await api(`/v1/carts/${cart.id}`, 'GET');

      expect(cartDetails.currency).toBeDefined();
      expect(typeof cartDetails.currency).toBe('string');
    });
  });
});
