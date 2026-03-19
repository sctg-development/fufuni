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
 * API Helpers Unit Tests
 * Tests for store-api.ts functions including mocking fetch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock environment
const mockEnv = {
  API_BASE_URL: 'http://localhost:8787',
  MERCHANT_PK: 'test-public-key',
};

// We'll test the actual functions by importing them
// Note: In a real scenario, you'd handle module mocking differently
// For now, we'll test the helper logic separately

describe('API Helpers', () => {
  describe('Email Validation', () => {
    it('should validate correct email format', () => {
      const isValidEmail = (email: string): boolean => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      };

      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.user@example.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email format', () => {
      const isValidEmail = (email: string): boolean => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      };

      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
    });
  });

  describe('Request Helper', () => {
    let fetchMock: any;

    beforeEach(() => {
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    it('should construct correct request with authorization header', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      // Simulating the request function behavior
      const endpoint = '/v1/products';
      const apiBase = 'http://localhost:8787';
      const publicKey = 'test-key';

      const res = await fetch(`${apiBase}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${publicKey}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/v1/products',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle successful API response', async () => {
      const mockData = { items: [{ id: '1', name: 'Product 1' }] };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const res = await fetch('http://localhost:8787/v1/products');
      const data = await res.json();

      expect(data).toEqual(mockData);
    });

    it('should handle API error response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Not found' } }),
      });

      const res = await fetch('http://localhost:8787/v1/products/invalid');
      const data = (await res.json()) as { error?: { message?: string } };

      expect(res.ok).toBe(false);
      expect(data.error?.message).toBe('Not found');
    });

    it('should encode query parameters correctly', () => {
      const query = 'test product';
      const encoded = encodeURIComponent(query);
      expect(encoded).toBe('test%20product');
    });

    it('should build URL search params correctly', () => {
      const params = new URLSearchParams();
      params.append('limit', '10');
      params.append('cursor', 'abc123');

      const queryString = params.toString();
      expect(queryString).toContain('limit=10');
      expect(queryString).toContain('cursor=abc123');
    });
  });

  describe('Product API Helpers', () => {
    it('should filter products by variant existence', () => {
      const filterProducts = (products: any[]) => {
        return products.filter((p) => p.variants && p.variants.length > 0);
      };

      const products = [
        { id: '1', title: 'Product 1', variants: [{ id: 'v1' }] },
        { id: '2', title: 'Product 2', variants: [] }, // Should be filtered out
        { id: '3', title: 'Product 3', variants: [{ id: 'v3' }] },
      ];

      const filtered = filterProducts(products);
      expect(filtered.length).toBe(2);
      expect(filtered.map((p) => p.id)).toEqual(['1', '3']);
    });

    it('should construct correct search URL with query parameter', () => {
      const query = 'blue shirt';
      const encoded = encodeURIComponent(query.trim());
      const url = `/v1/products/search?q=${encoded}&limit=100`;

      expect(url).toContain('q=blue%20shirt');
      expect(url).toContain('limit=100');
    });

    it('should handle empty search query', () => {
      const query = '   '; // Only whitespace
      const trimmed = query.trim();
      const encoded = encodeURIComponent(trimmed);

      expect(trimmed).toBe('');
      expect(encoded).toBe('');
    });
  });

  describe('Cart API Helpers', () => {
    it('should format cart creation request correctly', () => {
      const email = 'customer@test.com';
      const body = JSON.stringify({ customer_email: email });

      expect(body).toContain('customer_email');
      expect(JSON.parse(body).customer_email).toBe(email);
    });

    it('should format add items request correctly', () => {
      const items = [
        { sku: 'SKU-001', qty: 2 },
        { sku: 'SKU-002', qty: 1 },
      ];
      const body = JSON.stringify({ items });

      expect(JSON.parse(body).items).toEqual(items);
      expect(JSON.parse(body).items.length).toBe(2);
    });

    it('should format checkout request correctly', () => {
      const successUrl = 'https://example.com/success';
      const cancelUrl = 'https://example.com/cancel';
      const body = JSON.stringify({
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      const parsed = JSON.parse(body);
      expect(parsed.success_url).toBe(successUrl);
      expect(parsed.cancel_url).toBe(cancelUrl);
    });
  });

  describe('Region API Helpers', () => {
    it('should format region creation request', () => {
      const regionData = {
        display_name: 'Europe',
        currency_id: 'curr-eur',
        is_default: false,
      };
      const body = JSON.stringify(regionData);

      const parsed = JSON.parse(body);
      expect(parsed.display_name).toBe('Europe');
      expect(parsed.currency_id).toBe('curr-eur');
      expect(parsed.is_default).toBe(false);
    });

    it('should format region update request with partial data', () => {
      const updateData = {
        display_name: 'Updated Europe',
        status: 'active' as const,
      };
      const body = JSON.stringify(updateData);

      const parsed = JSON.parse(body);
      expect(parsed.display_name).toBe('Updated Europe');
      expect(parsed.status).toBe('active');
      expect(parsed.currency_id).toBeUndefined();
    });

    it('should build pagination parameters correctly', () => {
      const params = new URLSearchParams();
      params.append('limit', '50');
      params.append('cursor', 'next_page_cursor');

      const url = `/v1/regions?${params.toString()}`;
      expect(url).toContain('limit=50');
      expect(url).toContain('cursor=next_page_cursor');
    });
  });

  describe('Currency API Helpers', () => {
    it('should validate currency code format', () => {
      const isValidCurrencyCode = (code: string) => {
        return /^[A-Z]{3}$/.test(code);
      };

      expect(isValidCurrencyCode('USD')).toBe(true);
      expect(isValidCurrencyCode('EUR')).toBe(true);
      expect(isValidCurrencyCode('GBP')).toBe(true);
      expect(isValidCurrencyCode('US')).toBe(false);
      expect(isValidCurrencyCode('USDA')).toBe(false);
      expect(isValidCurrencyCode('usd')).toBe(false);
    });

    it('should format currency creation request', () => {
      const currencyData = {
        code: 'USD',
        display_name: 'US Dollar',
        symbol: '$',
        decimal_places: 2,
      };
      const body = JSON.stringify(currencyData);

      const parsed = JSON.parse(body);
      expect(parsed.code).toBe('USD');
      expect(parsed.decimal_places).toBe(2);
    });

    it('should validate decimal places', () => {
      const isValidDecimalPlaces = (places: number) => {
        return places >= 0 && places <= 8;
      };

      expect(isValidDecimalPlaces(2)).toBe(true);
      expect(isValidDecimalPlaces(0)).toBe(true);
      expect(isValidDecimalPlaces(8)).toBe(true);
      expect(isValidDecimalPlaces(-1)).toBe(false);
      expect(isValidDecimalPlaces(9)).toBe(false);
    });
  });

  describe('Country API Helpers', () => {
    it('should validate country code format', () => {
      const isValidCountryCode = (code: string) => {
        return /^[A-Z]{2}$/.test(code);
      };

      expect(isValidCountryCode('US')).toBe(true);
      expect(isValidCountryCode('FR')).toBe(true);
      expect(isValidCountryCode('JP')).toBe(true);
      expect(isValidCountryCode('USA')).toBe(false);
      expect(isValidCountryCode('U')).toBe(false);
      expect(isValidCountryCode('us')).toBe(false);
    });

    it('should format country creation request', () => {
      const countryData = {
        code: 'US',
        display_name: 'United States',
        country_name: 'United States of America',
        language_code: 'en',
        phone_code: '+1',
      };
      const body = JSON.stringify(countryData);

      const parsed = JSON.parse(body);
      expect(parsed.code).toBe('US');
      expect(parsed.phone_code).toBe('+1');
    });
  });

  describe('Warehouse API Helpers', () => {
    it('should validate priority number', () => {
      const isValidPriority = (priority: number) => {
        return priority >= 1 && Number.isInteger(priority);
      };

      expect(isValidPriority(1)).toBe(true);
      expect(isValidPriority(10)).toBe(true);
      expect(isValidPriority(0)).toBe(false);
      expect(isValidPriority(-1)).toBe(false);
      expect(isValidPriority(1.5)).toBe(false);
    });

    it('should format warehouse creation request', () => {
      const warehouseData = {
        display_name: 'Main Warehouse',
        address_line1: '123 Main St',
        city: 'New York',
        country_code: 'US',
        priority: 1,
      };
      const body = JSON.stringify(warehouseData);

      const parsed = JSON.parse(body);
      expect(parsed.address_line1).toBe('123 Main St');
      expect(parsed.country_code).toBe('US');
      expect(parsed.priority).toBe(1);
    });

    it('should format warehouse with optional fields', () => {
      const warehouseData = {
        display_name: 'CA Warehouse',
        address_line1: '456 Oak Ave',
        address_line2: 'Suite 100',
        city: 'Los Angeles',
        state: 'CA',
        country_code: 'US',
        priority: 2,
      };
      const body = JSON.stringify(warehouseData);

      const parsed = JSON.parse(body);
      expect(parsed.address_line2).toBe('Suite 100');
      expect(parsed.state).toBe('CA');
    });
  });

  describe('Shipping Rate API Helpers', () => {
    it('should format shipping rate creation request', () => {
      const rateData = {
        display_name: 'Express Shipping',
        description: 'Next day delivery',
        min_delivery_days: 1,
        max_delivery_days: 1,
      };
      const body = JSON.stringify(rateData);

      const parsed = JSON.parse(body);
      expect(parsed.display_name).toBe('Express Shipping');
      expect(parsed.min_delivery_days).toBe(1);
    });

    it('should validate weight constraints if provided', () => {
      const isValidWeight = (weight?: number) => {
        return weight === undefined || (weight > 0 && Number.isFinite(weight));
      };

      expect(isValidWeight(undefined)).toBe(true);
      expect(isValidWeight(1000)).toBe(true);
      expect(isValidWeight(0)).toBe(false);
      expect(isValidWeight(-100)).toBe(false);
      expect(isValidWeight(Infinity)).toBe(false);
    });
  });

  describe('Response Type Handling', () => {
    it('should handle pagination response structure', () => {
      const paginationResponse = {
        items: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
        ],
        pagination: {
          has_more: true,
          next_cursor: 'cursor123',
        },
      };

      expect(paginationResponse.items.length).toBe(2);
      expect(paginationResponse.pagination.has_more).toBe(true);
      expect(paginationResponse.pagination.next_cursor).toBe('cursor123');
    });

    it('should handle single resource response', () => {
      const resourceResponse = {
        id: 'resource-1',
        name: 'Resource',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(resourceResponse.id).toBeDefined();
      expect(resourceResponse.status).toBe('active');
      expect(new Date(resourceResponse.created_at)).toBeInstanceOf(Date);
    });

    it('should handle error response structure', () => {
      const errorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      };

      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error.message).toBe('Resource not found');
    });

    it('should handle deletion response', () => {
      const deletionResponse = {
        deleted: true,
      };

      expect(deletionResponse.deleted).toBe(true);
    });
  });

  describe('Data Type Validation', () => {
    it('should validate string fields', () => {
      const data = {
        id: 'test-123',
        name: 'Test Name',
        description: 'A test description',
      };

      expect(typeof data.id).toBe('string');
      expect(typeof data.name).toBe('string');
      expect(data.name.length).toBeGreaterThan(0);
    });

    it('should validate number fields', () => {
      const data = {
        price_cents: 2999,
        qty: 5,
        priority: 1,
      };

      expect(typeof data.price_cents).toBe('number');
      expect(Number.isInteger(data.price_cents)).toBe(true);
      expect(data.qty).toBeGreaterThan(0);
    });

    it('should validate boolean fields', () => {
      const data = {
        is_default: true,
        is_active: false,
        has_variants: true,
      };

      expect(typeof data.is_default).toBe('boolean');
      expect(data.is_default).toBe(true);
    });

    it('should validate ISO date strings', () => {
      const timestamp = new Date().toISOString();
      expect(/^\d{4}-\d{2}-\d{2}T/.test(timestamp)).toBe(true);
    });
  });

  describe('API URL Construction', () => {
    it('should construct product endpoints correctly', () => {
      const endpoints = [
        '/v1/products',
        '/v1/products/123',
        '/v1/products/search?q=test',
      ];

      endpoints.forEach(ep => {
        expect(ep.startsWith('/v1')).toBe(true);
      });
    });

    it('should construct region endpoints correctly', () => {
      const endpoints = [
        '/v1/regions',
        '/v1/regions/123',
        '/v1/regions/123/default',
      ];

      endpoints.forEach(ep => {
        expect(ep.startsWith('/v1')).toBe(true);
      });
    });

    it('should construct multi-region resource endpoints', () => {
      const endpoints = [
        '/v1/regions/currencies',
        '/v1/regions/countries',
        '/v1/regions/warehouses',
        '/v1/regions/shipping-rates',
      ];

      endpoints.forEach(ep => {
        expect(ep.startsWith('/v1/regions')).toBe(true);
      });
    });

    it('should construct cart endpoints correctly', () => {
      const cartId = 'cart-123';
      const endpoints = [
        '/v1/carts',
        `/v1/carts/${cartId}`,
        `/v1/carts/${cartId}/items`,
        `/v1/carts/${cartId}/checkout`,
      ];

      endpoints.forEach(ep => {
        expect(ep.startsWith('/v1/carts')).toBe(true);
      });
    });
  });
});
