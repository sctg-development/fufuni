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
import { getDb, type Database } from '../db';
import { ApiError, uuid, now, type HonoEnv } from '../types';
import { hashKey } from '../middleware/auth';

// ============================================================
// OAUTH 2.0 ROUTES
// ============================================================
//
// OAuth 2.0 Authorization Code flow with PKCE for UCP compliance.
// Enables platforms (AI agents, apps) to act on behalf of customers.
//
// CURRENT LIMITATIONS:
// - Magic link shown on screen (no email service yet)
// - Platforms auto-register on first use
//
// ============================================================

export const oauth = new Hono<HonoEnv>();

const VALID_SCOPES = [
  'openid',
  'profile',
  'ucp:scopes:checkout_session',
  'ucp:scopes:order',
  'ucp:scopes:identity',
  'checkout',
  'orders.read',
  'orders.write',
  'addresses.read',
  'addresses.write',
] as const;

type Scope = typeof VALID_SCOPES[number];

// ============================================================
// HELPERS
// ============================================================

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getOrCreateCustomer(
  db: Database,
  email: string
): Promise<{ id: string; email: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  
  let [customer] = await db.query<{ id: string; email: string }>(
    `SELECT id, email FROM customers WHERE email = ?`,
    [normalizedEmail]
  );
  
  if (!customer) {
    const customerId = uuid();
    await db.run(
      `INSERT INTO customers (id, email, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [customerId, normalizedEmail, now(), now()]
    );
    customer = { id: customerId, email: normalizedEmail };
  }
  
  return customer;
}

// ============================================================
// DISCOVERY ENDPOINT
// ============================================================

oauth.get('/.well-known/oauth-authorization-server', async (c) => {
  const baseUrl = new URL(c.req.url).origin;
  
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    scopes_supported: VALID_SCOPES,
    service_documentation: 'https://ucp.dev/specification/overview',
  });
});

// ============================================================
// AUTHORIZATION ENDPOINT
// ============================================================

oauth.get('/authorize', async (c) => {
  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const responseType = c.req.query('response_type');
  const scope = c.req.query('scope') || 'openid profile';
  const state = c.req.query('state');
  const codeChallenge = c.req.query('code_challenge');
  const codeChallengeMethod = c.req.query('code_challenge_method');
  
  if (!clientId) throw ApiError.invalidRequest('client_id is required');
  if (!redirectUri) throw ApiError.invalidRequest('redirect_uri is required');
  if (responseType !== 'code') throw ApiError.invalidRequest('response_type must be "code"');
  if (!codeChallenge) throw ApiError.invalidRequest('code_challenge is required (PKCE)');
  if (codeChallengeMethod !== 'S256') throw ApiError.invalidRequest('code_challenge_method must be S256');
  
  const requestedScopes = scope.split(' ').filter(Boolean);
  const invalidScopes = requestedScopes.filter(s => !VALID_SCOPES.includes(s as Scope));
  if (invalidScopes.length > 0) {
    throw ApiError.invalidRequest(`Invalid scopes: ${invalidScopes.join(', ')}`);
  }
  
  const db = getDb(c.var.db);
  const STORE_NAME = c.env.STORE_NAME || 'Store';
  
  let [client] = await db.query<any>(
    `SELECT * FROM oauth_clients WHERE client_id = ?`,
    [clientId]
  );
  
  if (!client) {
    const domain = new URL(redirectUri).hostname;
    
    await db.run(
      `INSERT INTO oauth_clients (id, client_id, name, redirect_uris, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuid(), clientId, domain, JSON.stringify([redirectUri]), now()]
    );
    
    client = { client_id: clientId, redirect_uris: JSON.stringify([redirectUri]) };
  }
  
  const allowedUris = JSON.parse(client.redirect_uris || '[]');
  if (!allowedUris.includes(redirectUri)) {
    allowedUris.push(redirectUri);
    await db.run(
      `UPDATE oauth_clients SET redirect_uris = ? WHERE client_id = ?`,
      [JSON.stringify(allowedUris), clientId]
    );
  }
  
  const authId = uuid();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  
  await db.run(
    `INSERT INTO oauth_authorizations (id, client_id, redirect_uri, scope, state, code_challenge, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [authId, clientId, redirectUri, scope, state || '', codeChallenge, expiresAt, now()]
  );
  
  const html = generateLoginPage(authId, clientId, scope, STORE_NAME);
  return c.html(html);
});

oauth.post('/authorize', async (c) => {
  const body = await c.req.parseBody();
  const authId = body['auth_id'] as string;
  const email = (body['email'] as string)?.toLowerCase().trim();
  
  if (!authId || !email) {
    throw ApiError.invalidRequest('Missing auth_id or email');
  }
  
  const db = getDb(c.var.db);
  
  const [auth] = await db.query<any>(
    `SELECT * FROM oauth_authorizations WHERE id = ? AND status = 'pending' AND expires_at > ?`,
    [authId, now()]
  );
  
  if (!auth) {
    throw ApiError.invalidRequest('Authorization expired or invalid');
  }
  
  const magicToken = generateSecret();
  const magicTokenHash = await hashKey(magicToken);
  const magicExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  
  await db.run(
    `UPDATE oauth_authorizations SET customer_email = ?, magic_token_hash = ?, magic_expires_at = ? WHERE id = ?`,
    [email, magicTokenHash, magicExpiresAt, authId]
  );
  
  const baseUrl = new URL(c.req.url).origin;
  const magicLink = `${baseUrl}/oauth/verify?token=${magicToken}&auth=${authId}`;
  
  // TODO: Send email via configured provider (Resend, SendGrid, etc.)
  // For now, link is shown in UI for development/testing
  console.log(`[OAuth] Magic link for ${email}: ${magicLink}`);
  
  const html = generateMagicLinkSentPage(email, magicLink);
  return c.html(html);
});

oauth.get('/verify', async (c) => {
  const token = c.req.query('token');
  const authId = c.req.query('auth');
  
  if (!token || !authId) {
    throw ApiError.invalidRequest('Invalid verification link');
  }
  
  const db = getDb(c.var.db);
  const tokenHash = await hashKey(token);
  
  const [auth] = await db.query<any>(
    `SELECT * FROM oauth_authorizations 
     WHERE id = ? AND magic_token_hash = ? AND status = 'pending' AND magic_expires_at > ?`,
    [authId, tokenHash, now()]
  );
  
  if (!auth) {
    throw ApiError.invalidRequest('Link expired or already used');
  }
  
  const code = generateSecret();
  const codeHash = await hashKey(code);
  const codeExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  
  await db.run(
    `UPDATE oauth_authorizations SET status = 'authorized', code_hash = ?, code_expires_at = ? WHERE id = ?`,
    [codeHash, codeExpiresAt, authId]
  );
  
  const redirectUrl = new URL(auth.redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (auth.state) {
    redirectUrl.searchParams.set('state', auth.state);
  }
  
  return c.redirect(redirectUrl.toString());
});

// ============================================================
// TOKEN ENDPOINT
// ============================================================

oauth.post('/token', async (c) => {
  const contentType = c.req.header('Content-Type');
  let body: Record<string, string>;
  
  if (contentType?.includes('application/json')) {
    body = await c.req.json();
  } else {
    body = await c.req.parseBody() as Record<string, string>;
  }
  
  const grantType = body['grant_type'];
  
  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(c, body);
  } else if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(c, body);
  } else {
    throw ApiError.invalidRequest('Unsupported grant_type');
  }
});

async function handleAuthorizationCodeGrant(c: any, body: Record<string, string>) {
  const code = body['code'];
  const redirectUri = body['redirect_uri'];
  const clientId = body['client_id'];
  const codeVerifier = body['code_verifier'];
  
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    throw ApiError.invalidRequest('Missing required parameters');
  }
  
  const db = getDb(c.var.db);
  const codeHash = await hashKey(code);
  
  const [auth] = await db.query<any>(
    `SELECT * FROM oauth_authorizations 
     WHERE code_hash = ? AND client_id = ? AND redirect_uri = ? AND status = 'authorized' AND code_expires_at > ?`,
    [codeHash, clientId, redirectUri, now()]
  );
  
  if (!auth) {
    throw ApiError.invalidRequest('Invalid or expired authorization code');
  }
  
  const expectedChallenge = await generateCodeChallenge(codeVerifier);
  if (expectedChallenge !== auth.code_challenge) {
    throw ApiError.invalidRequest('Invalid code_verifier');
  }
  
  await db.run(`UPDATE oauth_authorizations SET status = 'used' WHERE id = ?`, [auth.id]);
  
  const customer = await getOrCreateCustomer(db, auth.customer_email);
  
  const accessToken = generateSecret();
  const refreshToken = generateSecret();
  const accessTokenHash = await hashKey(accessToken);
  const refreshTokenHash = await hashKey(refreshToken);
  
  const accessExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const tokenId = uuid();
  await db.run(
    `INSERT INTO oauth_tokens (id, client_id, customer_id, access_token_hash, refresh_token_hash, scope, access_expires_at, refresh_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tokenId, clientId, customer.id, accessTokenHash, refreshTokenHash, auth.scope, accessExpiresAt, refreshExpiresAt, now()]
  );
  
  return c.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: auth.scope,
  });
}

