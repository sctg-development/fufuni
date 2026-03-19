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
 * apps/merchant/src/lib/email-templates.ts
 * 
 * HTML email templates for transactional emails.
 */

/**
 * Generates the HTML body for an order confirmation email.
 *
 * @param params.orderNumber  - Human-readable order number, e.g. "ORD-260316-AB12"
 * @param params.orderUrl     - Full URL to the order status page (with signed token)
 * @param params.STORE_NAME    - Display name of the store
 * @param params.totalcents   - Order total in cents
 * @param params.currency     - ISO 4217 currency code, e.g. "EUR"
 */
export function buildOrderConfirmationEmail(params: {
  orderNumber: string;
  orderUrl: string;
  STORE_NAME: string;
  totalcents: number;
  currency: string;
}): { subject: string; html: string; text: string } {
  const { orderNumber, orderUrl, STORE_NAME, totalcents, currency } = params;

  // Format total for display
  const total = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(totalcents / 100);

  const subject = `Order Confirmation ${orderNumber} — ${STORE_NAME}`;

  // Plain-text version (for email clients that don't render HTML)
  const text = [
    `Thank you for your order!`,
    ``,
    `Order Number: ${orderNumber}`,
    `Total: ${total}`,
    ``,
    `Track your order here (link valid for 30 days):`,
    orderUrl,
    ``,
    `— The ${STORE_NAME} Team`,
  ].join('\n');

  // HTML version
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Order Confirmation</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f5f5; font-family: system-ui, sans-serif; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px;
               padding: 40px 32px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    h1 { font-size: 22px; margin-top: 0; color: #111; }
    .badge { display: inline-block; background: #f0fdf4; color: #16a34a;
             border-radius: 999px; padding: 4px 14px; font-size: 13px; font-weight: 600; }
    .order-number { font-size: 15px; color: #555; margin-top: 8px; }
    .total { font-size: 18px; font-weight: 700; color: #111; margin: 24px 0 8px; }
    .cta { display: block; text-align: center; background: #111; color: #fff !important;
           text-decoration: none; border-radius: 8px; padding: 14px 24px;
           font-size: 15px; font-weight: 600; margin: 28px 0; }
    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 32px; }
    .footer a { color: #999; }
  </style>
</head>
<body>
  <div class="wrapper">
    <span class="badge">✅ Order Confirmed</span>
    <h1>Thank you for your order!</h1>
    <p class="order-number">Order Number: <strong>${orderNumber}</strong></p>
    <p class="total">Total: ${total}</p>
    <p style="color:#555;font-size:14px;">
      You can track your order status at any time by clicking the link below.
      This link is valid for <strong>30 days</strong>.
    </p>
    <a href="${orderUrl}" class="cta">Track My Order →</a>
    <p style="color:#999;font-size:12px;text-align:center;">
      If the button doesn't work, copy this link into your browser:<br/>
      <a href="${orderUrl}" style="color:#555;word-break:break-all;">${orderUrl}</a>
    </p>
    <div class="footer">
      — The ${STORE_NAME} Team<br/>
      <small>This link is personal. Please don't share it.</small>
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
