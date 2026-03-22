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

import { readFile, writeFile } from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { decodeJwt } from "jose";

export const RETRY_LIMIT = 3;
export const RETRY_DELAY_MS = 10000;
export const BUILD_DELAY_MS = 2000;

/**
 * Load environment variables from a .env file and optionally override existing process.env values.
 *
 * @param filePath Optional path to the .env file (defaults to ".env" in current working directory).
 * @param overrideExisting If true, variables from the file will overwrite existing process.env values. Default is false (file vars only set if not already in process.env).
 * @returns An object with the parsed key-value pairs from the .env file.
 */
export function loadEnvFile(filePath?: string, overrideExisting: boolean = false): Record<string, string> {
  const resolvedPath = path.resolve(process.cwd(), filePath || ".env");

  let parsed: Record<string, string> = {};

  try {
    const fs = require("fs");
    if (!fs.existsSync(resolvedPath)) {
      fs.writeFileSync(resolvedPath, "", { encoding: "utf-8" });
      console.log(`Created env file at ${resolvedPath}`);
    }

    const envContent = fs.readFileSync(resolvedPath, "utf-8");
    parsed = dotenv.parse(envContent);

    if (overrideExisting) {
      for (const [key, value] of Object.entries(parsed)) {
        process.env[key] = value;
      }
    } else {
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    dotenv.config({ path: resolvedPath });
  } catch (err) {
    console.warn(`Could not load env file: ${resolvedPath}.`, err);
    dotenv.config({ path: resolvedPath });
  }

  return parsed;
}


/**
 * Read environment variable and throw an error if it is missing, or return default.
 *
 * @param key Environment variable name.
 * @param fallback Optional fallback value when var is absent.
 * @returns The environment variable value or fallback.
 */
export function env(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value && value.length > 0) {
    return value;
  }
  if (fallback && fallback.length > 0) {
    return fallback;
  }
  throw new Error(`Missing env var ${key}`);
}


/**
 * Upsert an environment variable in the .env file and process.env.
 *
 * @param key Environment variable name.
 * @param value Environment variable value.
 */
export async function upsertEnv(key: string, value: string, filePath: string = ".env") {
  const envPath = path.resolve(process.cwd(), filePath);
  let content = "";

  try {
    content = await readFile(envPath, "utf-8");
  } catch (error) {
    if ((error as any).code !== "ENOENT") throw error;
  }

  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    content = content.replace(pattern, `${key}=${value}`);
  } else {
    if (!content.endsWith("\n") && content.length > 0) {
      content += "\n";
    }
    content += `${key}=${value}\n`;
  }

  await writeFile(envPath, content, "utf-8");
  process.env[key] = value;
}

/**
 * Request a management token from Auth0 using client credentials.
 *
 * @param domain Auth0 tenant domain (e.g. fufuni.eu.auth0.com).
 * @param clientId Management API client ID.
 * @param clientSecret Management API client secret.
 * @returns Access token string.
 * @see https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens
 */
