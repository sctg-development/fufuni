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

import { Hono } from 'hono';
import Stripe from 'stripe';
import { getDb, type Database } from '../db';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import { resolveVariantPrice, getCurrencyIdFromCode } from '../lib/pricing';

// ============================================================
// UCP - UNIVERSAL COMMERCE PROTOCOL
// ============================================================
//
// Full UCP implementation for agent-to-commerce interoperability.
// See: https://ucp.dev/specification/overview
//
// Capabilities implemented:
// - dev.ucp.shopping.checkout (checkout sessions)
// - dev.ucp.common.identity_linking (OAuth 2.0)
// - dev.ucp.shopping.order (order webhooks)
//
// ============================================================

const UCP_VERSION = '2026-01-11';

export const ucp = new Hono<HonoEnv>();

// ============================================================
// TYPES
// ============================================================

interface UCPCapability {
  name: string;
  version: string;
  spec: string;
  schema: string;
  extends?: string;
  config?: Record<string, unknown>;
}

interface UCPCheckoutSession {
  id: string;
  status: 'incomplete' | 'requires_escalation' | 'ready_for_complete' | 'complete_in_progress' | 'completed' | 'canceled';
  currency: string;
  line_items: UCPLineItem[];
  buyer?: UCPBuyer;
  totals: UCPTotal[];
  messages: UCPMessage[];
  links: UCPLink[];
  payment: UCPPaymentResponse;
  continue_url?: string;
  expires_at?: string;
  order?: UCPOrderConfirmation;
}

interface UCPLineItem {
  id: string;
  item: { id: string; title?: string; description?: string; image_url?: string };
  quantity: number;
  unit_price: { amount: number; currency: string };
  total_price: { amount: number; currency: string };
}

interface UCPBuyer {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone_number?: string;
}

interface UCPTotal {
  type: 'subtotal' | 'tax' | 'shipping' | 'discount' | 'grand_total';
  amount: number;
  currency: string;
  label?: string;
}

interface UCPMessage {
  type: 'error' | 'warning' | 'info';
  code: string;
  content: string;
  severity?: 'recoverable' | 'requires_buyer_input' | 'requires_buyer_review';
}

interface UCPLink {
  rel: string;
  href: string;
  title?: string;
}

interface UCPPaymentResponse {
  handlers: UCPPaymentHandler[];
  instruments?: UCPPaymentInstrument[];
}

interface UCPPaymentHandler {
  id: string;
  name: string;
  version: string;
  spec: string;
  config_schema?: string;
  instrument_schemas: string[];
  config?: Record<string, unknown>;
}

interface UCPPaymentInstrument {
  handler_id: string;
  type: string;
  details?: Record<string, unknown>;
}

interface UCPOrderConfirmation {
  id: string;
  number: string;
  permalink_url?: string;
}

// ============================================================
// HELPERS
// ============================================================

function ucpEnvelope(capabilities: { name: string; version: string }[]) {
  return {
    version: UCP_VERSION,
    capabilities,
  };
}

function activeCapabilities(): { name: string; version: string }[] {
  return [
    { name: 'dev.ucp.shopping.checkout', version: UCP_VERSION },
    { name: 'dev.ucp.common.identity_linking', version: UCP_VERSION },
    { name: 'dev.ucp.shopping.order', version: UCP_VERSION },
  ];
}

function parseUCPAgentHeader(header: string | null): { profile?: string } {
  if (!header) return {};
  const match = header.match(/profile="([^"]+)"/);
  return { profile: match?.[1] };
}

async function getStripeConfig(db: Database): Promise<{ secretKey: string | null; webhookSecret: string | null }> {
  const [config] = await db.query<{ value: string }>(
    `SELECT value FROM config WHERE key = 'stripe'`,
    []
  );
  if (!config) return { secretKey: null, webhookSecret: null };
  try {
    const parsed = JSON.parse(config.value);
    return { 
      secretKey: parsed.secret_key || null,
      webhookSecret: parsed.webhook_secret || null,
    };
  } catch {
    return { secretKey: null, webhookSecret: null };
  }
}

