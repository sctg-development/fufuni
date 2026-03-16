![](https://tokeisrv.sctg.eu.org/b1/github.com/sctg-development/fufuni?type=TypeScript,TSX,html&category=code)
![](https://tokeisrv.sctg.eu.org/b1/github.com/sctg-development/fufuni?type=TypeScript,TSX,html&category=comments)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![HeroUI](https://img.shields.io/badge/HeroUI-v2-black)](https://www.heroui.com/)
[![Auth0](https://img.shields.io/badge/Auth0-Secured-EB5424?logo=auth0)](https://auth0.com/)
# Merchant, Vite, OAuth & HeroUI Template

Welcome to a fully‑functional starter you can fork and deploy in minutes 🔥

This monorepo template combines **Vite 7**, **HeroUI v2**, and a powerful
authentication abstraction supporting multiple OAuth providers (Auth0, Dex,
and others). The repo includes a backend Cloudflare Worker demo with
built‑in automatic permission provisioning and OpenAPI documentation, a
polished landing page with one‑click login, and complete i18n support.

Under the hood it uses Turborepo and npm workspaces for fast installs,
parallel builds and a great developer experience.

[Try it on CodeSandbox](https://githubbox.com/sctg-development/fufuni)

## Star the project

**If you appreciate my work, please consider giving it a star! 🤩**

## Live demo

Click the screenshot below to try the public deployment. Visitors see an
attractive landing page with a **Log in** button and direct links to a sample
API and auto‑generated OpenAPI/Swagger docs — no auth required to view the
interface.

<img width="1347" height="1603" alt="image" src="https://github.com/user-attachments/assets/276ba064-4483-40ac-acd7-fd19345200ba" />


## On Github Pages ?

Ths plugin uses our [@sctg/vite-plugin-github-pages-spa](https://github.com/sctg-development/vite-plugin-github-pages-spa) Vite 6 plugin for handling the Github Pages limitations with SPA.

## Features

### 🛍️ Store & Products
- Product catalogue with variants, SKUs and per-variant multi-currency pricing
- **Multilingual product titles** — plain text or JSON per locale, with AI translation
- **Multilingual product descriptions** — rich HTML (Tiptap editor) or JSON per locale, with AI translation
- RTL language support (Arabic, Hebrew)
- Product image management (Cloudflare R2)
- Inventory management across multiple warehouses

### 💳 Payments & Orders
- Stripe Checkout integration with webhook reconciliation
- Multi-currency, multi-region pricing (explicit per-variant prices in `variantprices`)
- Order lifecycle: `pending → paid → processing → shipped → delivered → refunded → canceled`
- Tracking number and URL per order
- Discount codes (fixed amount / percentage)

### 👥 Customers & Auth
- Auth0-based authentication for admin (JWT + RBAC permissions)
- Customer accounts with address book
- OAuth 2.0 UCP (Universal Checkout Protocol) for customer-facing flows
- Magic-link checkout

### 🌍 Internationalisation
- 6 built-in locales: **English (US)**, **French**, **Spanish**, **Chinese (Simplified)**,
  **Arabic**, **Hebrew**
- `availableLanguages` registry with `nativeName`, `isRTL`, `isDefault` flags
- Locale-aware price display (`Intl.NumberFormat`, ISO 4217)

### 🤖 AI Translation
- One-click translation for product titles and descriptions
- Provider auto-detection: **Groq**, **OpenAI**, **Anthropic**
- Permission-gated (`AI_PERMISSION` env var) — only visible to authorised admins
- HTML-aware mode (preserves Tiptap markup) and plain-text mode for titles

### 🔧 Admin Panel
Full-featured back-office covering:
- Products & variants · Inventory · Orders · Customers
- Regions · Currencies · Countries · Warehouses · Shipping rates
- Webhooks · Discounts · Users & permissions (Auth0)
- OpenAPI / Swagger UI integrated

### 🏗️ Infrastructure
- **Cloudflare Workers** — zero-cold-start edge API (Hono + Zod-OpenAPI)
- **Durable Objects** — strongly-consistent SQLite state (`merchant-db`)
- **Cloudflare D1** — relational database with full migration history
- **Cloudflare R2** — product image storage
- Rate limiting middleware
- Outbound webhooks with HMAC signing and delivery log
- Scheduled cron for cart expiry cleanup

---

### Merchant Backend Template

In addition to the frontend, this monorepo ships a full **commerce backend** that you can deploy to Cloudflare Workers.  It’s the exact code that powers the demo store and can be used as a standalone product API or embedded inside your own site.  Everything is included: product management, inventory, cart/checkout, orders, webhooks, image upload, customer records, API keys, OAuth/OIDC, UCP support and a minimal admin UI.

The backend is intentionally lightweight and opinionated:

- **Cloudflare-native** – built with the Hono framework and stored in a single Durable Object backed by SQLite; no external database required.
- **Zero provisioning** – `wrangler deploy` auto‑creates the Durable Object and R2 bucket that hold your store data and images.
- **Flexible auth** – accepts `pk_`/`sk_` API keys, hex tokens, or Auth0 JWTs (JWKS‑verified).  Optionally enable OAuth 2.0 for third‑party platforms and the Universal Commerce Protocol for AI agents.
- **Stripe-ready** – checkout sessions, taxes and shipping are handled via Stripe; just POST your secret key once to `/v1/setup/stripe`.
- **Admin helpers** – built‑in endpoints for acquiring Auth0 management tokens and auto‑provisioning permissions, used by the web dashboard.

#### Quick start (backend)

```bash
# install dependencies (from monorepo root)
npm install

# create API keys and initial schema
npx tsx apps/merchant/scripts/init.ts

# run locally
cd apps/merchant && npm run dev

# seed demo data (optional)
npx tsx apps/merchant/scripts/seed.ts http://localhost:8787 sk_your_admin_key

# connect Stripe (replace key)
curl -X POST http://localhost:8787/v1/setup/stripe \
  -H "Authorization: Bearer sk_your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"stripe_secret_key":"sk_test_..."}'

# start admin UI (optional)
cd apps/merchant/admin && npm install && npm run dev
```

#### Deploy to production

```bash
# deploy worker (DO and R2 auto‑provisioned)
cd apps/merchant
wrangler deploy

# initialize remote store using new URL/key
npx tsx scripts/init.ts --remote
```

#### API reference (abridged)

All routes expect `Authorization: Bearer <key>` or JWT.

**Auth mechanisms**:
- `pk_..` public (cart/checkout)
- `sk_..` admin
- 64‑char hex tokens
- Auth0 JWTs (set `AUTH0_DOMAIN`/`AUTH0_AUDIENCE`, optionally `ADMIN_STORE_PERMISSION`)

**Products** (admin)
```
GET /v1/products
POST /v1/products {title,description}
PATCH /v1/products/{id}
DELETE /v1/products/{id}
POST /v1/products/{id}/variants {...}
```

**Inventory** (admin)
```
GET /v1/inventory?limit=...&low_stock=true
POST /v1/inventory/{sku}/adjust {delta,reason}
```

**Checkout** (public)
```
POST /v1/carts {customer_email}
POST /v1/carts/{id}/items {...}
POST /v1/carts/{id}/checkout {success_url,cancel_url,...}
```

**Orders** (admin/test)
```
GET /v1/orders?status=shipped
POST /v1/orders/test {...}
PATCH /v1/orders/{id} {status,tracking}
POST /v1/orders/{id}/refund {amount_cents}
```

**Customers, webhooks, images, UCP, OAuth 2.0** – see full list in the original README below.

> ⚠️ Because the root documentation now contains all merchant instructions, `apps/merchant/README.md` is no longer necessary and may be removed from the repo without losing any information.

---

## Technologies Used

- [Vite 7](https://vitejs.dev/guide/)
- [HeroUI](https://heroui.com)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Tailwind Variants](https://tailwind-variants.org)
- [React 19](https://reactjs.org)
- [i18next](https://www.i18next.com)
- [Auth0 React SDK](https://auth0.com/docs/quickstart/spa/react)
- [OIDC Client TS](https://github.com/authts/oidc-client-ts) (For Dex and other OAuth providers)
- [ESLint 9](https://eslint.org)
- [TypeScript](https://www.typescriptlang.org)
- [Framer Motion](https://www.framer.com/motion)
- [Turborepo](https://turbo.build/) (Monorepo build system)
- [npm](https://npmjs.com/) (Package manager with built-in workspaces)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/sctg-development/vite-react-heroui-auth0-template.git

# Change to project directory
cd vite-react-heroui-auth0-template

# Ensure you’re using a recent Node with npm 8+ (workspaces built in)
# Install dependencies for all packages
npm install

# Create a `.env` with your Auth0 credentials
cat <<EOF > .env
AUTHENTICATION_PROVIDER_TYPE=auth0
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret
AUTH0_DOMAIN=your-auth0-domain
AUTH0_SCOPE="openid profile email read:api write:api admin:api"
AUTH0_AUDIENCE=http://localhost:5173
API_BASE_URL=http://localhost:8787/api
CORS_ORIGIN=http://localhost:5173
READ_PERMISSION=read:api
WRITE_PERMISSION=write:api
ADMIN_PERMISSION=admin:api
DATABASE_PERMISSION="admin:database"
AI_PERMISSION="ai:api"
AUTHENTICATION_PROVIDER_TYPE=auth0
AI_API_KEY="sk_key"
AI_MODEL="openai/gpt-oss-20b"
AI_API_URL="https://api.example.com/openai/v1"
AI_PERMISSION="ai:api"
STRIPE_SECRET_KEY="sk_test_51TBaaa4"
STRIPE_PUBLISHABLE_KEY="pk_test_51TaaaaX"
STRIPE_WEBHOOK_SECRET="whsec_y4bbb"
EOF

# Spin up frontend + worker with environment vars
npm run dev:env

# Open your browser at http://localhost:5173/
# You'll land on a friendly home page with a login CTA and links to
# the example API and Swagger docs. Click "Log in" to exercise the
# built-in Auth0 permission provisioning and explore the secured routes.
```

For more detailed commands, see the [Turborepo Guide](./TURBOREPO-GUIDE.md).

## Table of Contents

- [Vite, OAuth \& HeroUI Template](#vite-oauth--heroui-template)
  - [Star the project](#star-the-project)
  - [Live demo](#live-demo)
  - [On Github Pages ?](#on-github-pages-)
  - [Features](#features)
  - [Technologies Used](#technologies-used)
  - [Quick Start](#quick-start)
  - [Table of Contents](#table-of-contents)
  - [Authentication](#authentication)
    - [Setting Up Auth0](#setting-up-auth0)
    - [Environment Variables](#environment-variables)
    - [GitHub secrets](#github-secrets)
    - [Authentication Route Guard](#authentication-route-guard)
    - [Secure API Calls](#secure-api-calls)
      - [Auth0 API Configuration](#auth0-api-configuration)
      - [Making Secure API Calls](#making-secure-api-calls)
      - [Using the Authentication API Directly](#using-the-authentication-api-directly)
      - [Checking Permissions](#checking-permissions)
      - [Protect a Component with a needed permission](#protect-a-component-with-a-needed-permission)
      - [Testing with Cloudflare Workers](#testing-with-cloudflare-workers)
      - [Understanding Token Flow](#understanding-token-flow)
  - [Administration & User Management](#administration--user-management)
  - [Multi-Region Integration](#multi-region-integration)
    - [Overview](#overview)
    - [Managing Regions](#managing-regions)
    - [Managing Currencies](#managing-currencies)
    - [Managing Countries](#managing-countries)
    - [Managing Warehouses](#managing-warehouses)
    - [Managing Shipping Rates](#managing-shipping-rates)
    - [Region-Aware Checkout](#region-aware-checkout)
  - [Technical Information Modal](#technical-information-modal)
  - [Internationalization](#internationalization)
    - [Adding a New Language](#adding-a-new-language)
    - [Language Switch Component](#language-switch-component)
    - [Example Usage](#example-usage)
    - [Lazy Loading](#lazy-loading)
    - [Summary](#summary)
  - [Cookie Consent](#cookie-consent)
    - [Features](#features-1)
    - [Configuration](#configuration)
    - [Implementation Details](#implementation-details)
    - [Using Cookie Consent in Your Components](#using-cookie-consent-in-your-components)
    - [Customization](#customization)
  - [Project Structure](#project-structure)
  - [Available Scripts in the frontend application](#available-scripts-in-the-frontend-application)
  - [Deployment](#deployment)
  - [Tailwind CSS 4](#tailwind-css-4)
  - [How to Use](#how-to-use)
    - [Manual chunk splitting (frontend)](#manual-chunk-splitting-frontend)
    - [Install dependencies](#install-dependencies)
    - [Run the development server](#run-the-development-server)
    - [Run the Cloudflare Worker](#run-the-cloudflare-worker)
    - [Setup pnpm (optional)](#setup-pnpm-optional)
  - [Contributing](#contributing)
  - [License](#license)
  - [Authentication Architecture](#authentication-architecture)
    - [Authentication Provider Interface](#authentication-provider-interface)
    - [Setting Up the Authentication Provider](#setting-up-the-authentication-provider)
    - [Auth0 Configuration](#auth0-configuration)
    - [Dex Configuration](#dex-configuration)
    - [Adding New Providers](#adding-new-providers)
  - [Auth0 Automatic Permissions](#auth0-automatic-permissions)
    - [Lifecycle & Design](#lifecycle--design)
    - [Configuration](#configuration-1)

## Authentication

This template provides a flexible authentication system with support for multiple OAuth providers. The architecture uses an abstraction layer that allows you to easily switch between different providers while maintaining a consistent API. Currently, the template supports:

- **Auth0** (Default) - Using the Auth0 React SDK
- **Dex** - Using the OIDC Client TS library

The authentication system can be extended to support other OAuth providers like Azure AD, Okta, or any OAuth 2.0 compliant service by implementing the provider interface.

### Setting Up Auth0

1. **Create an Auth0 Account:**
   - Go to [Auth0](https://auth0.com) and sign up for a free account.

2. **Create a New Application:**
   - In the Auth0 dashboard, navigate to the "Applications" section.
   - Click on "Create Application".
   - Choose a name for your application.
   - Select "Single Page Web Applications" as the application type.
   - Click "Create".

3. **Configure Application Settings:**
   - In the application settings, you will find your `Client ID` and `Domain`.
   - Set the "Allowed Callback URLs" to `http://localhost:5173` (or your development URL).
   - Set the "Allowed Logout URLs" to `http://localhost:5173` (or your development URL).
   - Set the "Allowed Web Origins" to `http://localhost:5173` (or your development URL).

4. **Sample settings:**
   - The settings used by the demo deployment on GitHub Pages are:
     - Allowed Callback URLs: `https://sctg-development.github.io/vite-react-heroui-auth0-template`
     - Allowed Logout URLs: `https://sctg-development.github.io/vite-react-heroui-auth0-template`
     - Allowed Web Origins: `https://sctg-development.github.io`
     - On Github repository settings, the `AUTH0_CLIENT_ID` secret is set to the Auth0 client ID and the `AUTH0_DOMAIN` secret is set to the Auth0 domain.
     - The full Auth0 configuration screenshot is available [here](https://sctg-development.github.io/vite-react-heroui-auth0-template/auth0-settings.pdf).

### Environment Variables

To keep your Auth0 credentials secure, use environment variables. Create a `.env` file in the root of your project and add the following:

```env
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-secret
AUTH0_MANAGEMENT_API_CLIENT_ID="from Auth0 Management API (Test Application)"
AUTH0_MANAGEMENT_API_CLIENT_SECRET="from Auth0 Management API (Test Application)"
AUTH0_DOMAIN=your-auth0-domain
AUTH0_SCOPE="openid profile email read:api write:api"
AUTH0_AUDIENCE=https://myapi.example.com
API_BASE_URL=https://myapi.example.com/api
CORS_ORIGIN=https://your-github-username.github.io
READ_PERMISSION=read:api
WRITE_PERMISSION=write:api
ADMIN_PERMISSION=admin:api
ADMIN_AUTH0_PERMISSION="auth0:admin:api"
AUTHENTICATION_PROVIDER_TYPE=auth0
DATABASE_PERMISSION="admin:database"
AI_PERMISSION="ai:api"
AUTHENTICATION_PROVIDER_TYPE=auth0
AI_API_KEY="sk_key"
AI_MODEL="openai/gpt-oss-20b"
AI_API_URL="https://api.example.com/openai/v1"
AI_PERMISSION="ai:api"
STRIPE_SECRET_KEY="sk_test_51TBaaa4"
STRIPE_PUBLISHABLE_KEY="pk_test_51TaaaaX"
STRIPE_WEBHOOK_SECRET="whsec_y4bbb"

# Optional: order tracking email (Stripe webhook)
ORDER_TOKEN_SECRET="a-very-long-random-secret-32+chars"
STORE_URL="https://yourstore.example.com"
STORE_NAME="My Store"

# Optional: Mailgun (required to send the order tracking email)
MAILGUN_USER="postmaster@yourdomain.com"
MAILGUN_API_KEY="key-..."
MAILGUN_DOMAIN="yourdomain.com"
MAILGUN_BASE_URL="https://api.mailgun.net"
```

### Order tracking & email (Stripe webhook)

After a successful Stripe Checkout, a webhook handler generates a signed "view token" and stores a **hash of the token** on the order record (never the raw token).

- The token is signed using `ORDER_TOKEN_SECRET` and is valid for **30 days**.
- The email contains a link of the form:
  `https://<STORE_URL>/order/<orderId>?token=<viewToken>`
- On the frontend, the `/order/:id` page validates the token and returns order details without requiring login.
- To revoke access, clear `viewtoken` on the order record (the token is stored as a hash).

If Mailgun is configured, the worker will send an order confirmation email to the customer containing the tracking link. If Mailgun is not configured, the token is still generated and stored, but no email is sent.

> **IMPORTANT:** `STORE_URL` must point to your public storefront (including protocol). The link is built using this value.

### Admin actions

For store admins, the API exposes two helper routes to manage the tracking link and confirmation email:

- `POST /v1/orders/:orderId/resend-confirmation` — resends the confirmation email (reuses existing token if present)
- `POST /v1/orders/:orderId/regenerate-tracking-link` — generates a fresh token (invalidating the old link) and sends a new email

Both endpoints require an admin API key (e.g. `sk_...`) or an authenticated Auth0 user with the proper permissions.

### GitHub secrets

For using the provided GitHub Actions workflows, you need to add the following secrets to your repository:

```env
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-secret
AUTH0_MANAGEMENT_API_CLIENT_ID="from Auth0 Management API (Test Application)"
AUTH0_MANAGEMENT_API_CLIENT_SECRET="from Auth0 Management API (Test Application)"
AUTH0_DOMAIN=your-auth0-domain
AUTH0_SCOPE="openid profile email read:api write:api"
AUTH0_AUDIENCE=https://myapi.example.com
API_BASE_URL=https://myapi.example.com/api
CORS_ORIGIN=https://your-github-username.github.io
READ_PERMISSION=read:api
WRITE_PERMISSION=write:api
ADMIN_PERMISSION=admin:api
ADMIN_AUTH0_PERMISSION="auth0:admin:api"
AUTHENTICATION_PROVIDER_TYPE=auth0
DATABASE_PERMISSION="admin:database"
AI_PERMISSION="ai:api"
AUTHENTICATION_PROVIDER_TYPE=auth0
AI_API_KEY="sk_key"
AI_MODEL="openai/gpt-oss-20b"
AI_API_URL="https://api.example.com/openai/v1"
AI_PERMISSION="ai:api"
STRIPE_SECRET_KEY="sk_test_51TBaaa4"
STRIPE_PUBLISHABLE_KEY="pk_test_51TaaaaX"
STRIPE_WEBHOOK_SECRET="whsec_y4bbb"

# Optional: order tracking email (Stripe webhook)
ORDER_TOKEN_SECRET="a-very-long-random-secret-32+chars"
STORE_URL="https://yourstore.example.com"
STORE_NAME="My Store"

# Optional: Mailgun (required to send the order tracking email)
MAILGUN_USER="postmaster@yourdomain.com"
MAILGUN_API_KEY="key-..."
MAILGUN_DOMAIN="yourdomain.com"
MAILGUN_BASE_URL="https://api.mailgun.net"
```

each secrets should be manually entered in Github like:
<img width="815" alt="image" src="https://github.com/user-attachments/assets/5543905d-6645-4c78-bbf0-715a33a796dd" />

### Authentication Route Guard

You can use the `AuthenticationGuard` component to protect routes that require authentication. This component works with any configured provider and will redirect users to the login page if they are not authenticated.

```tsx
import { AuthenticationGuard } from "./authentication";
<Route element={<AuthenticationGuard component={DocsPage} />} path="/docs" />;
```

### Secure API Calls

The template includes a fully-configured secure API call system that demonstrates how to communicate with protected backend services using Auth0 token authentication.

#### Auth0 API Configuration

To enable secure API calls in your application:

1. **Create an API in Auth0 Dashboard:**
   - Navigate to "APIs" section in the Auth0 dashboard
   - Click "Create API"
   - Provide a descriptive name (e.g., "My Application API")
   - Set the identifier (audience) - typically a URL or URI (e.g., `https://api.myapp.com`)
   - Configure the signing algorithm (RS256 recommended)

2. **Configure API Settings:**
   - Enable RBAC (Role-Based Access Control) if you need granular permission management
   - Define permissions (scopes) that represent specific actions (e.g., `read:api`, `write:api`)
   - Configure token settings as needed (expiration, etc.)
   - Include permissions in the access token

3. **Set Environment Variables:**
   Add the following to your `.env` file:

   ```env
   AUTH0_AUDIENCE=your-api-identifier
   AUTH0_SCOPE="openid profile email read:api write:api"
   API_BASE_URL=http://your-api-url.com
   ```

4. **Sample Configuration:**
   For reference, view the [Auth0 API configuration](https://sctg-development.github.io/vite-react-heroui-auth0-template/auth0-api.pdf) used in the demo deployment.

#### Making Secure API Calls

The template provides a hook `useSecuredApi` that handles token acquisition and authenticated requests for any configured provider:

```tsx
import { useSecuredApi } from "@/authentication";

// Inside your component:
const { getJson, postJson, deleteJson } = useSecuredApi();
// GET request to a secured API endpoint
const apiData = await getJson(`${import.meta.env.API_BASE_URL}/endpoint`);
// POST request to a secured API endpoint
const apiData = await postJson(`${import.meta.env.API_BASE_URL}/endpoint`, {
  data: "example",
});
// DELETE request to a secured API endpoint
const apiData = await deleteJson(`${import.meta.env.API_BASE_URL}/endpoint`);
```

This function automatically:

- Requests the appropriate token with configured audience and scope
- Attaches the token to the request header
- Handles errors appropriately
- Returns the JSON response

#### Using the Authentication API Directly

For more control, you can use the authentication provider API directly:

```tsx
import { useAuth } from "@/authentication";

// Inside your component:
const auth = useAuth();

// Access authentication state
const isLoggedIn = auth.isAuthenticated;
const userData = auth.user;

// Perform authentication actions
await auth.login();
await auth.logout();

// Get tokens for API calls
const token = await auth.getAccessToken();

// Make API calls
const data = await auth.getJson(`${import.meta.env.API_BASE_URL}/endpoint`);
await auth.postJson(`${import.meta.env.API_BASE_URL}/endpoint`, {
  key: "value",
});
```

This function automatically:

- Requests the appropriate token with configured audience and scope
- Attaches the token to the request header
- Handles errors appropriately
- Returns the JSON response

#### Checking Permissions

You can check user permissions with any configured authentication provider:

```tsx
import { useAuth } from "@/authentication";

// Inside your component:
const auth = useAuth();
const canReadData = await auth.hasPermission("read:api");

// Or using the useSecuredApi hook
import { useSecuredApi } from "@/authentication";

const { hasPermission } = useSecuredApi();
const canReadData = await hasPermission("read:api");
```

The permission system works across different providers, with each implementation handling the specific token format of that provider.

#### Protect a Component with a needed permission

This template includes a `AuthenticationGuardWithPermission` component that works with any configured provider and wraps a component to check if the user has the required permission:

```tsx
import { AuthenticationGuardWithPermission } from "@/authentication";

<AuthenticationGuardWithPermission permission="read:api">
  <ProtectedComponent />
</AuthenticationGuardWithPermission>;
```

#### Testing with Cloudflare Workers

For demonstration purposes, the template includes a Cloudflare Worker that acts as a secured backend API:

1. **Start the Worker with environment variables:**

```bash
# From the root directory
yarn dev:worker:env
```

2. **Test API Integration:**
   With both your application and the worker running, navigate to the `/api` route in your application to see the secure API call in action.

#### Understanding Token Flow

1. Your application requests an access token from Auth0 with specific audience and scope
2. Auth0 issues a JWT token containing the requested permissions
3. Your application includes this token in the Authorization header
4. The backend API validates the token using Auth0's public key
5. If valid, the API processes the request according to the permissions in the token

## Administration & User Management

This template includes a powerful administration interface (route `/admin/users`) for managing users and permissions directly via the Auth0 Management API.

### How the admin panel works

When a user with the `ADMIN_AUTH0_PERMISSION` (default `auth0:admin:api`) opens
the technical info modal they see a chip labelled with the permission. Clicking
that chip navigates to the admin page.

The admin page itself doesn’t talk to Auth0 directly from the browser – instead
it obtains a short‑lived Management API token from the **Cloudflare Worker** by
posting to `POST /api/__auth0/token`.  The worker is configured with two
secrets:

```env
AUTH0_MANAGEMENT_API_CLIENT_ID=your-m2m-client-id
AUTH0_MANAGEMENT_API_CLIENT_SECRET=your-m2m-client-secret
```

These credentials belong to an Auth0 Machine‑to‑Machine application that has at
least the `update:users` and `read:users` scopes. The worker caches the token
in KV to reduce Auth0 rate limit usage.

Once the frontend receives the token, it uses it to call the Auth0 Management
API (listing users, adding/removing permissions, deleting accounts…).  The
`useSecuredApi` hook provides helper methods such as
`getAuth0ManagementToken`, `listAuth0Users`, `addPermissionToUser`, etc.  All of
those methods simply wrap fetch calls to Auth0 endpoints using the supplied
token.

Because the service token never leaves the worker, your client code and end
users never see the underlying M2M credentials – they only receive the
short‑lived access token returned by `/api/__auth0/token`, which expires after
about an hour.

### Auth0 Configuration for the admin token

The client application exposes a set of **utility functions** (exported by
`useSecuredApi` in `auth-components.tsx`) that wrap the Management API logic
used by the admin page.  In addition to listing users, adding/removing
permissions and deleting accounts, the helpers include several functions
related to your Auth0 **resource server scopes**:

- `getResourceServers`, `getResourceServerScopes` – query the configured APIs.
- `updateResourceServerScopes` – patch an API with a new list of scopes.
- `checkResourceServerScopes` – compare the current scopes against a target
  list and return `true` when they match.
- variant helpers that accept an audience URL instead of an ID.

These methods power the “Sync Auth0” button on the admin page.  The button
compares the local `Permission` enum with the scopes stored in Auth0 and,
if they differ, updates the resource server in one call.  A user must not
only possess the `ADMIN_AUTH0_PERMISSION` to reach the page, they also need
additional Management API privileges in order to read and write resource
server definitions – the same M2M client configured via
`AUTH0_MANAGEMENT_API_CLIENT_ID`/`SECRET` should be granted the `read:api`
and `update:api` (or more generally `read:resource_servers` and
`update:resource_servers`) scopes.

You can also invoke the same functions directly from your own code (e.g. as
part of a migration script or CI job) to keep definitions in sync
programmatically.

Having these utilities means the template is not only a sample UI, it also
provides a convenient API layer for managing scopes without writing raw
fetches or dealing with the Management API boilerplate yourself.

### Auth0 Configuration for the admin token

1. In your Auth0 dashboard create a **Machine-to-Machine Application**.
2. Grant it access to the Management API with the following scopes:
   - `read:users`
   - `update:users`
   - (optionally `delete:users` if you want to allow account removal)
3. Copy the generated **Client ID** and **Client Secret** and set them as the
   worker/environment variables `AUTH0_MANAGEMENT_API_CLIENT_ID` and
   `AUTH0_MANAGEMENT_API_CLIENT_SECRET`.
4. Add the `ADMIN_AUTH0_PERMISSION` (typically `auth0:admin:api`) to the list
   of permissions for any user who should be able to reach the admin panel.  In
   the demo we automatically grant it on first login via the auto‑permission
   provisioner.

With this configuration the admin interface will function correctly, and only
users who already possess the required permission can access it.

### User Management Page

Accessible via `/admin/users`, the management page allows administrators to:
- **List & Search Users**: View all users registered in the Auth0 tenant.
- **Manage Permissions**: Assign or revoke specific API permissions to any user in real-time.
- **Sync Auth0 Permissions**: Automatically synchronize local permission definitions with the Auth0 Resource Server (API) scopes.
- **Delete Users**: Remove users directly from the application.

> [!IMPORTANT]
> To use these features, you must configure the Auth0 Management API credentials and set the `ADMIN_AUTH0_PERMISSION` in your environment variables.

## Multi-Region Integration

The merchant backend includes a comprehensive multi-region system that enables you to manage products, pricing, shipping, and warehousing across multiple geographic regions. This feature is essential for businesses operating in multiple countries or currency zones.

### Overview

The multi-region system consists of five interconnected management interfaces:

1. **Regions** (`/admin/regions`) - Define geographic areas and their associated currencies
2. **Currencies** (`/admin/currencies`) - Manage currency codes, symbols, and decimal precision
3. **Countries** (`/admin/countries`) - Assign countries to regions and configure languages
4. **Warehouses** (`/admin/warehouses`) - Set up warehouse locations with inventory tracking per region
5. **Shipping Rates** (`/admin/shipping-rates`) - Configure region-specific shipping costs based on weight and delivery time

These five entities work together to enable:
- **Region-aware pricing**: Automatically convert product prices based on the customer's region
- **Warehouse inventory management**: Track stock levels across multiple regional warehouses
- **Smart shipping calculation**: Compute shipping costs based on origin warehouse, destination region, and weight
- **Multi-language support**: Serve the checkout experience in customers' local languages

### Managing Regions

Regions are the top-level organizational unit. Each region:
- Has a unique code (e.g., "EU", "NA", "APAC")
- Is associated with a primary currency
- Can contain multiple countries
- Determines default pricing and shipping behavior

**Access**: Navigate to **Admin Dashboard** → **Regions** (requires `admin:store` permission)

**Operations**:
- **Create Region**: Click "Add Region", enter a unique code, select a currency, and save
- **Edit Region**: Click the edit icon (pencil) on any region to modify its code or currency
- **Set as Default**: Mark a region as default to use it when the customer's region cannot be determined
- **Delete Region**: Click the delete icon (trash) to remove a region (only if no countries are assigned)

**Best Practices**:
- Use ISO 3166-1 alpha-2 country codes as region identifiers when possible (EU, GB, US, etc.)
- Always have at least one default region configured
- Ensure the default region's currency is well-supported in your payment processor

### Managing Currencies

Currencies define the monetary units used in your regions. Each currency:
- Has a 3-letter ISO code (e.g., "USD", "EUR", "GBP")
- Displays with a custom symbol (e.g., "$", "€", "£")
- Specifies decimal precision (typically 2 for most currencies, 0 for JPY)

**Access**: Navigate to **Admin Dashboard** → **Currencies** (requires `admin:store` permission)

**Operations**:
- **Create Currency**: Click "Add Currency", enter the ISO code, configure the symbol and decimal places
- **Edit Currency**: Modify symbol or decimal places for any currency
- **Delete Currency**: Remove a currency (only if not assigned to any region)

**Validation Rules**:
- Currency code must be exactly 3 uppercase letters
- Decimal places must be 0-8 (recommended: 0-2 for standard currencies)
- Symbol can be any Unicode character (e.g., $, €, ¥, ₹, ₽)

**Examples**:
- USD: Symbol "$", Decimals: 2
- EUR: Symbol "€", Decimals: 2
- JPY: Symbol "¥", Decimals: 0
- BTC: Symbol "₿", Decimals: 8 (for crypto payment support)

### Managing Countries

Countries map geographic locations to regions and languages. Each country:
- Has a unique 2-letter ISO code (e.g., "US", "FR", "JP")
- Belongs to exactly one region
- Specifies available languages for localization
- Determines shipping and pricing rules

**Access**: Navigate to **Admin Dashboard** → **Countries** (requires `admin:store` permission)

**Operations**:
- **Create Country**: Click "Add Country", select a country code, assign a region, select supported languages
- **Edit Country**: Modify a country's assigned region or language settings
- **Delete Country**: Remove a country (this will reassign any assigned addresses to the region's default)

**Language Selection**:
- Each country can support multiple languages
- The system respects language availability during checkout
- Users see localization in their selected language if it's available for their country

**Example Configuration**:
- US (United States) → Region: "NA" (North America) → Languages: English
- FR (France) → Region: "EU" (Europe) → Languages: French, English
- IN (India) → Region: "APAC" → Languages: Hindi, English, Tamil

### Managing Warehouses

Warehouses represent physical inventory locations. Each warehouse:
- Has a name, address, and contact information
- Belongs to a specific region
- Maintains inventory for products in that region
- Has a priority rank for fulfillment routing

**Access**: Navigate to **Admin Dashboard** → **Warehouses** (requires `admin:store` permission)

**Operations**:
- **Create Warehouse**: Click "Add Warehouse", fill in address details and assign to a region
- **Edit Warehouse**: Update warehouse information or change its region priority
- **Delete Warehouse**: Remove a warehouse (inventory will be reassigned to the region's default warehouse)

**Address Fields**:
- Name (required): Display name of the warehouse
- Address Line 1 (required): Street address
- Address Line 2 (optional): Apartment, suite, etc.
- City (required): City name
- State/Province (required): State or province code
- Postal Code (required): ZIP code or postal code
- Country (required): Country where the warehouse is located
- Phone (optional): Contact phone number for the warehouse

**Priority System**:
- Lower numbers = higher priority for order fulfillment
- Set priority 1 for your main warehouse, then 2, 3, etc. for secondary locations
- The system routes shipments from the highest-priority warehouse with available inventory

**Example**:
```
Warehouse 1: "Main EU Hub" (Germany) - Priority 1
Warehouse 2: "UK Overflow" (United Kingdom) - Priority 2
Warehouse 3: "EU Secondary" (Belgium) - Priority 3
```

### Managing Shipping Rates

Shipping rates define the cost and delivery time for orders shipped from warehouses to regions. Each rate:
- Links a warehouse to a destination region
- Specifies weight-based pricing (e.g., different costs for 0-1kg, 1-5kg, 5-20kg)
- Includes estimated delivery time in business days
- Supports weight-based rate tiers

**Access**: Navigate to **Admin Dashboard** → **Shipping Rates** (requires `admin:store` permission)

**Operations**:
- **Create Shipping Rate**: Click "Add Shipping Rate", select a warehouse and destination region, configure rates
- **Edit Shipping Rate**: Modify cost, weight limits, or delivery days
- **Delete Shipping Rate**: Remove a shipping route

**Configuration Fields**:
- **Warehouse**: Origin warehouse for shipments (dropdown)
- **Region**: Destination region (dropdown)
- **Cost** (in base currency): How much to charge for shipping
- **Min Weight (g)**: Minimum package weight this rate applies to
- **Max Weight (g)**: Maximum package weight this rate applies to (leave empty for no limit)
- **Estimated Delivery Days**: How many business days before delivery (1-30 recommended)

**Weight Tiering**:
You can create multiple shipping rates for the same warehouse→region pair with different weight ranges. For example:

```
EU Warehouse → France Region:
  - 0-500g: €5.99, 3 days
  - 500g-2kg: €9.99, 3 days
  - 2kg-10kg: €19.99, 5 days
  - 10kg+: €0.99/kg, 7 days
```

The system automatically selects the appropriate rate based on the order's total weight.

### Region-Aware Checkout

The checkout process automatically adapts based on the customer's detected or selected region:

**Checkout Flow**:
1. **Region Detection**: The system determines the customer's region from their shipping address
2. **Currency Conversion**: Product prices are automatically converted to the region's currency
3. **Tax Calculation**: Tax rates are applied based on the destination region (when configured)
4. **Shipping Calculation**: Available shipping options are filtered to those covering the destination
5. **Warehouse Selection**: The system routes the order to the highest-priority warehouse with inventory

**Example Checkout**:
A customer in France:
- Region: EU (detected from country_code: "FR")
- Currency: EUR (region's primary currency)
- Product priced at $100 USD → displays as €92 EUR (using conversion rate)
- Shipping Options: Only rates from "EU Warehouse → France Region" are offered
- Delivery: Estimated 3-5 business days (from shipping rate configuration)

## Technical Information Modal

The template provides a comprehensive technical modal for developers and power users to inspect their current session.

- **JWT Analysis**: Decodes and displays the current Access Token payload.
- **Localized Expiration**: Displays a real-time countdown in a human-readable "n days h:m:s" format, fully localized across all 6 supported languages.
- **Permission Overview**: Lists all permissions associated with the current session.
- **Quick Links**: Integrated "Admin Panel" shortcut for users with appropriate privileges.

---

## Auth0 Automatic Permissions

This template includes an optional feature to automatically assign a set of predefined permissions to users upon their first login (or whenever permissions are missing). This is particularly useful for onboarding new users with a default set of "read" or "basic" access levels without manual administrator intervention.
<img width="412" height="550" alt="image" src="https://github.com/user-attachments/assets/6c952627-1678-4c1b-a2aa-73fb0feab632" />

### Lifecycle & Design

The automatic provisioning follows a robust 5-step lifecycle designed to be efficient and secure:

1.  **Detection**: Immediately after a successful login, the `AutoPermissionProvisioner` component (client-side) checks the user's current scopes against the required `AUTH0_AUTOMATIC_PERMISSIONS` list.
2.  **Provisioning Request**: If permissions are missing, the client calls the Cloudflare Worker's `/api/__auth0/autopermissions` endpoint.
3.  **Server-Side Assignment**: The worker verifies the user's identity, obtains a Management API token (using a high-performance KV-cached mechanism), and calls the Auth0 Management API to assign the missing permissions.
4.  **Token Refresh**: Upon success, the client triggers a **silent token refresh** with `cacheMode: "off"`. This forces the Auth0 SDK to bypass the local cache and fetch a fresh JWT containing the newly assigned scopes.
5.  **Persistent Guard & Cleanup**: To prevent infinite refresh loops (e.g., during Auth0 propagation delays), a `sessionStorage` guard tracks the provisioning attempt for that specific user. Once the user is confirmed to have all required permissions, the flag is automatically cleaned up.

### Configuration

To enable this feature, configure the following variables:

**Cloudflare Worker (Secrets/Env):**
- `AUTH0_AUTOMATIC_PERMISSIONS`: Comma-separated list of scopes (e.g., `read:api,user:profile`).
- `AUTH0_MANAGEMENT_API_CLIENT_ID` & `AUTH0_MANAGEMENT_API_CLIENT_SECRET`: Credentials for an Auth0 M2M application with `update:users` and `read:users` scopes.

**Client (Vite Env):**
- `AUTH0_AUTOMATIC_PERMISSIONS`: An array of strings mirroring the worker's configuration.

---

## Internationalization

This template uses i18next for internationalization. The configuration and available languages are defined in the `src/i18n.ts` file.

### Adding a New Language

To add a new language to the application, follow these steps:

1. **Update the `availableLanguages` array:**
   - Open the `src/i18n.ts` file.
   - Add a new object to the `availableLanguages` array with the following properties:
     - `code`: The ISO 639-1 language code (e.g., "en-US").
     - `nativeName`: The native name of the language (e.g., "English").
     - `isRTL`: Whether the language is right-to-left (e.g., `false`).

2. **Create a Translation File:**
   - In the `src/locales/base` directory, create a new JSON file named with the language code (e.g., `en-US.json`).
   - Add the translations for the new language in this file.

3. **Update the Load Path:**
   - In the `src/i18n.ts` file, manually add a switch case to the `loadPath` function to handle the new JSON file for the added language.

### Language Switch Component

The `LanguageSwitch` component allows users to switch between the available languages. It is defined in the `src/components/language-switch.tsx` file.

- The component uses the i18n instance to change the language and update the document metadata.
- It automatically updates the document direction based on the language (left-to-right or right-to-left).
- The selected language is stored in `localStorage` to persist the user's preference.

### Example Usage

To use the `LanguageSwitch` component in your application, simply include it in your JSX:

```tsx
<LanguageSwitch
  availableLanguages={[
    { code: "en-US", nativeName: "English", isRTL: false, isDefault: true },
    { code: "fr-FR", nativeName: "Français", isRTL: false },
  ]}
/>
```

or more simply using the `availableLanguages` array defined in the `src/i18n.ts` file:

```tsx
import { availableLanguages } from "@/i18n";
<LanguageSwitch availableLanguages={availableLanguages} />;
```

This component will render a dropdown menu with the available languages, allowing users to switch languages easily.

### Lazy Loading

The default configuration uses the `i18next-http-backend` plugin for language lazy loading. This means that translations are loaded only when needed, improving the application's performance.

### Summary

- **Configuration:** `src/i18n.ts`
- **Translations:** `src/locales/base`
- **Language Switch:** `src/components/language-switch.tsx`

By following the steps above, you can easily add new languages and manage internationalization for your application.

## Cookie Consent

This template includes a cookie consent management system to comply with privacy regulations like GDPR. The system displays a modal dialog asking users for consent to use cookies and stores their preference in the browser's localStorage.
<img width="944" alt="Capture d’écran 2025-04-11 à 19 55 13" src="https://github.com/user-attachments/assets/8769525c-bef0-4705-9b2e-6664aa68a9e0" />

### Features

- Modern modal-based UI with blur backdrop
- Internationalized content for all supported languages
- Stores user preferences in localStorage
- Provides a context API for checking consent status throughout the application
- Supports both accepting and rejecting cookies

### Configuration

The cookie consent feature can be enabled or disabled through the site configuration:

1. **Enable/Disable Cookie Consent:**
   - Open the `src/config/site.ts` file
   - Set the `needCookieConsent` property to `true` or `false`:

```typescript
export const siteConfig = () => ({
  needCookieConsent: true, // Set to false if you don't need cookie consent
  // ...other configuration
});
```

### Implementation Details

- **Context Provider:** `src/contexts/cookie-consent-context.tsx` - Provides a React context to manage consent state
- **UI Component:** `src/components/cookie-consent.tsx` - Renders the consent modal using HeroUI components
- **Consent Status:** The consent status can be one of three values:
  - `pending`: Initial state, user hasn't made a decision yet
  - `accepted`: User has accepted cookies
  - `rejected`: User has rejected cookies

### Using Cookie Consent in Your Components

You can access the cookie consent status in any component using the `useCookieConsent` hook:

```tsx
import { useCookieConsent } from "@/contexts/cookie-consent-context";

const MyComponent = () => {
  const { cookieConsent, acceptCookies, rejectCookies, resetCookieConsent } =
    useCookieConsent();

  // Load analytics only if cookies are accepted
  useEffect(() => {
    if (cookieConsent === "accepted") {
      // Initialize analytics, tracking scripts, etc.
    }
  }, [cookieConsent]);

  // ...rest of your component
};
```

### Customization

- Modify the appearance of the consent modal in `src/components/cookie-consent.tsx`
- Add custom tracking or cookie management logic in the `acceptCookies` and `rejectCookies` functions in `src/contexts/cookie-consent-context.tsx`
- Update the cookie policy text in the language files (e.g., `src/locales/base/en-US.json`)

## Project Structure

This template follows a monorepo structure managed by Turborepo with Yarn 4 workspaces, containing the frontend application and Cloudflare Worker.

```text
vite-react-heroui-auth0-template/
├── package.json                 # Root package.json with Turborepo + workspaces
├── turbo.json                   # Turborepo configuration
├── .yarnrc.yml                  # Yarn 4 configuration
├── yarn.lock                    # Unified lockfile for all packages
├── TURBOREPO-GUIDE.md          # Turborepo usage guide
├── apps/
│   ├── client/                  # Frontend application
│   │   ├── public/              # Static assets
│   │   ├── src/
│   │   │   ├── authentication/  # Authentication system
│   │   │   │   ├── auth-components.tsx # Authentication UI components
│   │   │   │   ├── auth-root.tsx    # Root authentication provider
│   │   │   │   ├── index.ts         # Exports
│   │   │   │   └── providers/       # Provider implementations
│   │   │   │       ├── auth-provider.ts  # Provider interface
│   │   │   │       ├── auth0-provider.tsx # Auth0 implementation
│   │   │   │       ├── dex-provider.tsx   # Dex implementation
│   │   │   │       └── use-auth.tsx       # Auth context and hooks
│   │   │   ├── components/      # Reusable UI components
│   │   │   ├── config/          # Configuration files
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── layouts/         # Page layout components
│   │   │   ├── locales/         # Translation files
│   │   │   ├── pages/           # Page components
│   │   │   ├── styles/          # Global styles
│   │   │   ├── types/           # TypeScript definitions
│   │   │   ├── App.tsx          # Main application component
│   │   │   ├── i18n.ts          # i18next configuration
│   │   │   ├── main.tsx         # Application entry point
│   │   │   └── provider.tsx     # HeroUI provider setup
│   │   ├── tailwind.config.js   # Tailwind CSS configuration
│   │   ├── vite.config.ts       # Vite configuration
│   │   └── update-heroui.ts     # Helper script to update HeroUI packages
│   └── cloudflare-worker/       # Cloudflare Worker for testing API
│       ├── src/
│       ├── wrangler.jsonc       # Cloudflare Worker configuration
│       └── package.json         # Worker dependencies
├── .github/                     # GitHub workflows and configuration
├── .vscode/                     # VS Code configuration
└── template.code-workspace      # VS Code workspace configuration
```

## Available Scripts

This monorepo uses Turborepo for task orchestration. All scripts can be run from the root directory:

### Development Commands

```bash
# Start all applications in development mode
yarn dev

# Start all applications with environment variables
yarn dev:env

# Start only the client application
yarn dev:client

# Start only the client application with environment variables
yarn dev:client:env

# Start only the Cloudflare Worker
yarn dev:worker

# Start only the Cloudflare Worker with environment variables
yarn dev:worker:env
```

### Build Commands

```bash
# Build all applications
npm run build

# Build all applications with environment variables
npm run build:env

# Build only the client application
yarn build:client

# Build only the client with environment variables
yarn build:client:env

# Build only the Cloudflare Worker
yarn build:worker

# Build only the Cloudflare Worker with environment variables
yarn build:worker:env
```

### Other Commands

```bash
# Run ESLint on all packages
npm run lint

# Run type checking on all packages
npm run type-check

# Run tests on all packages
npm run test

# Clean all build artifacts and caches
npm run clean

# Deploy the Cloudflare Worker
npm run deploy:worker

# Update HeroUI packages (run from client directory)
cd apps/client && yarn update:heroui
```

For more detailed information, see the [Turborepo Guide](./TURBOREPO-GUIDE.md).

## Deployment

This template includes a GitHub Actions workflow to automatically deploy your application to GitHub Pages. To use this feature:

1. Enable GitHub Pages in the repository settings and set the source to GitHub Actions
2. Enable GitHub Actions in the repository settings
3. Add your Auth0 credentials as GitHub repository secrets:
   - `AUTH0_CLIENT_ID`
   - `AUTH0_DOMAIN`
4. Push the changes to your repository
5. The application will be deployed automatically on each push to the main branch

## Tailwind CSS 4

This template uses Tailwind CSS 4, which is a utility-first CSS framework. You can customize the styles by modifying the `tailwind.config.js` file.  
HeroUI supports Tailwind CSS 4 out of the box starting from version 2.8.

## How to Use

To clone the project, run the following command:

```bash
git clone https://github.com/sctg-development/vite-react-heroui-auth0-template.git
```

### Install dependencies

This project uses Yarn 4 with workspaces. Install all dependencies from the root:

```bash
# Enable Yarn 4 if not already done
corepack enable
yarn set version 4.9.2

# Install all dependencies
yarn install
```

### Run the development server

```bash
# Start all applications with environment variables
yarn dev:env

# Or start individual applications
yarn dev:client:env  # Client only
yarn dev:worker:env  # Cloudflare Worker only
```

### Turborepo Benefits

This template uses Turborepo which provides:

- **Intelligent caching**: Build outputs are cached and shared across team members
- **Parallel execution**: Tasks run in parallel when possible
- **Dependency awareness**: Tasks run in the correct order based on dependencies
- **Incremental builds**: Only rebuild what changed
- **Remote caching**: Share build caches across your team (optional)

### Migration from npm to Turborepo

If you're migrating from the previous npm-based setup, here's the command mapping:

| Old npm command                                       | New Yarn command                   |
| ----------------------------------------------------- | ---------------------------------- |
| `cd client && npm run dev:env`                        | `yarn dev:client:env`              |
| `cd cloudflare-fake-secured-api && npm run dev:env`   | `yarn dev:worker:env`              |
| `cd client && npm run build:env`                      | `yarn build:client:env`            |
| `cd cloudflare-fake-secured-api && npm run build:env` | `yarn build:worker:env`            |
| `cd client && npm run lint`                           | `yarn lint` (runs on all packages) |

### Manual chunk splitting (frontend)

In the `apps/client/vite.config.ts` file, all `@heroui` packages are manually split into a separate chunk. This is done to reduce the size of the main bundle. You can remove this configuration if you don't want to split the packages.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This template is primarily licensed under the [MIT license](https://github.com/sctg-development/vite-react-heroui-auth0-template/blob/main/LICENSE).

**Exception:** Four specific files (`site-loading.tsx`, `language-switch.tsx`, `vite.config.ts`, and `auth0.tsx`) are licensed under the AGPL-3.0 license as they contain code originating from my other repositories.

## Authentication Architecture

The authentication system uses a provider-based architecture that allows you to easily switch between different OAuth providers:

### Authentication Provider Interface

All authentication providers implement a common interface that defines standard authentication methods:

```typescript
export interface AuthProvider {
  // Authentication state
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;

  // Core authentication methods
  login(options?: LoginOptions): Promise<void>;
  logout(options?: LogoutOptions): Promise<void>;
  getAccessToken(options?: TokenOptions): Promise<string | null>;

  // Permission handling
  hasPermission(permission: string): Promise<boolean>;

  // API interaction helpers
  getJson(url: string): Promise<any>;
  postJson(url: string, data: any): Promise<any>;
  deleteJson(url: string): Promise<any>;
}
```

### Setting Up the Authentication Provider

To use the authentication system in your application, wrap your components with the `AuthenticationProvider`:

```tsx
import { AuthenticationProvider } from "./authentication";

// For Auth0 (default)
<AuthenticationProvider providerType="auth0">
  <App />
</AuthenticationProvider>

// For Dex
<AuthenticationProvider
  providerType="dex"
>
  <App />
</AuthenticationProvider>
```

### Auth0 Configuration

To use Auth0, follow these steps:

1. **Create an Auth0 Account:**
   - Go to [Auth0](https://auth0.com) and sign up for a free account.

2. **Create a New Application:**
   - In the Auth0 dashboard, navigate to the "Applications" section.
   - Click on "Create Application".
   - Choose a name for your application.
   - Select "Single Page Web Applications" as the application type.
   - Click "Create".

3. **Configure Application Settings:**
   - In the application settings, you will find your `Client ID` and `Domain`.
   - Set the "Allowed Callback URLs" to `http://localhost:5173` (or your development URL).
   - Set the "Allowed Logout URLs" to `http://localhost:5173` (or your development URL).
   - Set the "Allowed Web Origins" to `http://localhost:5173` (or your development URL).

4. **Sample settings:**
   - The settings used by the demo deployment on GitHub Pages are:
     - Allowed Callback URLs: `https://sctg-development.github.io/vite-react-heroui-auth0-template,https://sctg-development.github.io/vite-react-heroui-auth0-template/`
     - Allowed Logout URLs: `https://sctg-development.github.io/vite-react-heroui-auth0-template,https://sctg-development.github.io/vite-react-heroui-auth0-template/`
     - Allowed Web Origins: `https://sctg-development.github.io`
     - On Github repository settings, the `AUTH0_CLIENT_ID` secret is set to the Auth0 client ID and the `AUTH0_DOMAIN` secret is set to the Auth0 domain.
     - The full Auth0 configuration screenshot is available [here](https://sctg-development.github.io/vite-react-heroui-auth0-template/auth0-settings.pdf).

    ⚡ Small tip: Auth0 takes care of the final `/` in the URLs, so you may set it with and without the trailing slash.  

5. **Configure API in Auth0:**
   - Navigate to "APIs" section in the Auth0 dashboard
   - Click "Create API"
   - Provide a descriptive name (e.g., "My Application API")
   - Set the identifier (audience) - typically a URL or URI (e.g., `https://api.myapp.com`)
   - Configure the signing algorithm (RS256 recommended)

6. **Configure API Settings:**
   - Enable RBAC (Role-Based Access Control) if you need granular permission management
   - Define permissions (scopes) that represent specific actions (e.g., `read:api`, `write:api`)
   - Configure token settings as needed (expiration, etc.)
   - Include permissions in the access token


### JWKS caching (token verification) 🔒

The client includes a small JWKS caching utility at `apps/client/src/authentication/utils/jwks.ts`. It provides `getLocalJwkSet(domain)`, which:

- Fetches the JWKS from `https://<domain>/.well-known/jwks.json` and builds a verifier using `jose.createLocalJWKSet`
- Caches the result in-memory and in `sessionStorage` to reduce network calls
- Stores a timestamp (`uat`) with the stored JWKS and honors a TTL to expire the cache
- Deduplicates concurrent fetches (so parallel callers only trigger one network request)
- Is resilient to `sessionStorage` errors (read/write failures are silently ignored)

The cache TTL defaults to 300 seconds but can be changed with the environment variable `AUTH0_CACHE_DURATION_S` (set it in your `.env` file). In code you can use it like this:

```ts
import { getLocalJwkSet } from "@/authentication/utils/jwks";
const JWKS = await getLocalJwkSet(import.meta.env.AUTH0_DOMAIN);
const verified = await jwtVerify(token, JWKS, {
  issuer: `https://${import.meta.env.AUTH0_DOMAIN}/`,
  audience: import.meta.env.AUTH0_AUDIENCE,
});
```

_Tip_: increase the TTL in stable environments where the JWKS rarely changes; lower it if you expect frequent key rotations.

---

## Cloudflare Worker routing utility 🔧

A small, reusable Router for Cloudflare Workers lives at `apps/cloudflare-worker/src/routes/router.ts`.

Features:

- Route registration helpers: `router.get`, `router.post`, `router.put`, `router.delete`.
- Path parameters (e.g. `/api/items/:id`) are parsed and injected as `request.params` inside handlers.
- Optional permission checks: pass a permission string (e.g. `env.READ_PERMISSION`) when registering a route; the router validates the `Authorization` header and uses the worker `checkPermissions()` helper (see `apps/cloudflare-worker/src/auth0.ts`).
- Rate limiting support: if your Worker has a `RATE_LIMITER` binding the router will call `env.RATE_LIMITER.limit({ key })` and return HTTP 429 when the quota is exceeded.
- Standard CORS handling and consistent JSON error responses.

Quick example (see `apps/cloudflare-worker/src/routes/index.ts`):

```ts
import { Router } from "./routes/router";
import { setupRoutes } from "./routes";

export default {
  async fetch(request: Request, env: Env) {
    const router = new Router(env);
    setupRoutes(router, env);
    return await router.handleRequest(request, env);
  }
} as ExportedHandler<Env>;
```

Unit tests are present in `apps/cloudflare-worker/test/router.spec.ts` (Vitest). The router now supports Rocket-style paths like `/api/get/<user>` and catch-all patterns `/files/<path..>` which translate internally to `URLPattern` for reliable matching and parameter extraction.

7. **Set Environment Variables:**
   Add the following to your `.env` file:

   ```env
   AUTHENTICATION_PROVIDER_TYPE=auth0
   AUTH0_AUDIENCE=your-api-identifier
   AUTH0_SCOPE="openid profile email read:api write:api"
   API_BASE_URL=http://your-api-url.com
   ```

8. **Sample Configuration:**
   For reference, view the [Auth0 API configuration](https://sctg-development.github.io/vite-react-heroui-auth0-template/auth0-api.pdf) used in the demo deployment.

### Dex Configuration

[Dex](https://dexidp.io/) is an identity service that uses OpenID Connect to drive authentication for other apps. To use Dex as your authentication provider:

1. **Setup a Dex Server:**
   - Install and configure a Dex server following the [official documentation](https://dexidp.io/docs/getting-started/)
   - Configure Dex to support the OAuth 2.0 authorization code flow

2. **Register your Application in Dex:**
   - Add your application to the Dex configuration
   - Set the redirect URI to your application's callback URL (e.g., `http://localhost:5173`)

3. **Configure the Dex Provider:**
   - Create a `.env` file with your Dex configuration:

   ```env
   AUTHENTICATION_PROVIDER_TYPE=dex
   DEX_AUTHORITY=https://your-dex-server.com
   DEX_CLIENT_ID=your-dex-client-id
   DEX_SCOPE="openid profile email"
   DEX_AUDIENCE=https://your-api.com
   DEX_JWKS_ENDPOINT=https://your-dex-server.com/dex/keys
   ```

4. **Initialize the Dex Provider:**

   ```tsx
   import { AuthenticationProvider } from "./authentication";

   <AuthenticationProvider providerType="dex">
     <App />
   </AuthenticationProvider>;
   ```

### Adding New Providers

To add support for additional OAuth providers:

1. Create a new provider implementation file in `src/authentication/providers/`
2. Implement the `AuthProvider` interface
3. Add the new provider to the `AuthProviderWrapper` in `src/authentication/providers/use-auth.tsx`
4. Add configuration in `src/authentication/auth-root.tsx`

The modular design makes it easy to extend the authentication system with new providers while maintaining a consistent API throughout your application.
