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

// Load .env variables from the workspace root, including AUTH0_DOMAIN and Auth0 credentials.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Default action name and target trigger for the sample action
const actionName = "Add Userinfo to jwt";
const actionTrigger = "post-login";

/**
 * Get required env variable or throw a descriptive error.
 * @param key Environment variable name
 * @returns environment value
 */
/**
 * Read one environment variable and throw if missing.
 * @param key env var name
 * @returns env var value
 */
function env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env var ${key}`);
  }
  return value;
}

/**
 * Replace or append a key=value line in the .env file.
 * @param key env var name
 * @param value env var value
 */
async function upsertEnv(key: string, value: string) {
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
 * Validate or refresh the Auth0 management token stored in AUTH0_MANAGEMENT_TOKEN.
 */
async function getValidMgmtToken(domain: string, clientId: string, clientSecret: string) {
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
 * Get a management token from Auth0 using client credentials.
 * @param domain Auth0 domain e.g. `fufuni.eu.auth0.com`
 * @param clientId Auth0 management API client id
 * @param clientSecret Auth0 management API client secret
 * @returns Auth0 management API access token
 */
async function getMgmtToken(domain: string, clientId: string, clientSecret: string) {
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
 * Wrapper to call Auth0 Management API with standard headers and JSON parsing.
 * @param domain Auth0 domain
 * @param token Auth0 management token
 * @param path API path or full URL
 * @param options fetch options (method, body, etc.)
 * @returns parsed JSON response
 */
async function auth0Request<T>(
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
  if (!res.ok) {
    throw new Error(`Auth0 ${options.method ?? "GET"} ${url} failed ${res.status} ${res.statusText} ${text}`);
  }
  if (text.length === 0) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

/**
 * Create or update an action with the given code and attach it to the post-login trigger.
 * Uses Auth0 Actions API v2 with proper bindings for trigger attachment.
 * @param auth0Domain Auth0 domain
 * @param token Auth0 management token
 * @param name Action display name
 * @param code Action source code, JS
 */
async function createAndInsert(
  auth0Domain: string,
  token: string,
  name: string,
  code: string,
) {
  let actionId: string;

  // Check if action already exists
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
    // Create new action with code inline (more robust than separate versioning)
    console.log(`Creating action "${name}"...`);
    const newAction = await auth0Request<{ id: string; name: string }>(
      auth0Domain,
      token,
      "actions/actions",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          supported_triggers: [{ id: actionTrigger, version: "v2" }],
          code,
          runtime: "node22",
          dependencies: [],
        }),
      },
    );
    console.log(`✓ Created action (id=${newAction.id})`);
    actionId = newAction.id;
  }

  // Deploy the action to make it live
  console.log(`Deploying action...`);
  try {
    await auth0Request<void>(auth0Domain, token, `actions/actions/${actionId}/deploy`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    console.log(`✓ Deployed action`);
    
    // Auth0 needs a moment to register the deployment before allowing bindings
    // Wait 2 seconds to avoid "action has not been deployed yet" errors
    console.log(`Waiting for deployment to propagate...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (deployError) {
    console.log(`⚠️  Deploy failed: ${deployError}`);
    throw new Error(`Failed to deploy action ${actionId}`);
  }

  // Attach action to post-login trigger binding
  // Use PATCH to add bindings (more reliable than PUT)
  let bindingSuccess = false;
  try {
    const bindingsResponse = await auth0Request<any>(
      auth0Domain,
      token,
      `actions/triggers/${actionTrigger}/bindings`,
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
      console.log(`✓ Attached action to ${actionTrigger} trigger`);
      bindingSuccess = true;
    }
  } catch (bindError) {
    console.log(`⚠️  Could not attach via PATCH /bindings: ${bindError}`);
    
    // Fallback: try GET current bindings and merge
    try {
      const currentBindings = await auth0Request<any>(
        auth0Domain,
        token,
        `actions/triggers/${actionTrigger}/bindings`,
      );

      const existingBindings = currentBindings.bindings ?? [];
      const alreadyBound = existingBindings.some((b: any) => b.ref?.value === actionId);

      if (!alreadyBound) {
        // Add our action to existing bindings
        const updatedBindings = [
          ...existingBindings,
          {
            ref: { type: "action_id", value: actionId },
            display_name: name,
            secrets: [],
          },
        ];

        await auth0Request<void>(auth0Domain, token, `actions/triggers/${actionTrigger}/bindings`, {
          method: "PATCH",
          body: JSON.stringify({ bindings: updatedBindings }),
        });

        console.log(`✓ Attached action to ${actionTrigger} trigger (merged bindings)`);
        bindingSuccess = true;
      } else {
        console.log(`✓ Action already bound to trigger`);
        bindingSuccess = true;
      }
    } catch (fallbackError) {
      console.log(`⚠️  Could not attach action via fallback: ${fallbackError}`);
    }
  }

  // Summary
  console.log(``);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✓ Action Setup Complete`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Action ID:     ${actionId}`);
  console.log(`Action Name:   ${name}`);
  console.log(`Runtime:       node22`);
  console.log(`Deployed:      ✓ Yes`);
  console.log(`Trigger:       ${actionTrigger}`);
  console.log(`Bound:         ${bindingSuccess ? "✓ Yes" : "⚠️  Manual attachment needed"}`);
  console.log(``);

  if (!bindingSuccess) {
    console.log(`⚠️  MANUAL STEP REQUIRED:`);
    console.log(``);
    console.log(`In Auth0 Dashboard (https://manage.auth0.com/):`);
    console.log(`1. Go to: Actions > Triggers > Post-Login`);
    console.log(`2. Click "Add Action"`);
    console.log(`3. Search for "${name}" and select it`);
    console.log(`4. Click "Save"`);
    console.log(``);
  }
}

/**
 * Main entrypoint for the script. Reads env, retrieves token, rewrites action code, and calls createAndInsert.
 */
async function main() {
  const auth0Domain = env("AUTH0_DOMAIN").replace(/\/+$/, "");
  const tenant = env("AUTH0_TENANT");
  const clientId = env("AUTH0_MANAGEMENT_API_CLIENT_ID");
  const clientSecret = env("AUTH0_MANAGEMENT_API_CLIENT_SECRET");

  console.log(`Tenant: ${tenant} (${auth0Domain})`);

  const token = await getValidMgmtToken(auth0Domain, clientId, clientSecret);

  // Load source action code from the script directory, not the current process cwd.
  const scriptDir = new URL("./", import.meta.url);
  const rawCode = await readFile(new URL("./auth0/add-userinfo-to-access-jwt.js", scriptDir), "utf-8");

  // Create or update action with the computed code, then attach to post-login.
  await createAndInsert(auth0Domain, token, actionName, rawCode);

  // other actions should be inserted later
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
