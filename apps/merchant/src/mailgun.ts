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
 * Mailgun helper for the merchant worker.
 *
 * Uses the following environment variables (from worker bindings):
 * - MAILGUN_API_KEY
 * - MAILGUN_DOMAIN
 * - MAILGUN_BASE_URL (optional; defaults to https://api.mailgun.net)
 */

export type SendMailOptions = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
};

export type SendMailResult = {
  success: boolean;
  status: number;
  statusText: string;
  body: any;
};

import type { Env } from './types';

export async function sendMailgunEmail(env: Env, options: SendMailOptions): Promise<SendMailResult> {
  const apiKey = env.MAILGUN_API_KEY;
  const domain = env.MAILGUN_DOMAIN;
  const baseUrl = env.MAILGUN_BASE_URL || "https://api.mailgun.net";

  if (!apiKey || !domain) {
    throw new Error(
      "Missing Mailgun configuration: MAILGUN_API_KEY and MAILGUN_DOMAIN must be set",
    );
  }

  const url = `${baseUrl}/v3/${encodeURIComponent(domain)}/messages`;
  const form = new URLSearchParams();

  form.append("from", options.from ?? `postmaster@${domain}`);
  form.append("to", Array.isArray(options.to) ? options.to.join(",") : options.to);
  form.append("subject", options.subject);

  if (options.text) form.append("text", options.text);
  if (options.html) form.append("html", options.html);
  if (options.cc)
    form.append("cc", Array.isArray(options.cc) ? options.cc.join(",") : options.cc);
  if (options.bcc)
    form.append("bcc", Array.isArray(options.bcc) ? options.bcc.join(",") : options.bcc);

  const auth = `Basic ${btoa(`api:${apiKey}`)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const contentType = response.headers.get("content-type") || "";
  let body: any;

  if (contentType.includes("application/json")) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return {
    success: response.ok,
    status: response.status,
    statusText: response.statusText,
    body,
  };
}
