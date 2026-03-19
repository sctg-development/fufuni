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

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { getDb } from '../db';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import { generateWebhookSecret, retryDelivery } from '../lib/webhooks';
import {
  IdParam,
  WebhookResponse,
  WebhookWithSecret,
  WebhookListResponse,
  WebhookDetailResponse,
  CreateWebhookBody,
  UpdateWebhookBody,
  WebhookDeliveryResponse,
  DeliveryIdParam,
  RotateSecretResponse,
  RetryResponse,
  ErrorResponse,
  DeletedResponse,
} from '../schemas';

const VALID_EVENTS = [
  'order.created',
  'order.updated',
  'order.shipped',
  'order.refunded',
  'inventory.low',
  'order.*',
  '*',
] as const;

const app = new OpenAPIHono<HonoEnv>();

app.use('*', authMiddleware);

const listWebhooks = createRoute({
  method: 'get',
  path: '/',
  tags: ['Webhooks'],
  summary: 'List all webhooks',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  responses: {
    200: { content: { 'application/json': { schema: WebhookListResponse } }, description: 'List of webhooks' },
  },
});

app.openapi(listWebhooks, async (c) => {
  const db = getDb(c.var.db);

  const webhooks = await db.query<any>(`SELECT * FROM webhooks ORDER BY created_at DESC`, []);

  return c.json({
    items: webhooks.map((w) => ({
      id: w.id,
      url: w.url,
      events: JSON.parse(w.events),
      status: w.status,
      created_at: w.created_at,
      has_secret: Boolean(w.secret),
    })),
  }, 200);
});

const getWebhook = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Webhooks'],
  summary: 'Get webhook with recent deliveries',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: WebhookDetailResponse } }, description: 'Webhook details with deliveries' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Webhook not found' },
  },
});

app.openapi(getWebhook, async (c) => {
  const { id } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [webhook] = await db.query<any>(`SELECT * FROM webhooks WHERE id = ?`, [id]);
  if (!webhook) throw ApiError.notFound('Webhook not found');

  const deliveries = await db.query<any>(
    `SELECT id, event_type, status, attempts, response_code, created_at, last_attempt_at
     FROM webhook_deliveries 
     WHERE webhook_id = ? 
     ORDER BY created_at DESC 
     LIMIT 20`,
    [id]
  );

  return c.json({
    id: webhook.id,
    url: webhook.url,
    events: JSON.parse(webhook.events),
    status: webhook.status,
    created_at: webhook.created_at,
    has_secret: Boolean(webhook.secret),
    recent_deliveries: deliveries.map((d) => ({
      id: d.id,
      event_type: d.event_type,
      status: d.status,
      attempts: d.attempts,
      response_code: d.response_code,
      created_at: d.created_at,
      last_attempt_at: d.last_attempt_at,
    })),
  }, 200);
});

const createWebhook = createRoute({
  method: 'post',
  path: '/',
  tags: ['Webhooks'],
  summary: 'Create a webhook',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    body: { content: { 'application/json': { schema: CreateWebhookBody } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: WebhookWithSecret } }, description: 'Created webhook (includes secret)' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
  },
});