export async function getMgmtToken(domain: string, clientId: string, clientSecret: string) {
  const url = `https://${domain}/oauth/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Auth0 token request failed ${res.status} ${res.statusText}: ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token?: string; [key: string]: unknown };
  if (!json.access_token) {
    throw new Error(`No access_token in Auth0 response: ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

/**
 * Validate cached management token or refresh it by requesting a new one.
 *
 * @param domain Auth0 tenant domain.
 * @param clientId Management API client ID.
 * @param clientSecret Management API client secret.
 * @returns A valid management token.
 * @see https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens
 */
export async function getValidMgmtToken(domain: string, clientId: string, clientSecret: string, envFilePath: string = ".env") {
  const cached = process.env.AUTH0_MANAGEMENT_TOKEN;

  if (cached) {
    try {
      const payload = decodeJwt(cached);
      const exp = payload.exp;
      if (typeof exp === "number") {
        const now = Math.floor(Date.now() / 1000);
        if (exp > now + 30) {
          console.log("Using cached Auth0 management token");
          return cached;
        }
      }
      console.log("Cached token expired or invalid, fetching a new token");
    } catch (err) {
      console.log("Failed to decode cached token, fetching a new one", err);
    }
  }

  const newToken = await getMgmtToken(domain, clientId, clientSecret);
  await upsertEnv("AUTH0_MANAGEMENT_TOKEN", newToken, envFilePath);
  return newToken;
}

/**
 * Perform a request to Auth0 Management API with authentication and JSON standard.
 *
 * @template T Return type for parsed response body.
 * @param domain Auth0 tenant domain, e.g. "fufuni.eu.auth0.com".
 * @param token Valid Bearer token for Management API.
 * @param path Endpoint path to call (absolute URL or relative to /api/v2/).
 * @param options Optional fetch options: method, body, headers, etc.
 * @returns Parsed JSON response as type T.
 * @throws Error when response is not OK.
 * @see https://auth0.com/docs/api/management/v2
 */
export async function auth0Request<T>(
  domain: string,
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `https://${domain}/api/v2/${path.replace(/^\/+/, "")}`;

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });

    const text = await res.text();

    if (res.ok) {
      if (text.length === 0) {
        // Return an empty object when body is empty so generic type T is satisfied.
        return {} as T;
      }
      return JSON.parse(text) as T;
    }

    if (res.status === 429 && attempt < RETRY_LIMIT - 1) {
      console.warn(`Auth0 429 rate limit hit, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt + 1}/${RETRY_LIMIT})`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      continue;
    }

    throw new Error(`Auth0 ${options.method ?? "GET"} ${url} failed ${res.status} ${res.statusText} ${text}`);
  }

  throw new Error(`Auth0 ${options.method ?? "GET"} ${url} failed after ${RETRY_LIMIT} retries`);
}

/**
 * Find an Auth0 client by name.
 *
 * @param domain Auth0 tenant domain.
 * @param token Management API token.
 * @param name Client name.
 * @returns Client object or null.
 */
export async function findClientByName(domain: string, token: string, name: string) {
  const clients = await auth0Request<any[]>(
    domain,
    token,
    `clients?fields=client_id,name&include_fields=true`,
  );
  return clients.find((client) => client.name === name) ?? null;
}

/**
 * Create or update an Auth0 client (application).
 *
 * @param domain Auth0 tenant domain.
 * @param token Management API token.
 * @param config Object with client config {name, app_type, grant_types, callbacks, logout_urls, token_endpoint_auth_method}.
 * @returns The created or updated client.
 * @see https://auth0.com/docs/api/management/v2#!/Clients/patch_clients_by_id
 */
export async function createOrUpdateClient(domain: string, token: string, config: any) {
  const existing = await findClientByName(domain, token, config.name);
  if (existing) {
    const updated = await auth0Request<any>(
      domain,
      token,
      `clients/${encodeURIComponent(existing.client_id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(config),
      },
    );
    return updated;
  }

  const created = await auth0Request<any>(
    domain,
    token,
    "clients",
    {
      method: "POST",
      body: JSON.stringify(config),
    },
  );
  return created;
}

/**
 * Get client by its client_id
 */
export async function getClientById(domain: string, token: string, clientId: string) {
  try {
    return await auth0Request<any>(domain, token, `clients/${encodeURIComponent(clientId)}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) {
      return null;
    }
    throw err;
  }
}

/**
 * Find a resource server by audience.
 *
 * @param domain Auth0 tenant domain.
 * @param token Management API token.
 * @param audience Api audience string.
 * @returns Resource server object or null.
 */
export async function findResourceServerByAudience(domain: string, token: string, audience: string) {
  const servers = await auth0Request<any[]>(domain, token, "resource-servers");
  return servers.find((s) => s.identifier === audience) ?? null;
}

/**
 * Create or update a resource server (API).
 *
 * @param domain Auth0 tenant domain.
 * @param token Management API token.
 * @param config Object {name, identifier, scopes, signing_alg, token_lifetime, allow_offline_access}.
 * @returns The created or updated resource server.
 * @see https://auth0.com/docs/api/management/v2#!/Resource_Servers/patch_resource_servers_by_id
 */