async function handleRefreshTokenGrant(c: any, body: Record<string, string>) {
  const refreshToken = body['refresh_token'];
  const clientId = body['client_id'];
  
  if (!refreshToken || !clientId) {
    throw ApiError.invalidRequest('Missing refresh_token or client_id');
  }
  
  const db = getDb(c.var.db);
  const tokenHash = await hashKey(refreshToken);
  
  const [token] = await db.query<any>(
    `SELECT * FROM oauth_tokens WHERE refresh_token_hash = ? AND client_id = ? AND refresh_expires_at > ?`,
    [tokenHash, clientId, now()]
  );
  
  if (!token) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  
  const newAccessToken = generateSecret();
  const newAccessTokenHash = await hashKey(newAccessToken);
  const accessExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  
  await db.run(
    `UPDATE oauth_tokens SET access_token_hash = ?, access_expires_at = ? WHERE id = ?`,
    [newAccessTokenHash, accessExpiresAt, token.id]
  );
  
  return c.json({
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: token.scope,
  });
}

// ============================================================
// REVOCATION ENDPOINT
// ============================================================

oauth.post('/revoke', async (c) => {
  const body = await c.req.parseBody();
  const token = body['token'] as string;
  
  if (!token) {
    return c.json({ revoked: true });
  }
  
  const db = getDb(c.var.db);
  const tokenHash = await hashKey(token);
  
  await db.run(
    `DELETE FROM oauth_tokens WHERE access_token_hash = ? OR refresh_token_hash = ?`,
    [tokenHash, tokenHash]
  );
  
  return c.json({ revoked: true });
});

