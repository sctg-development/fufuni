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

const app = new OpenAPIHono<HonoEnv>();
app.use('*', customerAuthMiddleware);

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
      throw ApiError.badRequest('cartId is required');
    }

    const db = getDb(c.var.db);

    // Check if cart exists
    const cartExists = await db.query(
      `SELECT id FROM carts WHERE id = ? LIMIT 1`,
      [cartId]
    );

    if (cartExists.length === 0) {
      throw ApiError.notFound('Cart not found');
    }

    // Insert or ignore (unique constraint on auth0_user_id + cart_id)
    const result = await db.run(
      `INSERT OR IGNORE INTO saved_carts (auth0_user_id, cart_id) VALUES (?, ?)`,
      [userId, cartId]
    );

    // Return the saved cart record
    const savedCart = await db.query(
      `SELECT id, auth0_user_id, cart_id, created_at, updated_at 
       FROM saved_carts 
       WHERE auth0_user_id = ? AND cart_id = ? 
       LIMIT 1`,
      [userId, cartId]
    );

    if (savedCart.length === 0) {
      throw ApiError.internalError('Failed to retrieve saved cart');
    }

    // Update Auth0 user_metadata
    const userMetadata = await getUserMetadata(userId, c.env);
    const savedCartsMetadata = Array.isArray(userMetadata.saved_carts) ? userMetadata.saved_carts : [];

    // Store cartId as string in metadata (it's a UUID)
    if (!savedCartsMetadata.includes(cartId)) {
      savedCartsMetadata.push(cartId);
      await updateUserMetadata(userId, { ...userMetadata, saved_carts: savedCartsMetadata }, c.env);
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
      throw ApiError.badRequest('cartId is required');
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
    let savedCartsMetadata = Array.isArray(userMetadata.saved_carts) ? userMetadata.saved_carts : [];
    
    // Remove the cartId from the metadata
    savedCartsMetadata = savedCartsMetadata.filter((id: string) => id !== cartId);
    await updateUserMetadata(userId, { ...userMetadata, saved_carts: savedCartsMetadata }, c.env);

    return c.text('', 204);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('Error deleting saved cart:', error);
    return c.json({ error: String(error) }, 500);
  }
});

export { app as savedCartsRouter };
