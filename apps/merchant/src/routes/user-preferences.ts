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
import { ApiError, type HonoEnv } from '../types';
import { getUserMetadata, updateUserMetadata } from '../lib/auth0';

const app = new OpenAPIHono<HonoEnv>();
app.use('*', customerAuthMiddleware);

/**
 * Wishlist schema for validation
 */
const wishlistSchema = z.object({
  wishlist: z.array(z.string()).default([]),
});

/**
 * GET /v1/me/wishlist — retrieve the user's wishlist product IDs
 * 
 * Returns an array of product IDs stored in Auth0 user_metadata.
 * Cached in the JWT via the "add-userinfo-to-access-jwt" Auth0 Action if available.
 */
const getWishlistRoute = createRoute({
  method: 'get',
  path: '/me/wishlist',
  tags: ['User Preferences'],
  summary: 'Get user wishlist',
  description: 'Returns the authenticated user\'s list of favorited product IDs.',
  responses: {
    200: {
      description: 'Wishlist retrieved',
      content: {
        'application/json': {
          schema: wishlistSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

app.openapi(getWishlistRoute, async (c) => {
  try {
    const auth = c.get('auth') as any;
    const userId = auth?.sub;

    if (!userId) {
      throw ApiError.unauthorized('No Auth0 user ID in token');
    }

    const wishlist = auth?.user_metadata?.wishlist ?? [];

    return c.json({ wishlist }, 200);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /v1/me/wishlist — add a product to the wishlist
 */
const addWishlistProductRoute = createRoute({
  method: 'post',
  path: '/me/wishlist',
  tags: ['User Preferences'],
  summary: 'Add product to wishlist',
  description: 'Adds a product ID to the user\'s wishlist stored in Auth0 user_metadata.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ productId: z.string() }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Product added to wishlist',
      content: {
        'application/json': {
          schema: wishlistSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    500: { description: 'Internal error' },
  },
});

app.openapi(addWishlistProductRoute, async (c) => {
  try {
    const auth = c.get('auth') as any;
    const userId = auth?.sub;

    if (!userId) {
      throw ApiError.unauthorized('No Auth0 user ID in token');
    }

    const { productId } = (await c.req.json()) as { productId: string };

    if (!productId) {
      throw ApiError.invalidRequest('productId is required');
    }

    // Read existing wishlist from Auth0 user_metadata
    const userMetadata = await getUserMetadata(userId, c.env);
    const currentWishlist = Array.isArray(userMetadata.wishlist) ? userMetadata.wishlist : [];

    if (!currentWishlist.includes(productId)) {
      currentWishlist.push(productId);
    }

    await updateUserMetadata(userId, { ...userMetadata, wishlist: currentWishlist }, c.env);

    return c.json({ wishlist: currentWishlist }, 200);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * DELETE /v1/me/wishlist/:productId — remove a product from the wishlist
 */
const removeWishlistProductRoute = createRoute({
  method: 'delete',
  path: '/me/wishlist/:productId',
  tags: ['User Preferences'],
  summary: 'Remove product from wishlist',
  description: 'Removes a product ID from the user\'s wishlist.',
  responses: {
    200: {
      description: 'Product removed from wishlist',
      content: {
        'application/json': {
          schema: wishlistSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    500: { description: 'Internal error' },
  },
});

app.openapi(removeWishlistProductRoute, async (c) => {
  try {
    const auth = c.get('auth') as any;
    const userId = auth?.sub;
    const productId = c.req.param('productId');

    if (!userId) {
      throw ApiError.unauthorized('No Auth0 user ID in token');
    }

    if (!productId) {
      throw ApiError.invalidRequest('productId is required');
    }

    // Read existing wishlist from Auth0 user_metadata
    const userMetadata = await getUserMetadata(userId, c.env);
    let newWishlist = Array.isArray(userMetadata.wishlist) ? userMetadata.wishlist : [];
    newWishlist = newWishlist.filter((id: string) => id !== productId);

    await updateUserMetadata(userId, { ...userMetadata, wishlist: newWishlist }, c.env);

    return c.json({ wishlist: newWishlist }, 200);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return c.json({ error: String(error) }, 500);
  }
});

export { app as userPreferencesRouter };