// ============================================================
// /.well-known/ucp - UCP PROFILE ENDPOINT
// ============================================================

ucp.get('/.well-known/ucp', async (c) => {
  const baseUrl = new URL(c.req.url).origin;
  const db = getDb(c.var.db);
  const stripeConfig = await getStripeConfig(db);
  
  // Build payment handlers based on Stripe config
  const paymentHandlers: UCPPaymentHandler[] = [];
  
  if (stripeConfig.secretKey) {
    // Stripe checkout redirect handler
    paymentHandlers.push({
      id: 'stripe_checkout',
      name: 'com.stripe.checkout',
      version: UCP_VERSION,
      spec: 'https://stripe.com/docs/payments/checkout',
      instrument_schemas: [
        'https://ucp.dev/schemas/shopping/types/card_payment_instrument.json',
      ],
      config: {
        type: 'REDIRECT',
        description: 'Secure checkout via Stripe',
      },
    });
  }
  
  const profile = {
    ucp: {
      version: UCP_VERSION,
      services: {
        'dev.ucp.shopping': {
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specification/checkout',
          rest: {
            schema: 'https://ucp.dev/services/shopping/rest.openapi.json',
            endpoint: `${baseUrl}/ucp/v1`,
          },
        },
        'dev.ucp.common': {
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specification/identity-linking',
          rest: {
            schema: 'https://ucp.dev/services/common/rest.openapi.json',
            endpoint: baseUrl,
          },
        },
      },
      capabilities: [
        {
          name: 'dev.ucp.shopping.checkout',
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specification/checkout',
          schema: 'https://ucp.dev/schemas/shopping/checkout.json',
        },
        {
          name: 'dev.ucp.common.identity_linking',
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specification/identity-linking',
          schema: 'https://ucp.dev/schemas/common/identity_linking.json',
        },
        {
          name: 'dev.ucp.shopping.order',
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specification/order',
          schema: 'https://ucp.dev/schemas/shopping/order.json',
        },
      ] as UCPCapability[],
    },
    payment: {
      handlers: paymentHandlers,
    },
    // Signing keys would be added here for webhook verification
    // signing_keys: []
  };
  
  return c.json(profile);
});

// ============================================================
// UCP CHECKOUT CAPABILITY - REST BINDING
// ============================================================