export async function createOrUpdateResourceServer(domain: string, token: string, config: any) {
  const existing = await findResourceServerByAudience(domain, token, config.identifier);
  if (existing) {
    // identifier is immutable, so we cannot send it in PATCH payload.
    const patchPayload = { ...config };
    delete patchPayload.identifier;

    const updated = await auth0Request<any>(
      domain,
      token,
      `resource-servers/${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(patchPayload),
      },
    );
    return updated;
  }

  const created = await auth0Request<any>(
    domain,
    token,
    "resource-servers",
    {
      method: "POST",
      body: JSON.stringify(config),
    },
  );
  return created;
}

/**
 * Get a connection by strategy name.
 *
 * @param domain Auth0 tenant domain.
 * @param token Management API token.
 * @param name Connection name (e.g. github, google-oauth2, windowslive, apple).
 * @returns Connection object or null.
 */
export async function findConnectionByName(domain: string, token: string, name: string) {
  // Query with allowed fields set. Note: `clients` is correct property for enabled clients.
  const connections = await auth0Request<any[]>(
    domain,
    token,
    `connections?strategy=${encodeURIComponent(name)}&fields=id,name,clients&include_fields=true`,
  );
  if (!Array.isArray(connections)) {
    return null;
  }
  return connections.find((c) => c.name === name || c.strategy === name) ?? null;
}

/**
 * Ensure a connection is enabled for a client by adding client_id to enabled_clients.
 *
 * @param domain Auth0 tenant domain.
 * @param token Management API token.
 * @param connectionName Connection name (e.g. github).
 * @param clientId Client ID to enable.
 * @returns Updated connection object or null if connection does not exist.
 * @see https://auth0.com/docs/api/management/v2#!/Connections/patch_connections_by_id
 */
export async function createConnectionIfMissing(domain: string, token: string, strategy: string) {
  const existing = await findConnectionByName(domain, token, strategy);
  if (existing) {
    return existing;
  }

  console.log(`Creating connection for strategy '${strategy}'...`);
  // For built-in social providers in Auth0, creating may require minimal payload.
  // If not supported by API, this may fail; user can create manually via dashboard.
  const created = await auth0Request<any>(
    domain,
    token,
    "connections",
    {
      method: "POST",
      body: JSON.stringify({
        name: strategy,
        strategy,
      }),
    },
  );

  return created;
}

export async function enableConnectionForClient(domain: string, token: string, connectionName: string, clientId: string) {
  let connection = await findConnectionByName(domain, token, connectionName);

  if (!connection) {
    console.warn(`Connection '${connectionName}' not found, attempting to create`);
    try {
      connection = await createConnectionIfMissing(domain, token, connectionName);
    } catch (err) {
      console.warn(`Could not create connection '${connectionName}':`, err);
      return null;
    }
  }

  if (!connection || !connection.id) {
    console.warn(`Connection '${connectionName}' still missing after create attempt`);
    return null;
  }

  const clientsForConnection = Array.isArray(connection.clients) ? connection.clients : [];
  if (!clientsForConnection.includes(clientId)) {
    const payload = [
      {
        client_id: clientId,
        status: true,
      },
    ];
    const updatedConnection = await auth0Request<any>(
      domain,
      token,
      `connections/${encodeURIComponent(connection.id)}/clients`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
    return updatedConnection;
  }

  return connection;
}

/**
 * Create an Auth0 action or update an existing one, deploy it, and bind it to a trigger.
 *
 * @param auth0Domain Auth0 tenant domain (without protocol).
 * @param token Management API token.
 * @param name Display name of the action.
 * @param code JavaScript source code to store in the action.
 * @param trigger Auth0 trigger name (defaults to "post-login").
 * @returns Promise<void> once action is created, deployed, and bound.
 */
export async function createAndInsert(
  auth0Domain: string,
  token: string,
  name: string,
  code: string,
  trigger: string = "post-login",
): Promise<string> {
  let actionId: string;

  // 1) List existing actions to check if this action already exists
  const existingActionsResponse = await auth0Request<any>(
    auth0Domain,
    token,
    `actions/actions?per_page=100`,
  );

  const existingActions: Array<{ id: string; name: string }> = Array.isArray(existingActionsResponse)
    ? existingActionsResponse
    : existingActionsResponse?.actions ?? [];

  const existingAction = existingActions.find((a) => a.name === name);

  if (existingAction) {
    console.log(`✓ Action "${name}" already exists (id=${existingAction.id})`);
    actionId = existingAction.id;
  } else {
    // 2) Create new action if it does not exist
    console.log(`Creating action "${name}"...`);
    const newAction = await auth0Request<{ id: string; name: string }>(
      auth0Domain,
      token,
      "actions/actions",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          supported_triggers: [{ id: trigger, version: "v2" }],
          code,
          runtime: "node22",
          dependencies: [],
        }),
      },
    );
    console.log(`✓ Created action (id=${newAction.id})`);
    actionId = newAction.id;
  }

  // 3) Wait for the action to reach built state before deploy (Auth0 does not expose /build endpoint reliably for this flow)
  let built = false;
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    if (attempt > 0) {
      console.log(`Waiting ${BUILD_DELAY_MS}ms before rechecking action state (attempt ${attempt + 1}/${RETRY_LIMIT})`);
      await new Promise((resolve) => setTimeout(resolve, BUILD_DELAY_MS));
    } else {
      console.log(`Waiting ${BUILD_DELAY_MS}ms for initial action readiness check`);
      await new Promise((resolve) => setTimeout(resolve, BUILD_DELAY_MS));
    }

    const actionStatus = await auth0Request<any>(auth0Domain, token, `actions/actions/${actionId}`);
    const status = actionStatus?.status ?? "unknown";
    console.log(`Action status: ${status}`);

    if (status === "built" || status === "published") {
      built = true;
      break;
    }
  }

  if (!built) {
    throw new Error(`Action ${actionId} is not in built state after ${RETRY_LIMIT} attempts`);
  }

  // 4) Deploy the action
  console.log(`Deploying action...`);
  try {
    await auth0Request<void>(auth0Domain, token, `actions/actions/${actionId}/deploy`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    console.log(`✓ Deployed action`);

    // Wait a short moment for Auth0 backend to synchronize deployment state.
    console.log(`Waiting for deployment to propagate...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (deployError) {
    console.log(`⚠️  Deploy failed: ${deployError}`);
    throw new Error(`Failed to deploy action ${actionId}`);
  }

  // 4) Bind the action to the requested trigger (PATCH preferred). Fallback to merge if needed.
  let bindingSuccess = false;
  try {
    const bindingsResponse = await auth0Request<any>(
      auth0Domain,
      token,
      `actions/triggers/${trigger}/bindings`,
      {
        method: "PATCH",
        body: JSON.stringify({
          bindings: [
            {
              ref: { type: "action_id", value: actionId },
              display_name: name,
              secrets: [],
            },
          ],
        }),
      },
    );

    if (bindingsResponse && bindingsResponse.bindings) {
      console.log(`✓ Attached action to ${trigger} trigger`);
      bindingSuccess = true;
    }
  } catch (bindError) {
    console.log(`⚠️  Could not attach via PATCH /bindings: ${bindError}`);

    // Fallback: fetch current bindings and merge if required
    try {
      const currentBindings = await auth0Request<any>(
        auth0Domain,
        token,
        `actions/triggers/${trigger}/bindings`,
      );

      const existingBindings = currentBindings.bindings ?? [];
      const alreadyBound = existingBindings.some((b: any) => b.ref?.value === actionId);

      if (!alreadyBound) {
        const updatedBindings = [
          ...existingBindings,
          {
            ref: { type: "action_id", value: actionId },
            display_name: name,
            secrets: [],
          },
        ];

        await auth0Request<void>(auth0Domain, token, `actions/triggers/${trigger}/bindings`, {
          method: "PATCH",
          body: JSON.stringify({ bindings: updatedBindings }),
        });

        console.log(`✓ Attached action to ${trigger} trigger (merged bindings)`);
        bindingSuccess = true;
      } else {
        console.log(`✓ Action already bound to trigger`);
        bindingSuccess = true;
      }
    } catch (fallbackError) {
      console.log(`⚠️  Could not attach action via fallback: ${fallbackError}`);
    }
  }

  // 5) Print a final report for inspection
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✓ Action Setup Complete`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Action ID:     ${actionId}`);
  console.log(`Action Name:   ${name}`);
  console.log(`Runtime:       node22`);
  console.log(`Deployed:      ✓ Yes`);
  console.log(`Trigger:       ${trigger}`);
  console.log(`Bound:         ${bindingSuccess ? "✓ Yes" : "⚠️  Manual attachment needed"}`);
  console.log(`\n`);

  if (!bindingSuccess) {
    console.log(`⚠️  MANUAL STEP REQUIRED:`);
    console.log(`\nIn Auth0 Dashboard (https://manage.auth0.com/):`);
    console.log(`1. Go to: Actions > Triggers > ${trigger}`);
    console.log(`2. Click "Add Action"`);
    console.log(`3. Search for "${name}" and select it`);
    console.log(`4. Click "Save"`);
    console.log(`\n`);
  }

  return actionId;
}
