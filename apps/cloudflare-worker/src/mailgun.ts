/**
 * Mailgun helper for Cloudflare Workers.
 *
 * This module provides a small helper to send emails using Mailgun's API
 * using the environment variables configured in the worker.
 *
 * Requires the following env vars to be set:
 * - MAILGUN_API_KEY
 * - MAILGUN_DOMAIN
 * - MAILGUN_BASE_URL (optional; defaults to https://api.mailgun.net)
 */

export type MailgunSendOptions = {
  /** Recipient email address(es) */
  to: string | string[];
  /** Email subject */
  subject: string;
  /** Plain text body */
  text?: string;
  /** HTML body (optional) */
  html?: string;
  /** From address (optional). Defaults to "postmaster@<domain>". */
  from?: string;
  /** Optional cc recipients */
  cc?: string | string[];
  /** Optional bcc recipients */
  bcc?: string | string[];
};

export type MailgunSendResult = {
  success: boolean;
  status: number;
  statusText: string;
  body: any;
};

export async function sendMailgunEmail(
  env: Env,
  options: MailgunSendOptions,
): Promise<MailgunSendResult> {
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
    form.append(
      "cc",
      Array.isArray(options.cc) ? options.cc.join(",") : options.cc,
    );
  if (options.bcc)
    form.append(
      "bcc",
      Array.isArray(options.bcc) ? options.bcc.join(",") : options.bcc,
    );

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
  let body: any = null;

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