// POST /ucp/v1/checkout-sessions - Create Checkout
ucp.post('/ucp/v1/checkout-sessions', async (c) => {
  const ucpAgent = parseUCPAgentHeader(c.req.header('UCP-Agent') || null);
  const body = await c.req.json();
  const { line_items, buyer, currency, payment } = body;
  
  if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
    throw ApiError.invalidRequest('line_items is required and must not be empty');
  }
  if (!currency) {
    throw ApiError.invalidRequest('currency is required');
  }
  
  const db = getDb(c.var.db);
  const baseUrl = new URL(c.req.url).origin;
  
  // Resolve line items from catalog
  const resolvedItems: UCPLineItem[] = [];
  const messages: UCPMessage[] = [];
  let subtotal = 0;

  // Resolve currency_id from ISO code
  const currencyId = await getCurrencyIdFromCode(db, currency);
  if (!currencyId) {
    throw ApiError.invalidRequest(`Currency ${currency} not configured or inactive`);
  }
  
  for (const item of line_items) {
    const itemId = item.item?.id;
    const quantity = item.quantity || 1;
    
    if (!itemId) {
      messages.push({
        type: 'error',
        code: 'invalid_item',
        content: 'Line item missing item.id',
        severity: 'recoverable',
      });
      continue;
    }
    
    // Look up variant by ID or SKU
    const [variant] = await db.query<any>(
      `SELECT v.*, p.title as product_title, p.description as product_description
       FROM variants v
       JOIN products p ON v.product_id = p.id
       WHERE v.id = ? OR v.sku = ?`,
      [itemId, itemId]
    );
    
    if (!variant) {
      messages.push({
        type: 'error',
        code: 'item_not_found',
        content: `Item ${itemId} not found`,
        severity: 'recoverable',
      });
      continue;
    }
    
    // Check inventory
    const [inv] = await db.query<any>(
      `SELECT on_hand, reserved FROM inventory WHERE sku = ?`,
      [variant.sku]
    );
    const available = inv ? inv.on_hand - inv.reserved : 0;
    
    if (available < quantity) {
      messages.push({
        type: 'error',
        code: 'insufficient_inventory',
        content: `Only ${available} of ${variant.sku} available`,
        severity: 'recoverable',
      });
    }

    // Resolve price from variant_prices using multi-currency pricing
    let unitPrice: number;
    try {
      unitPrice = await resolveVariantPrice(db, variant.id, currencyId);
    } catch (error) {
      messages.push({
        type: 'error',
        code: 'price_not_available',
        content: `Price not configured for variant ${variant.sku} in currency ${currency}`,
        severity: 'recoverable',
      });
      continue;
    }

    const totalPrice = unitPrice * quantity;
    subtotal += totalPrice;
    
    resolvedItems.push({
      id: uuid(),
      item: {
        id: variant.sku,
        title: variant.title || variant.product_title,
        description: variant.product_description,
        image_url: variant.image_url,
      },
      quantity,
      unit_price: { amount: unitPrice, currency: currency.toUpperCase() },
      total_price: { amount: totalPrice, currency: currency.toUpperCase() },
    });
  }
  
  // Create checkout session in DB
  const sessionId = uuid();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6 hours
  
  const hasErrors = messages.some(m => m.type === 'error');
  const hasBuyerRequiredErrors = messages.some(m => m.severity === 'requires_buyer_input' || m.severity === 'requires_buyer_review');
  
  let status: UCPCheckoutSession['status'] = 'incomplete';
  if (!hasErrors && resolvedItems.length > 0) {
    // Check if we have enough info to be ready
    status = 'ready_for_complete';
  }
  if (hasBuyerRequiredErrors) {
    status = 'requires_escalation';
  }
  
  // Store session
  await db.run(
    `INSERT INTO ucp_checkout_sessions (id, status, currency, line_items, buyer, totals, messages, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      status,
      currency.toUpperCase(),
      JSON.stringify(resolvedItems),
      JSON.stringify(buyer || null),
      JSON.stringify([
        { type: 'subtotal', amount: subtotal, currency: currency.toUpperCase() },
        { type: 'grand_total', amount: subtotal, currency: currency.toUpperCase() },
      ]),
      JSON.stringify(messages),
      expiresAt,
      now(),
      now(),
    ]
  );
  
  // Build payment handlers
  const stripeConfig = await getStripeConfig(db);
  const paymentHandlers: UCPPaymentHandler[] = [];
  
  if (stripeConfig.secretKey) {
    paymentHandlers.push({
      id: 'stripe_checkout',
      name: 'com.stripe.checkout',
      version: UCP_VERSION,
      spec: 'https://stripe.com/docs/payments/checkout',
      instrument_schemas: ['https://ucp.dev/schemas/shopping/types/card_payment_instrument.json'],
      config: {
        type: 'REDIRECT',
      },
    });
  }
  
  const response: UCPCheckoutSession & { ucp: ReturnType<typeof ucpEnvelope> } = {
    ucp: ucpEnvelope(activeCapabilities()),
    id: sessionId,
    status,
    currency: currency.toUpperCase(),
    line_items: resolvedItems,
    buyer: buyer || undefined,
    totals: [
      { type: 'subtotal', amount: subtotal, currency: currency.toUpperCase() },
      { type: 'grand_total', amount: subtotal, currency: currency.toUpperCase() },
    ],
    messages,
    links: [
      { rel: 'privacy_policy', href: `${baseUrl}/privacy`, title: 'Privacy Policy' },
      { rel: 'terms_of_service', href: `${baseUrl}/terms`, title: 'Terms of Service' },
    ],
    payment: { handlers: paymentHandlers },
    continue_url: status === 'requires_escalation' ? `${baseUrl}/checkout/${sessionId}` : undefined,
    expires_at: expiresAt,
  };
  
  return c.json(response, 201);
});

// GET /ucp/v1/checkout-sessions/:id - Get Checkout
ucp.get('/ucp/v1/checkout-sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const db = getDb(c.var.db);
  const baseUrl = new URL(c.req.url).origin;
  
  const [session] = await db.query<any>(
    `SELECT * FROM ucp_checkout_sessions WHERE id = ?`,
    [sessionId]
  );
  
  if (!session) {
    throw ApiError.notFound('Checkout session not found');
  }
  
  // Check expiration
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    await db.run(`UPDATE ucp_checkout_sessions SET status = 'canceled' WHERE id = ?`, [sessionId]);
    session.status = 'canceled';
  }
  
  const stripeConfig = await getStripeConfig(db);
  const paymentHandlers: UCPPaymentHandler[] = [];
  
  if (stripeConfig.secretKey) {
    paymentHandlers.push({
      id: 'stripe_checkout',
      name: 'com.stripe.checkout',
      version: UCP_VERSION,
      spec: 'https://stripe.com/docs/payments/checkout',
      instrument_schemas: ['https://ucp.dev/schemas/shopping/types/card_payment_instrument.json'],
      config: { type: 'REDIRECT' },
    });
  }
  
  const response = {
    ucp: ucpEnvelope(activeCapabilities()),
    id: session.id,
    status: session.status,
    currency: session.currency,
    line_items: JSON.parse(session.line_items || '[]'),
    buyer: JSON.parse(session.buyer || 'null') || undefined,
    totals: JSON.parse(session.totals || '[]'),
    messages: JSON.parse(session.messages || '[]'),
    links: [
      { rel: 'privacy_policy', href: `${baseUrl}/privacy`, title: 'Privacy Policy' },
      { rel: 'terms_of_service', href: `${baseUrl}/terms`, title: 'Terms of Service' },
    ],
    payment: {
      handlers: paymentHandlers,
      instruments: JSON.parse(session.payment_instruments || 'null') || undefined,
    },
    continue_url: session.status === 'requires_escalation' ? `${baseUrl}/checkout/${sessionId}` : undefined,
    expires_at: session.expires_at,
    order: session.order_id ? {
      id: session.order_id,
      number: session.order_number,
      permalink_url: `${baseUrl}/orders/${session.order_id}`,
    } : undefined,
  };
  
  return c.json(response);
});

// PUT /ucp/v1/checkout-sessions/:id - Update Checkout (full replacement)
ucp.put('/ucp/v1/checkout-sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json();
  const db = getDb(c.var.db);
  const baseUrl = new URL(c.req.url).origin;
  
  const [session] = await db.query<any>(
    `SELECT * FROM ucp_checkout_sessions WHERE id = ?`,
    [sessionId]
  );
  
  if (!session) {
    throw ApiError.notFound('Checkout session not found');
  }
  
  if (session.status === 'completed' || session.status === 'canceled') {
    throw ApiError.invalidRequest(`Cannot update ${session.status} checkout session`);
  }
  
  const { line_items, buyer, currency, payment } = body;
  
  // Determine the effective currency for this update.
  // If the payload supplies a currency, use it; otherwise keep the session currency.
  const activeCurrency = (currency ?? session.currency).toUpperCase();

  // Resolve currency_id for pricing lookups (variant_prices uses currency UUIDs).
  const currencyId = await getCurrencyIdFromCode(db, activeCurrency);
  if (!currencyId) {
    throw ApiError.invalidRequest(`Currency ${activeCurrency} is not configured or is inactive`);
  }

  // Re-resolve line items
  const resolvedItems: UCPLineItem[] = [];
  const messages: UCPMessage[] = [];
  let subtotal = 0;
  
  for (const item of line_items || []) {
    const itemId = item.item?.id;
    const quantity = item.quantity || 1;
    
    if (!itemId) continue;
    
    const [variant] = await db.query<any>(
      `SELECT v.*, p.title as product_title, p.description as product_description
       FROM variants v
       JOIN products p ON v.product_id = p.id
       WHERE v.id = ? OR v.sku = ?`,
      [itemId, itemId]
    );
    
    if (!variant) {
      messages.push({
        type: 'error',
        code: 'item_not_found',
        content: `Item ${itemId} not found`,
        severity: 'recoverable',
      });
      continue;
    }

    // Resolve price via variant_prices for the active currency
    let unitPrice: number;
    try {
      unitPrice = await resolveVariantPrice(db, variant.id, currencyId);
    } catch (err) {
      messages.push({
        type: 'error',
        code: 'price_not_available',
        content: `Price not configured for variant ${variant.sku} in currency ${activeCurrency}`,
        severity: 'recoverable',
      });
      continue;
    }

    const totalPrice = unitPrice * quantity;
    subtotal += totalPrice;
    
    resolvedItems.push({
      id: item.id || uuid(),
      item: {
        id: variant.sku,
        title: variant.title || variant.product_title,
        description: variant.product_description,
        image_url: variant.image_url,
      },
      quantity,
      unit_price: { amount: unitPrice, currency: activeCurrency },
      total_price: { amount: totalPrice, currency: activeCurrency },
    });
  }
  
  const hasErrors = messages.some(m => m.type === 'error');
  let status: UCPCheckoutSession['status'] = 'incomplete';
  if (!hasErrors && resolvedItems.length > 0) {
    status = 'ready_for_complete';
  }
  
  const totals = [
    { type: 'subtotal', amount: subtotal, currency: activeCurrency },
    { type: 'grand_total', amount: subtotal, currency: activeCurrency },
  ];
  
  await db.run(
    `UPDATE ucp_checkout_sessions 
     SET status = ?, currency = ?, line_items = ?, buyer = ?, totals = ?, messages = ?, updated_at = ?
     WHERE id = ?`,
    [
      status,
      activeCurrency,
      JSON.stringify(resolvedItems),
      JSON.stringify(buyer || null),
      JSON.stringify(totals),
      JSON.stringify(messages),
      now(),
      sessionId,
    ]
  );
  
  const stripeConfig = await getStripeConfig(db);
  const paymentHandlers: UCPPaymentHandler[] = [];
  
  if (stripeConfig.secretKey) {
    paymentHandlers.push({
      id: 'stripe_checkout',
      name: 'com.stripe.checkout',
      version: UCP_VERSION,
      spec: 'https://stripe.com/docs/payments/checkout',
      instrument_schemas: ['https://ucp.dev/schemas/shopping/types/card_payment_instrument.json'],
      config: { type: 'REDIRECT' },
    });
  }
  
  return c.json({
    ucp: ucpEnvelope(activeCapabilities()),
    id: sessionId,
    status,
    currency: activeCurrency,
    line_items: resolvedItems,
    buyer: buyer || undefined,
    totals,
    messages,
    links: [
      { rel: 'privacy_policy', href: `${baseUrl}/privacy`, title: 'Privacy Policy' },
      { rel: 'terms_of_service', href: `${baseUrl}/terms`, title: 'Terms of Service' },
    ],
    payment: { handlers: paymentHandlers },
    expires_at: session.expires_at,
  });
});

// POST /ucp/v1/checkout-sessions/:id/complete - Complete Checkout
ucp.post('/ucp/v1/checkout-sessions/:id/complete', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json();
  const { payment_data, risk_signals } = body;
  
  const db = getDb(c.var.db);
  const baseUrl = new URL(c.req.url).origin;
  
  const [session] = await db.query<any>(
    `SELECT * FROM ucp_checkout_sessions WHERE id = ?`,
    [sessionId]
  );
  
  if (!session) {
    throw ApiError.notFound('Checkout session not found');
  }
  
  if (session.status === 'completed') {
    throw ApiError.invalidRequest('Checkout already completed');
  }
  if (session.status === 'canceled') {
    throw ApiError.invalidRequest('Checkout was canceled');
  }
  if (session.status !== 'ready_for_complete') {
    throw ApiError.invalidRequest(`Cannot complete checkout in ${session.status} state`);
  }
  
  // Mark as in progress
  await db.run(
    `UPDATE ucp_checkout_sessions SET status = 'complete_in_progress', updated_at = ? WHERE id = ?`,
    [now(), sessionId]
  );
  
  const lineItems = JSON.parse(session.line_items || '[]');
  const buyer = JSON.parse(session.buyer || '{}');
  const totals = JSON.parse(session.totals || '[]');
  const grandTotal = totals.find((t: any) => t.type === 'grand_total')?.amount || 0;
  
  const stripeConfig = await getStripeConfig(db);
  
  // For UCP, we use Stripe Checkout redirect flow
  // The payment_data should indicate the handler being used
  if (stripeConfig.secretKey && payment_data?.handler_id === 'stripe_checkout') {
    const stripe = new Stripe(stripeConfig.secretKey);
    
    // Create Stripe Checkout Session
    const stripeLineItems = lineItems.map((item: UCPLineItem) => ({
      price_data: {
        currency: session.currency.toLowerCase(),
        product_data: {
          name: item.item.title || item.item.id,
          description: item.item.description,
          images: item.item.image_url ? [item.item.image_url] : undefined,
        },
        unit_amount: item.unit_price.amount,
      },
      quantity: item.quantity,
    }));
    
    const successUrl = payment_data.success_url || `${baseUrl}/ucp/v1/checkout-sessions/${sessionId}/success`;
    const cancelUrl = payment_data.cancel_url || `${baseUrl}/ucp/v1/checkout-sessions/${sessionId}/cancel`;
    
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: stripeLineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: buyer.email,
      metadata: {
        ucp_checkout_session_id: sessionId,
      },
    });
    
    // Store Stripe session ID
    await db.run(
      `UPDATE ucp_checkout_sessions SET stripe_session_id = ?, updated_at = ? WHERE id = ?`,
      [stripeSession.id, now(), sessionId]
    );
    
    // Return requires_escalation with continue_url pointing to Stripe
    return c.json({
      ucp: ucpEnvelope(activeCapabilities()),
      id: sessionId,
      status: 'requires_escalation' as const,
      currency: session.currency,
      line_items: lineItems,
      buyer: buyer || undefined,
      totals,
      messages: [{
        type: 'info' as const,
        code: 'payment_required',
        content: 'Redirect to payment provider to complete purchase',
      }],
      links: [
        { rel: 'privacy_policy', href: `${baseUrl}/privacy`, title: 'Privacy Policy' },
        { rel: 'terms_of_service', href: `${baseUrl}/terms`, title: 'Terms of Service' },
      ],
      payment: {
        handlers: [{
          id: 'stripe_checkout',
          name: 'com.stripe.checkout',
          version: UCP_VERSION,
          spec: 'https://stripe.com/docs/payments/checkout',
          instrument_schemas: [],
        }],
      },
      continue_url: stripeSession.url,
      expires_at: session.expires_at,
    });
  }
  
  // If no valid payment handler, return error
  throw ApiError.invalidRequest('No valid payment handler specified');
});

// DELETE /ucp/v1/checkout-sessions/:id - Cancel Checkout
ucp.delete('/ucp/v1/checkout-sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const db = getDb(c.var.db);
  const baseUrl = new URL(c.req.url).origin;
  
  const [session] = await db.query<any>(
    `SELECT * FROM ucp_checkout_sessions WHERE id = ?`,
    [sessionId]
  );
  
  if (!session) {
    throw ApiError.notFound('Checkout session not found');
  }
  
  if (session.status === 'completed') {
    throw ApiError.invalidRequest('Cannot cancel completed checkout');
  }
  
  await db.run(
    `UPDATE ucp_checkout_sessions SET status = 'canceled', updated_at = ? WHERE id = ?`,
    [now(), sessionId]
  );
  
  return c.json({
    ucp: ucpEnvelope(activeCapabilities()),
    id: sessionId,
    status: 'canceled' as const,
    currency: session.currency,
    line_items: JSON.parse(session.line_items || '[]'),
    buyer: JSON.parse(session.buyer || 'null') || undefined,
    totals: JSON.parse(session.totals || '[]'),
    messages: [{
      type: 'info' as const,
      code: 'checkout_canceled',
      content: 'Checkout session has been canceled',
    }],
    links: [
      { rel: 'privacy_policy', href: `${baseUrl}/privacy`, title: 'Privacy Policy' },
      { rel: 'terms_of_service', href: `${baseUrl}/terms`, title: 'Terms of Service' },
    ],
    payment: { handlers: [] },
  });
});

// ============================================================
// UCP ORDER CAPABILITY - Webhook handler for Stripe completion
// ============================================================

// This is called by Stripe webhook when checkout.session.completed
// It completes the UCP checkout session and creates an order
export async function handleUCPStripeWebhook(
  db: Database,
  stripeSessionId: string,
  stripeSession: Stripe.Checkout.Session
): Promise<void> {
  const ucpSessionId = stripeSession.metadata?.ucp_checkout_session_id;
  if (!ucpSessionId) return;
  
  const [session] = await db.query<any>(
    `SELECT * FROM ucp_checkout_sessions WHERE id = ? AND stripe_session_id = ?`,
    [ucpSessionId, stripeSessionId]
  );
  
  if (!session || session.status === 'completed') return;
  
  // Create order
  const orderId = uuid();
  const lineItems = JSON.parse(session.line_items || '[]');
  const buyer = JSON.parse(session.buyer || '{}');
  const totals = JSON.parse(session.totals || '[]');
  const grandTotal = totals.find((t: any) => t.type === 'grand_total')?.amount || 0;
  
  // Get next order number
  const [orderCount] = await db.query<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM orders`, []);
  const orderNumber = `ORD-${String((orderCount?.cnt || 0) + 1).padStart(5, '0')}`;
  
  // Insert order
  await db.run(
    `INSERT INTO orders (id, number, status, customer_email, subtotal_cents, tax_cents, shipping_cents, total_cents, currency, stripe_session_id, items, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      orderNumber,
      'paid',
      buyer.email || stripeSession.customer_email,
      grandTotal,
      0,
      0,
      grandTotal,
      session.currency,
      stripeSessionId,
      JSON.stringify(lineItems.map((li: UCPLineItem) => ({
        sku: li.item.id,
        title: li.item.title,
        qty: li.quantity,
        unit_price_cents: li.unit_price.amount,
      }))),
      now(),
      now(),
    ]
  );
  
  // Update UCP session
  await db.run(
    `UPDATE ucp_checkout_sessions SET status = 'completed', order_id = ?, order_number = ?, updated_at = ? WHERE id = ?`,
    [orderId, orderNumber, now(), ucpSessionId]
  );
  
  // Deduct inventory
  for (const item of lineItems) {
    await db.run(
      `UPDATE inventory SET on_hand = on_hand - ?, reserved = reserved - ? WHERE sku = ?`,
      [item.quantity, item.quantity, item.item.id]
    );
  }
}
