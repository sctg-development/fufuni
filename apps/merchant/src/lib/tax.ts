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

import { Database } from '../db';
import { ApiError } from '../types';

/**
 * Calculates total tax amount for a cart based on shipping country and item tax codes.
 * Returns an array of tax details (name, amount, inclusive flag, and rate), per-item rates,
 * and the calculated HT shipping amount.
 */
export async function calculateCartTaxes(db: Database, cartId: string, shippingCountry: string | null): Promise<{
    taxes: { name: string, amount_cents: number, tax_inclusive: boolean, rate_percentage: number }[],
    itemRates: Map<string, number>,
    shipping_ht_cents: number
}> {
    if (!shippingCountry) return { taxes: [], itemRates: new Map(), shipping_ht_cents: 0 };

    // Retrieve cart's region, tax_inclusive setting, and shipping details
    const cartData = await db.query<any>(`
        SELECT r.tax_inclusive as region_tax_inclusive, c.shipping_cents, sr.tax_code as shipping_tax_code, sr.tax_inclusive as shipping_tax_inclusive
        FROM carts c
        JOIN regions r ON c.region_id = r.id
        LEFT JOIN shipping_rates sr ON c.shipping_rate_id = sr.id
        WHERE c.id = ?
    `, [cartId]);

    if (cartData.length === 0) return { taxes: [], itemRates: new Map(), shipping_ht_cents: 0 };
    const { region_tax_inclusive, shipping_cents, shipping_tax_code, shipping_tax_inclusive } = cartData[0];
    const regionTaxInclusive = region_tax_inclusive === 1;

    // Retrieve items and their associated variant tax codes
    const items = await db.query<any>(`
        SELECT ci.qty, ci.unit_price_cents, ci.sku, v.tax_code 
        FROM cart_items ci
        JOIN variants v ON ci.sku = v.sku
        WHERE ci.cart_id = ?
    `, [cartId]);

    // Retrieve active tax rates for the target country (or default rates where country is NULL)
    const rates = await db.query<any>(`
        SELECT display_name, tax_code, rate_percentage, country_code
        FROM tax_rates 
        WHERE status = 'active' 
        AND (country_code = ? OR country_code IS NULL)
        ORDER BY country_code DESC
    `, [shippingCountry]);

    const taxResults: Map<string, { amount: number, rate: number, inclusive: boolean }> = new Map();
    const itemRates: Map<string, number> = new Map();

    // Helper to find applicable rate
    const findRate = (taxCode: string | null) => {
        let rate = rates.find(r => r.country_code === shippingCountry && r.tax_code === taxCode);
        if (!rate) {
            rate = rates.find(r => r.country_code === shippingCountry && r.tax_code === null);
        }
        if (!rate) {
            rate = rates.find(r => r.country_code === null && r.tax_code === taxCode);
        }
        if (!rate) {
            rate = rates.find(r => r.country_code === null && r.tax_code === null);
        }
        return rate;
    };

    for (const item of items) {
        const applicableRate = findRate(item.tax_code);

        if (applicableRate) {
            itemRates.set(item.sku, applicableRate.rate_percentage);
            const lineTotal = item.unit_price_cents * item.qty;
            let taxAmount = 0;

            if (regionTaxInclusive) {
                taxAmount = Math.round(lineTotal - (lineTotal / (1 + applicableRate.rate_percentage / 100)));
            } else {
                taxAmount = Math.round(lineTotal * (applicableRate.rate_percentage / 100));
            }

            const groupKey = `${applicableRate.display_name}_${regionTaxInclusive}`;
            const existing = taxResults.get(groupKey) || { amount: 0, rate: applicableRate.rate_percentage, inclusive: regionTaxInclusive };
            taxResults.set(groupKey, {
                amount: existing.amount + taxAmount,
                rate: applicableRate.rate_percentage,
                inclusive: regionTaxInclusive
            });
        } else {
            itemRates.set(item.sku, 0);
        }
    }

    let shippingHtCents = shipping_cents || 0;

    // Calculate tax on shipping if applicable
    if (shipping_cents > 0 && shipping_tax_code) {
        const shippingRate = findRate(shipping_tax_code);
        if (shippingRate) {
            const isShippingTTC = shipping_tax_inclusive === 1;
            let taxAmount = 0;
            if (isShippingTTC) {
                shippingHtCents = Math.round(shipping_cents / (1 + shippingRate.rate_percentage / 100));
                taxAmount = shipping_cents - shippingHtCents;
            } else {
                taxAmount = Math.round(shipping_cents * (shippingRate.rate_percentage / 100));
            }

            const groupKey = `${shippingRate.display_name}_${isShippingTTC}`;
            const existing = taxResults.get(groupKey) || { amount: 0, rate: shippingRate.rate_percentage, inclusive: isShippingTTC };
            taxResults.set(groupKey, {
                amount: existing.amount + taxAmount,
                rate: shippingRate.rate_percentage,
                inclusive: isShippingTTC
            });
        }
    }

    const taxes = Array.from(taxResults.entries()).map(([key, data]) => {
        const name = key.split('_')[0];
        return {
            name,
            amount_cents: data.amount,
            tax_inclusive: data.inclusive,
            rate_percentage: data.rate
        };
    });

    return { taxes, itemRates, shipping_ht_cents: shippingHtCents };
}
