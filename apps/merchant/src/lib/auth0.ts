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

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from 'jose';

/**
 * Verify an Auth0-issued JWT using the tenant's JWKS URL.
 *
 * Only a minimal surface is provided here; we intentionally keep the helper
 * small so that the rest of the app can simply call it and react to errors.
 *
 * @param token - the raw `Bearer` token (JWT) extracted from the header
 * @param domain - Auth0 tenant domain (e.g. `foo.auth0.com`)
 * @param audience - expected audience value included in the token
 * @returns the decoded JWT payload on success
 * @throws an error if verification fails for any reason
 */
export async function verifyAuth0Jwt(
  token: string,
  domain: string,
  audience: string,
): Promise<JWTPayload> {
  // Construct the remote JWKS URL from the tenant domain.  Auth0 exposes
  // this at a well-known path.
  const jwksUrl = `https://${domain}/.well-known/jwks.json`;
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://${domain}/`,
    audience,
  });

  return payload as JWTPayload;
}

/**
 * Retrieves a valid Auth0 Management API access token.
 *
 * This is essentially the same logic that the original cloudflare-worker
 * template used.  It fetches a client_credentials token and caches it in
 * a Durable Object / KV-style store if available.  In the worker we simply
 * keep the token in memory for simplicity, but the interface matches the
 * template so existing client code works unchanged.
 *
 * @param env - environment variables containing Auth0 credentials
 * @returns the raw access token string
 */
export const getManagementToken = async (env: any): Promise<string> => {
  if (
    !env.AUTH0_MANAGEMENT_API_CLIENT_ID ||
    !env.AUTH0_MANAGEMENT_API_CLIENT_SECRET ||
    !env.AUTH0_DOMAIN
  ) {
    const missings: string[] = [];
    if (!env.AUTH0_MANAGEMENT_API_CLIENT_ID) missings.push('AUTH0_MANAGEMENT_API_CLIENT_ID');
    if (!env.AUTH0_MANAGEMENT_API_CLIENT_SECRET) missings.push('AUTH0_MANAGEMENT_API_CLIENT_SECRET');
    if (!env.AUTH0_DOMAIN) missings.push('AUTH0_DOMAIN');
    throw new Error(`Missing Auth0 Management API configuration: ${missings.join(', ')}`);
  }

  const tokenUrl = `https://${env.AUTH0_DOMAIN}/oauth/token`;
  const audience = `https://${env.AUTH0_DOMAIN}/api/v2/`;

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.AUTH0_MANAGEMENT_API_CLIENT_ID,
      client_secret: env.AUTH0_MANAGEMENT_API_CLIENT_SECRET,
      audience,
      grant_type: 'client_credentials',
    }),
  });

  if (!resp.ok) {
    throw new Error(`Auth0 token request failed: ${await resp.text()}`);
  }

  const data = await resp.json();
  return data.access_token as string;
};

/**
 * Add permissions to an Auth0 user using the Management API.
 */
export const addPermissionsToUser = async (
  userId: string,
  permissions: string[],
  env: any,
): Promise<void> => {
  const mgmtToken = await getManagementToken(env);
  const encodedId = encodeURIComponent(userId);
  const url = `https://${env.AUTH0_DOMAIN}/api/v2/users/${encodedId}/permissions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mgmtToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      permissions: permissions.map((p) => ({
        resource_server_identifier: env.AUTH0_AUDIENCE,
        permission_name: p,
      })),
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to add permissions: ${await resp.text()}`);
  }
};