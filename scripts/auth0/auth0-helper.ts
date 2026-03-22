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

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Read environment variable and throw an error if it is missing.
 *
 * @param key Environment variable name.
 * @returns The environment variable value.
 */
export function env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env var ${key}`);
  }
  return value;
}

/**
 * Upsert an environment variable in the .env file and process.env.
 *
 * @param key Environment variable name.
 * @param value Environment variable value.
 */
export async function upsertEnv(key: string, value: string) {
  const envPath = path.resolve(process.cwd(), ".env");
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

  const json = await res.json();
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
export async function getValidMgmtToken(domain: string, clientId: string, clientSecret: string) {
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
  await upsertEnv("AUTH0_MANAGEMENT_TOKEN", newToken);
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

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  const text = await res.text();

  // Auth0 typically returns JSON, but some endpoints may return 204 no content.
  if (!res.ok) {
    throw new Error(`Auth0 ${options.method ?? "GET"} ${url} failed ${res.status} ${res.statusText} ${text}`);
  }

  if (text.length === 0) {
    // Return an empty object when body is empty so generic type T is satisfied.
    return {} as T;
  }

  return JSON.parse(text) as T;
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
) {
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

  // 3) Deploy the action
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
}