app.openapi(createWebhook, async (c) => {
  const { url, events } = c.req.valid('json');

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    throw ApiError.invalidRequest('url must be a valid HTTP(S) URL');
  }

  for (const event of events) {
    if (!VALID_EVENTS.includes(event as typeof VALID_EVENTS[number])) {
      throw ApiError.invalidRequest(
        `Invalid event type: ${event}. Valid types: ${VALID_EVENTS.join(', ')}`
      );
    }
  }

  const db = getDb(c.var.db);
  const id = uuid();
  const secret = generateWebhookSecret();
  const timestamp = now();

  await db.run(
    `INSERT INTO webhooks (id, url, events, secret, status, created_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
    [id, url, JSON.stringify(events), secret, timestamp]
  );

  return c.json({
    id,
    url,
    events,
    status: 'active' as const,
    secret,
    created_at: timestamp,
  }, 201);
});

const updateWebhook = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Webhooks'],
  summary: 'Update a webhook',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: UpdateWebhookBody } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: WebhookResponse } }, description: 'Updated webhook' },
    400: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Webhook not found' },
  },
});

app.openapi(updateWebhook, async (c) => {
  const { id } = c.req.valid('param');
  const { url, events, status } = c.req.valid('json');
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>(`SELECT * FROM webhooks WHERE id = ?`, [id]);
  if (!existing) throw ApiError.notFound('Webhook not found');

  const updates: string[] = [];
  const params: unknown[] = [];

  if (url !== undefined) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      throw ApiError.invalidRequest('url must be a valid HTTP(S) URL');
    }
    updates.push('url = ?');
    params.push(url);
  }

  if (events !== undefined) {
    for (const event of events) {
      if (!VALID_EVENTS.includes(event as typeof VALID_EVENTS[number])) {
        throw ApiError.invalidRequest(`Invalid event type: ${event}`);
      }
    }
    updates.push('events = ?');
    params.push(JSON.stringify(events));
  }

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }

  if (updates.length > 0) {
    params.push(id);
    await db.run(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  const [updated] = await db.query<any>(`SELECT * FROM webhooks WHERE id = ?`, [id]);

  return c.json({
    id: updated.id,
    url: updated.url,
    events: JSON.parse(updated.events),
    status: updated.status,
    created_at: updated.created_at,
    has_secret: true,
  }, 200);
});

const deleteWebhook = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Webhooks'],
  summary: 'Delete a webhook',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: DeletedResponse } }, description: 'Webhook deleted' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Webhook not found' },
  },
});

app.openapi(deleteWebhook, async (c) => {
  const { id } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>(`SELECT * FROM webhooks WHERE id = ?`, [id]);
  if (!existing) throw ApiError.notFound('Webhook not found');

  await db.run(`DELETE FROM webhook_deliveries WHERE webhook_id = ?`, [id]);
  await db.run(`DELETE FROM webhooks WHERE id = ?`, [id]);

  return c.json({ deleted: true as const }, 200);
});

const rotateSecret = createRoute({
  method: 'post',
  path: '/{id}/rotate-secret',
  tags: ['Webhooks'],
  summary: 'Rotate webhook secret',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: RotateSecretResponse } }, description: 'New secret' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Webhook not found' },
  },
});

app.openapi(rotateSecret, async (c) => {
  const { id } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [existing] = await db.query<any>(`SELECT * FROM webhooks WHERE id = ?`, [id]);
  if (!existing) throw ApiError.notFound('Webhook not found');

  const newSecret = generateWebhookSecret();
  await db.run(`UPDATE webhooks SET secret = ? WHERE id = ?`, [newSecret, id]);

  return c.json({ secret: newSecret }, 200);
});

const getDelivery = createRoute({
  method: 'get',
  path: '/{id}/deliveries/{deliveryId}',
  tags: ['Webhooks'],
  summary: 'Get delivery details',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: DeliveryIdParam },
  responses: {
    200: { content: { 'application/json': { schema: WebhookDeliveryResponse } }, description: 'Delivery details' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Webhook or delivery not found' },
  },
});

app.openapi(getDelivery, async (c) => {
  const { id, deliveryId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [webhook] = await db.query<any>(`SELECT id FROM webhooks WHERE id = ?`, [id]);
  if (!webhook) throw ApiError.notFound('Webhook not found');

  const [delivery] = await db.query<any>(
    `SELECT * FROM webhook_deliveries WHERE id = ? AND webhook_id = ?`,
    [deliveryId, id]
  );
  if (!delivery) throw ApiError.notFound('Delivery not found');

  return c.json({
    id: delivery.id,
    event_type: delivery.event_type,
    payload: JSON.parse(delivery.payload),
    status: delivery.status,
    attempts: delivery.attempts,
    response_code: delivery.response_code,
    response_body: delivery.response_body,
    created_at: delivery.created_at,
    last_attempt_at: delivery.last_attempt_at,
  }, 200);
});

const retryDeliveryRoute = createRoute({
  method: 'post',
  path: '/{id}/deliveries/{deliveryId}/retry',
  tags: ['Webhooks'],
  summary: 'Retry a failed delivery',
  security: [{ bearerAuth: ["legacy sk_","admin:store"] }],
  middleware: [adminOnly] as const,
  request: { params: DeliveryIdParam },
  responses: {
    200: { content: { 'application/json': { schema: RetryResponse } }, description: 'Retry triggered' },
    404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Webhook or delivery not found' },
  },
});

app.openapi(retryDeliveryRoute, async (c) => {
  const { id, deliveryId } = c.req.valid('param');
  const db = getDb(c.var.db);

  const [webhook] = await db.query<any>(`SELECT * FROM webhooks WHERE id = ?`, [id]);
  if (!webhook) throw ApiError.notFound('Webhook not found');

  const [delivery] = await db.query<any>(
    `SELECT * FROM webhook_deliveries WHERE id = ? AND webhook_id = ?`,
    [deliveryId, id]
  );
  if (!delivery) throw ApiError.notFound('Delivery not found');

  await db.run(`UPDATE webhook_deliveries SET status = 'pending', attempts = 0 WHERE id = ?`, [deliveryId]);

  c.executionCtx.waitUntil(retryDelivery(c.var.db, webhook, delivery));

  return c.json({ status: 'pending', message: 'Delivery retry triggered' }, 200);
});

export { app as webhooksRoutes };
