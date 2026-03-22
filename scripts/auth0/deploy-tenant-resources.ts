import { readFile, writeFile } from "fs/promises";
import path from "path";
import readline from "readline";
import {
  env,
  loadEnvFile,
  upsertEnv,
  getValidMgmtToken,
  getClientById,
  createOrUpdateClient,
  createOrUpdateResourceServer,
  enableConnectionForClient,
  createAndInsert,
  auth0Request,
} from "./auth0-helper";

function printHelp() {
  console.log(`Usage: npx tsx scripts/auth0/deploy-tenant-resources.ts -- --env-file=<path> [--help] [--detailed-help]`);
  console.log(`
  --env-file=<path>    Required. Path to a dotenv file containing Auth0 settings.
  --help               Display this basic help and exit.
  --detailed-help      Display detailed setup instructions and exit.
  `);
}

function printDetailedHelp() {
  console.log(`Auth0 Management Environment Variables Setup (step-by-step):\n`);
  console.log(`1. In the Auth0 Dashboard, open APIs and locate the Auth0 Management API.\n`);
  console.log(`2. Click on "Test" or "Settings" and then "Create and Authorize Test Application".\n`);
  console.log(`3. Open the created app (Auth0 Management API test application).\n`);
  console.log(`4. In the app settings, copy Client ID and Client Secret.\n`);
  console.log(`5. Find your tenant domain in the dashboard header (e.g. my-tenant.eu.auth0.com).\n`);
  console.log(`\nRequired .env variables:\n`);
  console.log(`AUTH0_DOMAIN=<your-tenant>.eu.auth0.com`);
  console.log(`AUTH0_TENANT=<your-tenant> (used for prefixes and naming)`);
  console.log(`AUTH0_MANAGEMENT_API_CLIENT_ID=<your-management-client-id>`);
  console.log(`AUTH0_MANAGEMENT_API_CLIENT_SECRET=<your-management-client-secret>`);
  console.log(`AUTH0_AUDIENCE=https://api.<your-domain>/`);
  console.log(`STORE_URL=http://localhost:5173`);
  console.log(`\n6. Save these values into the file passed to --env-file via npx tsx scripts/auth0/deploy-tenant-resources.ts -- --env-file=.env.test\n`);
  console.log(`7. Run the script and verify the output.\n`);
  console.log(`Tip: keep this file out of source control. Use secret management for production values.\n`);
}

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}


async function buildEnvIfMissing(fileVars: Record<string, string>, strictFileMode: boolean, envFilePath: string | undefined) {
  const required = [
    "AUTH0_DOMAIN",
    "AUTH0_TENANT",
    "AUTH0_MANAGEMENT_API_CLIENT_ID",
    "AUTH0_MANAGEMENT_API_CLIENT_SECRET",
    "AUTH0_AUDIENCE",
    "STORE_URL",
  ];

  const current = Object.fromEntries(
    required.map((key) => {
      if (strictFileMode) {
        return [key, fileVars[key] || ""];
      }
      return [key, fileVars[key] || process.env[key] || ""];
    }),
  );
  const needs = required.filter((key) => !current[key]);

  if (needs.length === 0) {
    return;
  }

  console.log("Some required env vars are missing. We will prompt you to fill them.");
  for (const key of needs) {
    const answer = await ask(`${key}: `);
    if (!answer) {
      throw new Error(`Missing value for ${key}`);
    }
    current[key] = answer;
    process.env[key] = answer;
  }

  const savePath = await ask(`Save these values to ${envFilePath || ".env"} now? (y/n) `);
  if (savePath.toLowerCase().startsWith("y")) {
    const content = required
      .map((key) => `${key}=${current[key]}`)
      .join("\n")
      .concat("\n");

    await writeFile(path.resolve(process.cwd(), envFilePath || ".env"), content, "utf-8");
    console.log(`${envFilePath || ".env"} updated.`);
  }
}

async function getCallbacks() {
  const storeUrl = env("STORE_URL", "http://localhost:5173");
  return ["http://localhost:5173/", "http://localhost:5173", storeUrl, `${storeUrl}/`];
}

