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

import { readFile } from "fs/promises";
import { env, getValidMgmtToken, createAndInsert } from "./auth0-helper";

// Default action name and target trigger for the sample action
const actionName = "Add Userinfo to jwt";
const actionTrigger = "post-login";

/**
 * Main entrypoint for the script. Reads env, retrieves token, rewrites action code, and calls createAndInsert.
 */
async function main() {
  const auth0Domain = env("AUTH0_DOMAIN").replace(/\/+$/, "");
  const tenant = env("AUTH0_TENANT");
  const clientId = env("AUTH0_MANAGEMENT_API_CLIENT_ID");
  const clientSecret = env("AUTH0_MANAGEMENT_API_CLIENT_SECRET");

  if (!auth0Domain || !tenant || !clientId || !clientSecret) {
    throw new Error("Missing required environment variables. Please check your .env file.");
  }
  console.log(`Tenant: ${tenant} (${auth0Domain})`);

  const token = await getValidMgmtToken(auth0Domain, clientId, clientSecret);

  // Load source action code from the script directory, not the current process cwd.
  const scriptDir = new URL("./", import.meta.url);
  const rawCode = await readFile(new URL("./auth0-code/add-userinfo-to-access-jwt.js", scriptDir), "utf-8");

  // Create or update action with the computed code, then attach to post-login.
  await createAndInsert(auth0Domain, token, actionName, rawCode, actionTrigger);

  // other actions should be inserted later
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


