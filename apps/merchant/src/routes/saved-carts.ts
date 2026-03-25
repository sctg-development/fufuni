/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: MIT
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
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { customerAuthMiddleware } from '../middleware/customer-auth';
import { getDb } from '../db';
import { ApiError, type HonoEnv } from '../types';
import { getUserMetadata, updateUserMetadata } from '../lib/auth0';
import { CartItem, CartTotals, CartResponse } from '../schemas';

const app = new OpenAPIHono<HonoEnv>();
app.use('*', customerAuthMiddleware);

/**
 * SavedCartSnapshot — Complete cart snapshot stored in Auth0 user_metadata
 * Allows reconstruction of cart without database fetch
 */
export interface SavedCartSnapshot {
  id: string;
  items: z.infer<typeof CartItem>[];
  totals: z.infer<typeof CartTotals>;
  currency: string;
  customer_email: string;
  status: 'open' | 'checked_out' | 'expired';
  expires_at: string;
  saved_at: string;
}

/**
 * Saved cart schema for responses
 */
const savedCartSchema = z.object({
  id: z.number(),
  auth0_user_id: z.string(),
  cart_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const savedCartsListSchema = z.array(savedCartSchema);

const normalizeStoreUrl = (storeUrl?: string): string | undefined => {
  if (!storeUrl) return undefined;
  const normalized = storeUrl.replace(/\/$/, '');
  return normalized || undefined;
};

/**
 * Create a SavedCartSnapshot from a full CartResponse
 */
function createCartSnapshot(cart: any): SavedCartSnapshot {
  return {
    id: cart.id,
    items: cart.items,
    totals: cart.totals,
    currency: cart.currency,
    customer_email: cart.customer_email,
    status: cart.status,
    expires_at: cart.expires_at,
    saved_at: new Date().toISOString(),
  };
}

const readSavedCartsFromMetadata = (userMetadata: Record<string, any> = {}, storeUrl?: string): SavedCartSnapshot[] => {
  const key = normalizeStoreUrl(storeUrl);
  const storeMetadata = key && userMetadata[key] && typeof userMetadata[key] === 'object' ? userMetadata[key] : undefined;

  if (Array.isArray(storeMetadata?.saved_carts)) {
    return storeMetadata.saved_carts;
  }

  if (Array.isArray(userMetadata.saved_carts)) {
    return userMetadata.saved_carts;
  }

  return [];
};

const writeSavedCartsToMetadata = (
  userMetadata: Record<string, any> = {},
  storeUrl: string | undefined,
  savedCarts: SavedCartSnapshot[]
): Record<string, any> => {
  const key = normalizeStoreUrl(storeUrl);

  if (!key) {
    return { ...userMetadata, saved_carts: savedCarts };
  }

  const existingStoreMetadata = userMetadata[key] && typeof userMetadata[key] === 'object' ? { ...userMetadata[key] } : {};
  return {
    ...userMetadata,
    [key]: {
      ...existingStoreMetadata,
      saved_carts: savedCarts,
    },
  };
};

/**
 * GET /v1/me/saved-carts — list all saved carts for the authenticated user
 */
const getSavedCartsRoute = createRoute({
  method: 'get',
  path: '/me/saved-carts',
  tags: ['Saved Carts'],
  summary: 'List saved carts',
  security: [{ bearerAuth: ["valid jwt"] }],
  description: 'Returns all saved carts associated with the authenticated user.',
  responses: {
    200: {
      description: 'Saved carts retrieved',
      content: {
        'application/json': {
          schema: savedCartsListSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

app.openapi(getSavedCartsRoute, async (c) => {
  try {
    const auth = c.get('auth') as any;
    const userId = auth?.sub;

    if (!userId) {
      throw ApiError.unauthorized('No Auth0 user ID in token');
    }

    const db = getDb(c.var.db);
    const savedCarts = await db.query(
      `SELECT id, auth0_user_id, cart_id, created_at, updated_at 
       FROM saved_carts 
       WHERE auth0_user_id = ? 
       ORDER BY updated_at DESC`,
      [userId]
    );

    return c.json(savedCarts, 200);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('Error fetching saved carts:', error);
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /v1/me/saved-carts — save the current cart
 */
const savecartRoute = createRoute({
  method: 'post',
  path: '/me/saved-carts',
  tags: ['Saved Carts'],
  summary: 'Save a cart',
  security: [{ bearerAuth: ["valid jwt"] }],
  description: 'Associates the current cart with the authenticated user account.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ cartId: z.string() }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Cart saved',
      content: {
        'application/json': {
          schema: savedCartSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    400: { description: 'Bad request' },
    500: { description: 'Internal error' },
  },
});

app.openapi(savecartRoute, async (c) => {
  try {
    const auth = c.get('auth') as any;
    const userId = auth?.sub;

    if (!userId) {
      throw ApiError.unauthorized('No Auth0 user ID in token');
    }

    const { cartId } = (await c.req.json()) as { cartId: string };

    if (!cartId) {
      throw ApiError.invalidRequest('cartId is required');
    }

    const db = getDb(c.var.db);

    // Fetch full cart data
    const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);

    if (!cart) {
      throw ApiError.notFound('Cart not found');
    }

    // Fetch cart items
    const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);

    // Get shipping info
    let shippingInfo = { rate_id: null as string | null, rate_name: null as string | null, amount_cents: 0 };
    if (cart.shipping_rate_id) {
      const [rate] = await db.query<any>(`SELECT * FROM shipping_rates WHERE id = ?`, [cart.shipping_rate_id]);
      if (rate) {
        shippingInfo.rate_id = rate.id;
        shippingInfo.rate_name = rate.display_name;
        shippingInfo.amount_cents = cart.shipping_cents || 0;
      }
    }

    // Build cart items for snapshot
    const cartItems = items.map((i) => ({
      sku: i.sku,
      title: i.title,
      qty: i.qty,
      unit_price_cents: i.unit_price_cents,
    }));

    // Calculate totals
    const subtotalCents = cartItems.reduce((sum, item) => sum + item.unit_price_cents * item.qty, 0);
    const discountCents = cart.discount_amount_cents || 0;
    const shippingCents = cart.shipping_cents || 0;
    const taxCents = 0; // TODO: calculate if needed
    const totalCents = subtotalCents - discountCents + shippingCents + taxCents;

    // Create snapshot
    const snapshot = createCartSnapshot({
      id: cart.id,
      status: cart.status,
      currency: cart.currency,
      customer_email: cart.customer_email,
      items: cartItems,
      totals: {
        subtotal_cents: subtotalCents,
        discount_cents: discountCents,
        shipping_cents: shippingCents,
        tax_cents: taxCents,
        total_cents: totalCents,
      },
      expires_at: cart.expires_at,
    });

    // Insert or ignore in saved_carts table
    await db.run(
      `INSERT OR IGNORE INTO saved_carts (auth0_user_id, cart_id) VALUES (?, ?)`,
      [userId, cartId]
    );

    // Update Auth0 user_metadata with full snapshot
    const userMetadata = await getUserMetadata(userId, c.env);
    const savedCartsMetadata = readSavedCartsFromMetadata(userMetadata, c.env.STORE_URL);

    // Check if cart already saved
    const cartExists = savedCartsMetadata.findIndex(sc => sc.id === cartId);
    let updatedSavedCarts: SavedCartSnapshot[];
    if (cartExists >= 0) {
      // Replace existing snapshot with updated one
      updatedSavedCarts = savedCartsMetadata.map((sc, idx) => idx === cartExists ? snapshot : sc);
    } else {
      // Add new snapshot
      updatedSavedCarts = [...savedCartsMetadata, snapshot];
    }

    const newMetadata = writeSavedCartsToMetadata(userMetadata, c.env.STORE_URL, updatedSavedCarts);
    await updateUserMetadata(userId, newMetadata, c.env);

    // Return DB record
    const savedCart = await db.query(
      `SELECT id, auth0_user_id, cart_id, created_at, updated_at 
       FROM saved_carts 
       WHERE auth0_user_id = ? AND cart_id = ? 
       LIMIT 1`,
      [userId, cartId]
    );

    if (savedCart.length === 0) {
      throw new ApiError('internal_error', 500, 'Failed to retrieve saved cart');
    }

    return c.json(savedCart[0], 201);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('Error saving cart:', error);
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * DELETE /v1/me/saved-carts/:cartId — remove a saved cart entry
 */
const deleteSavedCartRoute = createRoute({
  method: 'delete',
  path: '/me/saved-carts/:cartId',
  tags: ['Saved Carts'],
  summary: 'Delete a saved cart',
  description: 'Removes the association between the user and a saved cart (by cartId).',
  security: [{ bearerAuth: ["valid jwt"] }],
  responses: {
    204: { description: 'Saved cart deleted' },
    401: { description: 'Unauthorized' },
    404: { description: 'Not found' },
    500: { description: 'Internal error' },
  },
});

app.openapi(deleteSavedCartRoute, async (c) => {
  try {
    const auth = c.get('auth') as any;
    const userId = auth?.sub;
    const cartIdParam = c.req.param('cartId');

    if (!userId) {
      throw ApiError.unauthorized('No Auth0 user ID in token');
    }

    if (!cartIdParam) {
      throw ApiError.invalidRequest('cartId is required');
    }

    const cartId = cartIdParam;
    const db = getDb(c.var.db);

    // Verify the saved cart belongs to the user
    const savedCart = await db.query(
      `SELECT id FROM saved_carts WHERE cart_id = ? AND auth0_user_id = ? LIMIT 1`,
      [cartId, userId]
    );

    if (savedCart.length === 0) {
      throw ApiError.notFound('Saved cart not found or unauthorized');
    }

    // Delete the saved cart entry
    await db.run(
      `DELETE FROM saved_carts WHERE cart_id = ? AND auth0_user_id = ?`,
      [cartId, userId]
    );

    // Update Auth0 user_metadata
    const userMetadata = await getUserMetadata(userId, c.env);
    const savedCartsMetadata = readSavedCartsFromMetadata(userMetadata, c.env.STORE_URL);
    const updatedSavedCarts = savedCartsMetadata.filter((snapshot: SavedCartSnapshot) => snapshot.id !== cartId);

    const newMetadata = writeSavedCartsToMetadata(userMetadata, c.env.STORE_URL, updatedSavedCarts);
    await updateUserMetadata(userId, newMetadata, c.env);

    return c.json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('Error deleting saved cart:', error);
    return c.json({ error: String(error) }, 500);
  }
});

export { app as savedCartsRouter };