async function deployResources() {
  const args = process.argv.slice(2);
  const envFileArg = args.find((arg) => arg.startsWith("--env-file="));
  const envFilePath = envFileArg ? envFileArg.split("=")[1] : undefined;

  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--detailed-help")) {
    printDetailedHelp();
    process.exit(0);
  }

  if (!envFilePath) {
    console.error("Error: --env-file is required. Use --help for usage details.");
    printHelp();
    process.exit(1);
  }

  let fileVars: Record<string, string> = {};
  const strictFileMode = true; // With --env-file mandatory, strict mode is always true

  if (envFilePath) {
    // Strict file environment mode: use values in file, ignore terminal ENV for required keys
    fileVars = loadEnvFile(envFilePath, true);

    // Ensure no global token leaks into strict env-file mode
    delete process.env.AUTH0_MANAGEMENT_TOKEN;

    const required = [
      "AUTH0_DOMAIN",
      "AUTH0_TENANT",
      "AUTH0_MANAGEMENT_API_CLIENT_ID",
      "AUTH0_MANAGEMENT_API_CLIENT_SECRET",
      "AUTH0_AUDIENCE",
      "STORE_URL",
    ];

    for (const key of required) {
      if (fileVars[key] !== undefined) {
        process.env[key] = fileVars[key];
      } else {
        delete process.env[key];
      }
    }
  } else {
    // Non-file mode: load default .env if present (without overwriting shell vars)
    fileVars = loadEnvFile(".env", false);
  }

  await buildEnvIfMissing(fileVars, strictFileMode, envFilePath);

  const auth0Domain = env("AUTH0_DOMAIN").replace(/\/+$/, "");
  const tenant = env("AUTH0_TENANT");
  const managementClientId = env("AUTH0_MANAGEMENT_API_CLIENT_ID");
  const managementClientSecret = env("AUTH0_MANAGEMENT_API_CLIENT_SECRET");
  const audience = env("AUTH0_AUDIENCE");
  const appName = process.env.AUTH0_APP_NAME || `${tenant}-app`;
  const postLoginActionName = process.env.AUTH0_POST_LOGIN_ACTION_NAME || "Add Userinfo to jwt";

  const callbacks = await getCallbacks();
  console.log(`Using callback URLs: ${callbacks.join(", ")}`);

  console.log(`Auth0 tenant: ${tenant} (${auth0Domain})`);

  const token = await getValidMgmtToken(auth0Domain, managementClientId, managementClientSecret, envFilePath || ".env");

  const targetEnvFile = envFilePath || ".env";
  const clientConfig = {
    name: appName,
    app_type: "spa",
    grant_types: ["authorization_code", "refresh_token"],
    callbacks,
    web_origins: callbacks,
    allowed_logout_urls: ["http://localhost:5173", "http://localhost:5173/"],
    token_endpoint_auth_method: "none",
    oidc_conformant: true,
    is_first_party: true,
  };

  let client;
  const existingClientId = process.env.AUTH0_CLIENT_ID;

  if (existingClientId) {
    console.log(`Found AUTH0_CLIENT_ID in env file: ${existingClientId}, validating client configuration...`);
    const existingClient = await getClientById(auth0Domain, token, existingClientId);
    if (existingClient) {
      client = await auth0Request<any>(auth0Domain, token, `clients/${encodeURIComponent(existingClientId)}`, {
        method: "PATCH",
        body: JSON.stringify(clientConfig),
      });
    } else {
      console.log(`Client ID ${existingClientId} not found in Auth0, creating/updating by name (${appName})`);
      client = await createOrUpdateClient(auth0Domain, token, clientConfig);
    }
  } else {
    console.log(`No existing AUTH0_CLIENT_ID found, creating/updating application '${appName}'`);
    client = await createOrUpdateClient(auth0Domain, token, clientConfig);
  }

  console.log(`Client id: ${client.client_id}`);

  await upsertEnv("AUTH0_CLIENT_ID", client.client_id, targetEnvFile);
  if (client.client_secret) {
    await upsertEnv("AUTH0_CLIENT_SECRET", client.client_secret, targetEnvFile);
  } else if (process.env.AUTH0_CLIENT_SECRET) {
    await upsertEnv("AUTH0_CLIENT_SECRET", process.env.AUTH0_CLIENT_SECRET, targetEnvFile);
  } else {
    console.warn("Client secret not returned by Auth0 API; please set AUTH0_CLIENT_SECRET manually in your env file.");
  }

  console.log(`Creating or updating resource server with audience '${audience}'`);
  const api = await createOrUpdateResourceServer(auth0Domain, token, {
    name: `${tenant}-api`,
    identifier: audience,
    scopes: [
      { value: "read:messages", description: "Read messages" },
      { value: "write:messages", description: "Write messages" },
    ],
    signing_alg: "RS256",
    allow_offline_access: true,
    token_dialect: "access_token_authz",
    enforce_policies: true,
    token_lifetime: 3600,
  });

  const socialConnections = ["github", "google-oauth2", "windowslive", "apple"];

  for (const connection of socialConnections) {
    console.log(`Enabling connection '${connection}' for client ${client.client_id}`);
    const updatedConnection = await enableConnectionForClient(auth0Domain, token, connection, client.client_id);
    if (!updatedConnection) {
      console.warn(`Connection '${connection}' was not available, skipping.`);
    }
  }

  console.log(`Installing/updating post-login action '${postLoginActionName}'`);
  const scriptDir = new URL("./", import.meta.url);
  const actionCode = await readFile(new URL("./auth0-code/add-userinfo-to-access-jwt.js", scriptDir), "utf-8");

  const actionId = await createAndInsert(auth0Domain, token, postLoginActionName, actionCode, "post-login");
  await upsertEnv("AUTH0_ACTION_USERINFO", actionId, targetEnvFile);

  console.log(`\nDeployment complete.`);
  console.log(`App: ${client.name} (${client.client_id})`);
  console.log(`API: ${api.name} (${api.identifier})`);
}

deployResources().catch((err) => {
  console.error(err);
  process.exit(1);
});
