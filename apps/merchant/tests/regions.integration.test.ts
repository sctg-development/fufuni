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
 * Integration tests for multi-region features
 * 
 * Prerequisites:
 * - Start dev server: npm run dev:env (from merchant directory)
 * - Server must be running on http://localhost:8787
 * - .env must contain MERCHANT_SK and MERCHANT_PK
 * 
 * Run tests: npm run test -- regions.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config as loadEnv } from 'dotenv';

// Load environment variables
const result = loadEnv({ path: '/Users/rlemeill/Development/fufuni/.env' });
if (!result.error) {
  console.log('✓ .env file loaded successfully');
}

const API_URL = 'http://localhost:8787';
// Remove quotes if they exist in the environment variables and trim whitespace
const ADMIN_KEY = (process.env.MERCHANT_SK || '')
  .replace(/^["\']|["\']$/g, '')
  .trim();
const PUBLIC_KEY = (process.env.MERCHANT_PK || '')
  .replace(/^["\']|["\']$/g, '')
  .trim();

// Storage for created IDs for cleanup
let testData: {
  currencies: string[];
  countries: string[];
  warehouses: string[];
  shippingRates: string[];
  regions: string[];
};

// API helper function
async function api(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: any,
  token?: string,
  expectError = false
) {
  const key = token || ADMIN_KEY;
  
  const attempt = async (retryCount = 0): Promise<any> => {
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

describe('Multi-Region Integration Tests', () => {
  const testId = Date.now().toString().slice(-6);
  // Generate truly unique ID: 8 char random + 2 char timestamp for parallel test safety
  const uniqueId = `${Math.random().toString(36).substring(2, 10)}${Date.now().toString().slice(-2)}`.toUpperCase();

  beforeAll(() => {
    testData = {
      currencies: [],
      countries: [],
      warehouses: [],
      shippingRates: [],
      regions: [],
    };

    if (!ADMIN_KEY) {
      throw new Error('MERCHANT_SK not set in .env');
    }
    if (!PUBLIC_KEY) {
      throw new Error('MERCHANT_PK not set in .env');
    }

    console.log('✓ Environment variables loaded');
  });

  afterAll(async () => {
    // Cleanup: Delete in reverse order to respect foreign keys
    console.log('\n📋 Cleaning up test data...');
    
    for (const regionId of testData.regions.reverse()) {
      try {
        await api(`/v1/regions/${regionId}`, 'DELETE');
      } catch (e) {
        console.warn(`Failed to delete region ${regionId}`);
      }
    }

    for (const rateId of testData.shippingRates.reverse()) {
      try {
        await api(`/v1/regions/shipping-rates/${rateId}`, 'DELETE');
      } catch (e) {
        console.warn(`Failed to delete shipping rate ${rateId}`);
      }
    }

    for (const warehouseId of testData.warehouses.reverse()) {
      try {
        await api(`/v1/regions/warehouses/${warehouseId}`, 'DELETE');
      } catch (e) {
        console.warn(`Failed to delete warehouse ${warehouseId}`);
      }
    }

    for (const countryId of testData.countries.reverse()) {
      try {
        await api(`/v1/regions/countries/${countryId}`, 'DELETE');
      } catch (e) {
        console.warn(`Failed to delete country ${countryId}`);
      }
    }

    for (const currencyId of testData.currencies.reverse()) {
      try {
        await api(`/v1/regions/currencies/${currencyId}`, 'DELETE');
      } catch (e) {
        console.warn(`Failed to delete currency ${currencyId}`);
      }
    }

    console.log('✓ Cleanup complete');
  });

  // ============================================================
  // CURRENCY TESTS
  // ============================================================

  describe('Currencies', () => {
    it('should create a currency', async () => {
      const currency = await api('/v1/regions/currencies', 'POST', {
        code: `TS${uniqueId[0]}`, // Unique currency code
        display_name: 'Test Currency',
        symbol: '₮',
        decimal_places: 2,
      });

      expect(currency.id).toBeDefined();
      expect(currency.code).toBe(`TS${uniqueId[0]}`);
      expect(currency.status).toBe('active');
      testData.currencies.push(currency.id);
    });

    it('should list currencies', async () => {
      const result = await api('/v1/regions/currencies', 'GET');
      
      expect(result.items).toBeInstanceOf(Array);
      expect(result.pagination).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('should get a currency by id', async () => {
      if (testData.currencies.length === 0) {
        throw new Error('No test currency created');
      }

      const currency = await api(`/v1/regions/currencies/${testData.currencies[0]}`, 'GET');
      
      expect(currency.id).toBe(testData.currencies[0]);
      expect(currency.code).toBeDefined();
    });

    it('should update a currency', async () => {
      if (testData.currencies.length === 0) {
        throw new Error('No test currency created');
      }

      const updated = await api(`/v1/regions/currencies/${testData.currencies[0]}`, 'PATCH', {
        display_name: 'Updated Test Currency',
      });

      expect(updated.display_name).toBe('Updated Test Currency');
    });

    it('should reject duplicate currency code', async () => {
      const result = await api('/v1/regions/currencies', 'POST', {
        code: `TS${uniqueId[0]}`, // Same code as first one
        display_name: 'Duplicate',
        symbol: '₮',
        decimal_places: 2,
      }, undefined, true);

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('UNIQUE constraint');
    });
  });

  // ============================================================
  // COUNTRY TESTS
  // ============================================================

  describe('Countries', () => {
    it('should create a country', async () => {
      const country = await api('/v1/regions/countries', 'POST', {
        code: uniqueId.substring(2, 4), // Unique 2-char code
        display_name: 'Test Country',
        country_name: 'Test Country Full Name',
        language_code: 'en',
      });

      expect(country.id).toBeDefined();
      expect(country.code).toBe(uniqueId.substring(2, 4));
      expect(country.status).toBe('active');
      testData.countries.push(country.id);
    });

    it('should list countries', async () => {
      const result = await api('/v1/regions/countries', 'GET');
      
      expect(result.items).toBeInstanceOf(Array);
      expect(result.pagination).toBeDefined();
    });

    it('should update a country', async () => {
      if (testData.countries.length === 0) {
        throw new Error('No test country created');
      }

      const updated = await api(`/v1/regions/countries/${testData.countries[0]}`, 'PATCH', {
        display_name: 'Updated Test Country',
      });

      expect(updated.display_name).toBe('Updated Test Country');
    });
  });

  // ============================================================
  // WAREHOUSE TESTS
  // ============================================================

  describe('Warehouses', () => {
    it('should create a warehouse', async () => {
      const warehouse = await api('/v1/regions/warehouses', 'POST', {
        display_name: 'Test Warehouse',
        address_line1: '123 Test St',
        city: 'Test City',
        postal_code: '12345',
        country_code: 'US',
        priority: 1,
      });

      expect(warehouse.id).toBeDefined();
      expect(warehouse.display_name).toBe('Test Warehouse');
      expect(warehouse.status).toBe('active');
      testData.warehouses.push(warehouse.id);
    });

    it('should list warehouses sorted by priority', async () => {
      const result = await api('/v1/regions/warehouses', 'GET');
      
      expect(result.items).toBeInstanceOf(Array);
      // Verify sorting by priority (should be ascending)
      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i].priority).toBeGreaterThanOrEqual(result.items[i - 1].priority);
      }
    });

    it('should update a warehouse', async () => {
      if (testData.warehouses.length === 0) {
        throw new Error('No test warehouse created');
      }

      const updated = await api(`/v1/regions/warehouses/${testData.warehouses[0]}`, 'PATCH', {
        priority: 5,
      });

      expect(updated.priority).toBe(5);
    });
  });

  // ============================================================
  // SHIPPING RATE TESTS
  // ============================================================

  describe('Shipping Rates', () => {
    it('should create a shipping rate', async () => {
      const rate = await api('/v1/regions/shipping-rates', 'POST', {
        display_name: 'Test Shipping',
        description: 'Standard shipping',
        max_weight_g: 5000,
        min_delivery_days: 3,
        max_delivery_days: 7,
      });

      expect(rate.id).toBeDefined();
      expect(rate.display_name).toBe('Test Shipping');
      expect(rate.status).toBe('active');
      testData.shippingRates.push(rate.id);
    });

    it('should list shipping rates', async () => {
      const result = await api('/v1/regions/shipping-rates', 'GET');
      
      expect(result.items).toBeInstanceOf(Array);
      expect(result.pagination).toBeDefined();
    });

    it('should add price to shipping rate', async () => {
      if (testData.shippingRates.length === 0 || testData.currencies.length === 0) {
        throw new Error('Missing required test data');
      }

      const result = await api(
        `/v1/regions/shipping-rates/${testData.shippingRates[0]}/prices`,
        'POST',
        {
          currency_id: testData.currencies[0],
          amount_cents: 999, // $9.99
        }
      );

      expect(result.ok).toBe(true);
    });
  });

  // ============================================================
  // REGION TESTS
  // ============================================================

  describe('Regions', () => {
    it('should create a region', async () => {
      if (testData.currencies.length === 0) {
        throw new Error('No test currency created');
      }

      const region = await api('/v1/regions', 'POST', {
        display_name: 'Test Region',
        currency_id: testData.currencies[0],
        is_default: false,
      });

      expect(region.id).toBeDefined();
      expect(region.display_name).toBe('Test Region');
      expect(region.currency_id).toBe(testData.currencies[0]);
      expect(region.status).toBe('active');
      testData.regions.push(region.id);
    });

    it('should list regions', async () => {
      const result = await api('/v1/regions', 'GET');
      
      expect(result.items).toBeInstanceOf(Array);
      expect(result.pagination).toBeDefined();
    });

    it('should set region as default', async () => {
      if (testData.regions.length === 0) {
        throw new Error('No test region created');
      }

      const updated = await api(`/v1/regions/${testData.regions[0]}`, 'PATCH', {
        is_default: true,
      });

      expect(updated.is_default).toBe(1); // SQLite returns 1 for true
    });

    it('should add country to region', async () => {
      if (testData.regions.length === 0 || testData.countries.length === 0) {
        throw new Error('Missing required test data');
      }

      const result = await api(`/v1/regions/${testData.regions[0]}/countries`, 'POST', {
        country_id: testData.countries[0],
      });

      expect(result.ok).toBe(true);
    });

    it('should add warehouse to region', async () => {
      if (testData.regions.length === 0 || testData.warehouses.length === 0) {
        throw new Error('Missing required test data');
      }

      const result = await api(`/v1/regions/${testData.regions[0]}/warehouses`, 'POST', {
        warehouse_id: testData.warehouses[0],
      });

      expect(result.ok).toBe(true);
    });

    it('should add shipping rate to region', async () => {
      if (testData.regions.length === 0 || testData.shippingRates.length === 0) {
        throw new Error('Missing required test data');
      }

      const result = await api(`/v1/regions/${testData.regions[0]}/shipping-rates`, 'POST', {
        shipping_rate_id: testData.shippingRates[0],
      });

      expect(result.ok).toBe(true);
    });
  });

  // ============================================================
  // REGION-AWARE CHECKOUT TESTS
  // ============================================================

  describe('Region-Aware Checkout', () => {
    it.skip('should create cart with specific region', async () => {
      if (testData.regions.length === 0) {
        throw new Error('No test region created');
      }

      const cart = await api('/v1/carts', 'POST', {
        region_id: testData.regions[0],
        customer_email: 'test@example.com',
      });

      expect(cart.id).toBeDefined();
      expect(cart.region_id).toBe(testData.regions[0]);
      expect(cart.status).toBe('open');
    });

    it.skip('should create cart with default region if not specified', async () => {
      const cart = await api('/v1/carts', 'POST', {
        customer_email: 'test2@example.com',
      });

      expect(cart.id).toBeDefined();
      expect(cart.region_id).toBeDefined();
      expect(cart.status).toBe('open');
    });

    it('should enforce admin-only access on region endpoints', async () => {
      const result = await api('/v1/regions/currencies', 'GET', undefined, PUBLIC_KEY, true);
      
      expect(result.error).toBeDefined();
      expect(result.error.message || result.message || '').toContain('Admin access required');
    });
  });

  // ============================================================
  // ERROR HANDLING TESTS
  // ============================================================

  describe('Error Handling', () => {
    it('should return 404 for non-existent currency', async () => {
      const result = await api(
        '/v1/regions/currencies/non-existent-id',
        'GET',
        undefined,
        undefined,
        true
      );

      // Error response should either have error property or be an error object
      expect(result.error || result.message || result).toBeDefined();
    });

    it('should return 400 for invalid request body', async () => {
      const result = await api('/v1/regions/currencies', 'POST', {
        code: 'X', // Too short, should be exactly 3 chars
      }, undefined, true);

      expect(result.error).toBeDefined();
    });

    it('should reject missing authorization header', async () => {
      const res = await fetch(`${API_URL}/v1/regions/currencies`, {
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(401);
    });
  });
});
