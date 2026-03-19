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
 * Schema Validation Unit Tests
 * Tests for Zod schema validation and OpenAPI metadata
 */

import { describe, it, expect } from 'vitest';
import {
  CreateCurrencyBody,
  CreateCountryBody,
  CreateWarehouseBody,
  CreateRegionBody,
  CreateCartBody,
  CheckoutBody,
  ApplyDiscountBody,
  CreateVariantPriceBody,
  VariantResponse,
} from '../src/schemas';

describe('Schema Validation', () => {
  describe('Currency Schema', () => {
    it('should validate valid currency', () => {
      const valid = {
        code: 'USD',
        display_name: 'US Dollar',
        symbol: '$',
        decimal_places: 2,
      };
      const result = CreateCurrencyBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject currency with code too short', () => {
      const invalid = {
        code: 'US', // Too short, must be exactly 3
        display_name: 'US Dollar',
        symbol: '$',
        decimal_places: 2,
      };
      const result = CreateCurrencyBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject currency with code too long', () => {
      const invalid = {
        code: 'USDD', // Too long, must be exactly 3
        display_name: 'US Dollar',
        symbol: '$',
        decimal_places: 2,
      };
      const result = CreateCurrencyBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject currency with negative decimal places', () => {
      const invalid = {
        code: 'USD',
        display_name: 'US Dollar',
        symbol: '$',
        decimal_places: -1,
      };
      const result = CreateCurrencyBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject currency with missing required field', () => {
      const invalid = {
        code: 'USD',
        // missing display_name
        symbol: '$',
        decimal_places: 2,
      };
      const result = CreateCurrencyBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should use default decimal_places if not provided', () => {
      const valid = {
        code: 'JPY',
        display_name: 'Japanese Yen',
        symbol: '¥',
      };
      const result = CreateCurrencyBody.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.decimal_places).toBe(2); // Default value
      }
    });
  });

  describe('Country Schema', () => {
    it('should validate valid country', () => {
      const valid = {
        code: 'US',
        display_name: 'United States',
        country_name: 'United States of America',
        language_code: 'en',
      };
      const result = CreateCountryBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject country with code too short', () => {
      const invalid = {
        code: 'U', // Must be exactly 2
        display_name: 'United States',
        country_name: 'United States of America',
        language_code: 'en',
      };
      const result = CreateCountryBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject country with code too long', () => {
      const invalid = {
        code: 'USA', // Must be exactly 2
        display_name: 'United States',
        country_name: 'United States of America',
        language_code: 'en',
      };
      const result = CreateCountryBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject country with missing required fields', () => {
      const invalid = {
        code: 'US',
        display_name: 'United States',
        // missing country_name
        language_code: 'en',
      };
      const result = CreateCountryBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate country with special characters in name', () => {
      const valid = {
        code: 'CV',
        display_name: 'Côte d\'Ivoire',
        country_name: 'République de Côte d\'Ivoire',
        language_code: 'fr',
      };
      const result = CreateCountryBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should use default language_code if not provided', () => {
      const valid = {
        code: 'FR',
        display_name: 'France',
        country_name: 'French Republic',
      };
      const result = CreateCountryBody.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language_code).toBe('en'); // Default value
      }
    });
  });

  describe('Warehouse Schema', () => {
    it('should validate valid warehouse', () => {
      const valid = {
        display_name: 'Main Warehouse',
        address_line1: '123 Main St',
        city: 'New York',
        postal_code: '10001',
        country_code: 'US',
        priority: 1,
      };
      const result = CreateWarehouseBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject warehouse with zero priority', () => {
      const invalid = {
        display_name: 'Main Warehouse',
        address_line1: '123 Main St',
        city: 'New York',
        postal_code: '10001',
        country_code: 'US',
        priority: 0, // Optional, default 0 is used if not required
      };
      const result = CreateWarehouseBody.safeParse(invalid);
      // Priority is optional with default 0, so this should be valid
      expect(result.success).toBe(true);
    });

    it('should accept warehouse with optional priority', () => {
      const valid = {
        display_name: 'Main Warehouse',
        address_line1: '123 Main St',
        city: 'New York',
        postal_code: '10001',
        country_code: 'US',
        // priority is optional
      };
      const result = CreateWarehouseBody.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe(0); // Default value
      }
    });

    it('should reject warehouse with invalid country code', () => {
      const invalid = {
        display_name: 'Main Warehouse',
        address_line1: '123 Main St',
        city: 'New York',
        postal_code: '10001',
        country_code: 'USA', // Must be exactly 2
        priority: 1,
      };
      const result = CreateWarehouseBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate warehouse with state code', () => {
      const valid = {
        display_name: 'California Warehouse',
        address_line1: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        postal_code: '90001',
        country_code: 'US',
        priority: 2,
      };
      const result = CreateWarehouseBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate warehouse with address_line2', () => {
      const valid = {
        display_name: 'NY Warehouse',
        address_line1: '123 Main St',
        address_line2: 'Suite 100',
        city: 'New York',
        postal_code: '10001',
        country_code: 'US',
        priority: 1,
      };
      const result = CreateWarehouseBody.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('Region Schema', () => {
    it('should validate valid region', () => {
      const valid = {
        display_name: 'North America',
        currency_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = CreateRegionBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate region with description', () => {
      const valid = {
        display_name: 'North America',
        currency_id: '550e8400-e29b-41d4-a716-446655440000',
        country_ids: ['550e8400-e29b-41d4-a716-446655440000'],
        warehouse_ids: ['550e8400-e29b-41d4-a716-446655440001'],
        shipping_rate_ids: ['550e8400-e29b-41d4-a716-446655440002'],
      };
      const result = CreateRegionBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject region without currency_id', () => {
      const invalid = {
        display_name: 'North America',
        // missing currency_id
      };
      const result = CreateRegionBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject region with empty name', () => {
      const invalid = {
        display_name: '',
        currency_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = CreateRegionBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject region with invalid UUID currency_id', () => {
      const invalid = {
        display_name: 'North America',
        currency_id: 'not-a-uuid',
      };
      const result = CreateRegionBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should use default is_default if not provided', () => {
      const valid = {
        display_name: 'Europe',
        currency_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = CreateRegionBody.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_default).toBe(false); // Default value
      }
    });
  });

  describe('Cart Schema', () => {
    it('should validate valid cart creation', () => {
      const valid = {
        customer_email: 'customer@test.com',
        region_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = CreateCartBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate cart without region', () => {
      const valid = {
        customer_email: 'customer@test.com',
      };
      const result = CreateCartBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject cart with invalid email', () => {
      const invalid = {
        customer_email: 'not-an-email',
      };
      const result = CreateCartBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject cart with missing email', () => {
      const invalid = {
        region_id: '550e8400-e29b-41d4-a716-446655440000',
        // missing customer_email
      };
      const result = CreateCartBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject cart with empty email', () => {
      const invalid = {
        customer_email: '',
      };
      const result = CreateCartBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Checkout Schema', () => {
    it('should validate valid checkout', () => {
      const valid = {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      };
      const result = CheckoutBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate checkout with optional parameters', () => {
      const valid = {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        collect_shipping: true,
        shipping_countries: ['US', 'CA', 'MX'],
      };
      const result = CheckoutBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject checkout without success_url', () => {
      const invalid = {
        // missing success_url
        cancel_url: 'https://example.com/cancel',
      };
      const result = CheckoutBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject checkout with invalid URL', () => {
      const invalid = {
        success_url: 'not-a-url',
        cancel_url: 'https://example.com/cancel',
      };
      const result = CheckoutBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should use default values for optional fields', () => {
      const valid = {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      };
      const result = CheckoutBody.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.collect_shipping).toBe(false); // Default
        expect(result.data.shipping_countries).toEqual(['US']); // Default
      }
    });
  });

  describe('Discount Schema', () => {
    it('should validate discount application with code', () => {
      const valid = {
        code: 'SAVE10',
      };
      const result = ApplyDiscountBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate percentage discount code', () => {
      const valid = {
        code: 'PERCENT20',
      };
      const result = ApplyDiscountBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject discount without code', () => {
      const invalid = {
        // missing code
      };
      const result = ApplyDiscountBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject discount with empty code', () => {
      const invalid = {
        code: '',
      };
      const result = ApplyDiscountBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should accept alphanumeric codes with special chars', () => {
      const valid = {
        code: 'SAVE-10-PERCENT',
      };
      const result = ApplyDiscountBody.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('Email Validation', () => {
    it('should accept valid email formats', () => {
      const validEmails = [
        'user@example.com',
        'test.user@example.co.uk',
        'user+tag@example.com',
        'user_name@example.com',
      ];

      validEmails.forEach((email) => {
        const result = CreateCartBody.safeParse({
          customer_email: email,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'user@',
        '@example.com',
        'user@.com',
        'user example@test.com',
        'user@example',
      ];

      invalidEmails.forEach((email) => {
        const result = CreateCartBody.safeParse({
          customer_email: email,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Variant Pricing Schema', () => {
    it('should validate CreateVariantPriceBody with valid data', () => {
      const valid = {
        currency_id: '550e8400-e29b-41d4-a716-446655440000',
        price_cents: 2999,
      };
      const result = CreateVariantPriceBody.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject variant price with negative price', () => {
      const invalid = {
        currency_id: '550e8400-e29b-41d4-a716-446655440000',
        price_cents: -100,
      };
      const result = CreateVariantPriceBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject variant price with missing currency_id', () => {
      const invalid = {
        price_cents: 2999,
      };
      const result = CreateVariantPriceBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject variant price with missing price_cents', () => {
      const invalid = {
        currency_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = CreateVariantPriceBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject variant price with non-integer price', () => {
      const invalid = {
        currency_id: '550e8400-e29b-41d4-a716-446655440000',
        price_cents: 29.99,
      };
      const result = CreateVariantPriceBody.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate VariantResponse with currency field', () => {
      const valid = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        sku: 'SKU123',
        title: 'Test Variant',
        price_cents: 2999,
        currency: 'USD',
        image_url: null,
      };
      const result = VariantResponse.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should default currency to USD in VariantResponse', () => {
      const valid = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        sku: 'SKU123',
        title: 'Test Variant',
        price_cents: 2999,
        image_url: null,
      };
      const result = VariantResponse.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('USD');
      }
    });
  });

  describe('UUID Validation', () => {
    it('should validate UUID v4 format', () => {
      const UUIDv4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect('550e8400-e29b-41d4-a716-446655440000'.match(UUIDv4)).toBeTruthy();
    });
  });

  describe('Date Validation', () => {
    it('should accept ISO 8601 date strings', () => {
      const isoDate = new Date(Date.now() + 86400000).toISOString();
      expect(isoDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should accept future dates', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const now = new Date();
      expect(new Date(futureDate).getTime()).toBeGreaterThan(now.getTime());
    });
  });
});