// ============================================================
// HTML TEMPLATES
// ============================================================

function generateLoginPage(authId: string, clientId: string, scope: string, STORE_NAME: string): string {
  const scopeDescriptions: Record<string, string> = {
    'openid': 'Verify your identity',
    'profile': 'Access your name and email',
    'ucp:scopes:checkout_session': 'Create and manage checkout sessions',
    'ucp:scopes:order': 'Access order information and updates',
    'ucp:scopes:identity': 'Link your account',
    'checkout': 'Create orders on your behalf',
    'orders.read': 'View your order history',
    'orders.write': 'Manage your orders',
    'addresses.read': 'Access your saved addresses',
    'addresses.write': 'Manage your addresses',
  };
  
  const scopes = scope.split(' ').filter(s => scopeDescriptions[s]);
  const scopeList = scopes.map(s => `<li>${scopeDescriptions[s]}</li>`).join('');
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign In - ${STORE_NAME}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 400px; width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 24px; }
    .permissions { background: #f9f9f9; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .permissions h3 { font-size: 14px; color: #666; margin-bottom: 8px; }
    .permissions ul { list-style: none; }
    .permissions li { padding: 4px 0; font-size: 14px; }
    .permissions li::before { content: "✓"; color: #22c55e; margin-right: 8px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
    input[type="email"] { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
    input[type="email"]:focus { outline: none; border-color: #000; }
    button { width: 100%; padding: 12px; background: #000; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; margin-top: 16px; }
    button:hover { background: #333; }
    .footer { text-align: center; margin-top: 16px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign in to ${STORE_NAME}</h1>
    <p class="subtitle"><strong>${clientId}</strong> wants to access your account</p>
    
    <div class="permissions">
      <h3>This will allow them to:</h3>
      <ul>${scopeList}</ul>
    </div>
    
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="auth_id" value="${authId}">
      <label for="email">Email address</label>
      <input type="email" id="email" name="email" placeholder="you@example.com" required autofocus>
      <button type="submit">Continue with Email</button>
    </form>
    
    <p class="footer">We'll send you a link to verify your email</p>
  </div>
</body>
</html>`;
}

function generateMagicLinkSentPage(email: string, magicLink: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Check Your Email</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 400px; width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 24px; }
    .email { font-weight: 600; color: #000; }
    .dev-link { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-top: 24px; font-size: 14px; }
    .dev-link a { color: #92400e; word-break: break-all; }
    .dev-label { font-size: 12px; color: #92400e; margin-bottom: 8px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✉️</div>
    <h1>Check Your Email</h1>
    <p class="subtitle">We sent a verification link to<br><span class="email">${email}</span></p>
    <p style="color: #666; font-size: 14px;">Click the link in the email to continue</p>
    
    <div class="dev-link">
      <p class="dev-label">⚠️ DEV MODE - No email service configured</p>
      <a href="${magicLink}">Click here to verify (dev only)</a>
    </div>
  </div>
</body>
</html>`;
}
