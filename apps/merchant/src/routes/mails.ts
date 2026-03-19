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

// apps/merchant/src/routes/mail.ts
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware, mailAccessOnly } from '../middleware/auth';
import { ApiError, type HonoEnv } from '../types';
import { sendMailgunEmail } from '../mailgun';

const app = new OpenAPIHono<HonoEnv>();
app.use('*', authMiddleware);

const SendMailBody = z.object({
  to: z.union([z.string(), z.array(z.string())]).optional(),
  from: z.string().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
});

const SendMailResponse = z
  .object({
    success: z.boolean(),
    status: z.number(),
    statusText: z.string(),
    body: z.any(),
  })
  .openapi('SendMailResponse');

const sendMail = createRoute({
  method: 'post',
  path: '/send',
  tags: ['Mail'],
  summary: 'Send a test email via Mailgun',
  security: [{ bearerAuth: ['mail:api'] }],
  middleware: [mailAccessOnly] as const,
  request: {
    body: {
      content: {
        'application/json': { schema: SendMailBody },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: SendMailResponse } }, description: 'Mailgun response' },
    400: { content: { 'application/json': { schema: SendMailResponse } }, description: 'Invalid request or Mailgun error' },
  },
});

app.openapi(sendMail, async (c) => {
  const body = c.req.valid('json');
  const to = body.to ?? c.env.MAILGUN_USER;
  const subject = body.subject ?? 'Test email from Merchant API';
  const text =
    body.text ??
    'This is a test email sent via Mailgun. If you received this message, the Mailgun integration is working.';

  if (!to) {
    throw ApiError.invalidRequest(
      'No recipient specified. Set MAILGUN_USER or include `to` in the request body.',
    );
  }

  try {
    const result = await sendMailgunEmail(c.env, {
      to,
      from: body.from,
      subject,
      text,
      html: body.html,
    });

    return c.json(result, result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw ApiError.invalidRequest(message);
  }
});

export { app as mails };