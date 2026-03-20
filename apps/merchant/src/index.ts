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

import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import { setup } from './routes/setup';
import { catalog } from './routes/catalog';
import { inventory } from './routes/inventory';
import { checkout } from './routes/checkout';
import { orders, publicOrders } from './routes/orders';
import { customers } from './routes/customers';
import { webhooks } from './routes/webhooks';
import { webhooksRoutes } from './routes/webhooks-outbound';
import { images } from './routes/images';
import { discounts } from './routes/discounts';
import { oauth } from './routes/oauth';
import { ucp } from './routes/ucp';
import { auth0Routes } from './routes/auth0';
import { me } from './routes/me';
import { regions } from './routes/regions';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { ai } from './routes/ai';
import { taxRates } from './routes/tax-rates';
import { ApiError, type Env, type DOStub } from './types';
import { MerchantDO } from './do';
import { mails } from './routes/mails';

export { MerchantDO };

type Variables = {
  db: DOStub;
};

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
});

app.use('*', cors());

app.use('*', async (c, next) => {
  const id = c.env.MERCHANT.idFromName('default');
  const stub = c.env.MERCHANT.get(id);
  c.set('db', stub as unknown as DOStub);
  await next();
});

// Mount public routes BEFORE authentication middleware
app.route('/v1/orders', publicOrders);

app.use('/v1/*', rateLimitMiddleware());

app.onError((err, c) => {
  console.error(err);

  if (err instanceof ApiError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details && { details: err.details }),
        },
      },
      err.statusCode as any
    );
  }

  // Extract detailed error message for database and other errors
  const errorMessage = err instanceof Error ? err.message : String(err);
  const message = `Internal server error${errorMessage ? ': ' + errorMessage : ''}`;

  return c.json({ error: { code: 'internal', message } }, 500);
});

app.get('/', (c) => c.json({ name: 'merchant', version: '0.1.0', ok: true }));

app.route('/v1/setup', setup);
app.route('/v1/ai', ai);
app.route('/v1/products', catalog);
app.route('/v1/inventory', inventory);
app.route('/v1/carts', checkout);
app.route('/v1/orders', orders);
app.route('/v1/customers', customers);
app.route('/v1/webhooks', webhooks);
app.route('/v1/webhooks', webhooksRoutes);
app.route('/v1/images', images);
app.route('/v1/discounts', discounts);
app.route('/v1/regions', regions);
app.route('/v1/tax-rates', taxRates);
app.route('/v1/mails', mails);
app.route('/v1/me', me);
app.route('/oauth', oauth);
app.route('', oauth);
app.route('', ucp);
app.route('/v1/__auth0', auth0Routes);

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Merchant API',
    version: '1.0.0',
    description: 'The open-source commerce backend for Cloudflare + Stripe',
  },
  servers: [{ url: '/' }],
});

app.get('/docs', swaggerUI({ url: '/openapi.json' }));

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const id = env.MERCHANT.idFromName('default');
    const stub = env.MERCHANT.get(id);
    const cleaned = await (stub as unknown as { cleanupExpiredCarts: () => Promise<number> }).cleanupExpiredCarts();
    console.log(`Cron: cleaned ${cleaned} expired carts`);
  },
};
