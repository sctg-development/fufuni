import { Database } from '../db';
import { ApiError } from '../types';

/**
 * Calculates total tax amount for a cart based on shipping country and item tax codes.
 * Returns an array of tax details (name, amount, inclusive flag, and rate) and per-item rates.
 */
export async function calculateCartTaxes(db: Database, cartId: string, shippingCountry: string | null): Promise<{ 
    taxes: { name: string, amount_cents: number, tax_inclusive: boolean, rate_percentage: number }[],
    itemRates: Map<string, number> 
}> {
    if (!shippingCountry) return { taxes: [], itemRates: new Map() };

    // Retrieve cart's region and tax_inclusive setting
    const cart = await db.query<any>(`
        SELECT r.tax_inclusive 
        FROM carts c
        JOIN regions r ON c.region_id = r.id
        WHERE c.id = ?
    `, [cartId]);
    
    const taxInclusive = cart[0]?.tax_inclusive === 1;

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

    const taxResults: Map<string, { amount: number, rate: number }> = new Map();
    const itemRates: Map<string, number> = new Map();

    for (const item of items) {
        // Find applicable rate
        let applicableRate = rates.find(r => r.country_code === shippingCountry && r.tax_code === item.tax_code);
        if (!applicableRate) {
            applicableRate = rates.find(r => r.country_code === shippingCountry && r.tax_code === null);
        }
        if (!applicableRate) {
            applicableRate = rates.find(r => r.country_code === null && r.tax_code === item.tax_code);
        }
        if (!applicableRate) {
            applicableRate = rates.find(r => r.country_code === null && r.tax_code === null);
        }

        if (applicableRate) {
            itemRates.set(item.sku, applicableRate.rate_percentage);
            const lineTotal = item.unit_price_cents * item.qty;
            let taxAmount = 0;
            
            if (taxInclusive) {
                taxAmount = Math.round(lineTotal - (lineTotal / (1 + applicableRate.rate_percentage / 100)));
            } else {
                taxAmount = Math.round(lineTotal * (applicableRate.rate_percentage / 100));
            }
            
            const existing = taxResults.get(applicableRate.display_name) || { amount: 0, rate: applicableRate.rate_percentage };
            taxResults.set(applicableRate.display_name, { 
                amount: existing.amount + taxAmount,
                rate: applicableRate.rate_percentage 
            });
        } else {
            itemRates.set(item.sku, 0);
        }
    }

    const taxes = Array.from(taxResults.entries()).map(([name, data]) => ({
        name,
        amount_cents: data.amount,
        tax_inclusive: taxInclusive,
        rate_percentage: data.rate
    }));

    return { taxes, itemRates };
}
