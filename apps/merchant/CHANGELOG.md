# Changelog

## 0.2.0 (2025-01-11)

This release is a significant architecture overhaul focused on performance, real-time capabilities, and agent interoperability.

### Breaking Changes

- **D1 replaced with Durable Objects**: The database layer now uses Cloudflare Durable Objects with embedded SQLite instead of D1. This provides single-digit millisecond latency and native WebSocket support. Existing D1 users should run the migration script before upgrading (see README).

### New Features

- **Real-time updates via WebSocket**: Connect to `/ws` for live events (cart updates, order status, inventory changes). Subscribe to specific topics or get everything.

- **Full UCP (Universal Commerce Protocol) implementation**: Implements the [UCP spec](https://ucp.dev) for AI agent-to-commerce interoperability:
  - `GET /.well-known/ucp` — Discovery endpoint with capabilities, services, and payment handlers
  - `POST /ucp/v1/checkout-sessions` — Create checkout sessions
  - `GET /ucp/v1/checkout-sessions/:id` — Get checkout session
  - `PUT /ucp/v1/checkout-sessions/:id` — Update checkout session (full replacement)
  - `POST /ucp/v1/checkout-sessions/:id/complete` — Complete checkout (returns Stripe redirect URL)
  - `DELETE /ucp/v1/checkout-sessions/:id` — Cancel checkout session
  - Capabilities: `dev.ucp.shopping.checkout`, `dev.ucp.common.identity_linking`, `dev.ucp.shopping.order`
  - UCP envelope in all responses with version and active capabilities
  - Stripe Checkout payment handler with redirect flow
  - Order creation via Stripe webhook completion

- **OAuth 2.0 support**: Full OAuth 2.0 implementation with PKCE for platforms and AI agents to act on behalf of customers. Discovery at `/.well-known/oauth-authorization-server`.

- **D1 migration script**: `scripts/migrate-d1-to-do.ts` exports data from D1 and imports into the new Durable Object storage.

### Improvements

- Database queries now use RPC calls to a single Durable Object, eliminating cold start variability
- WebSocket connections are handled natively by the DO, no external pubsub needed
- Simplified wrangler config with auto-provisioning

### Documentation

- Updated all documentation (README, llms.txt, llms-full.txt, api.md, index.html) to reflect the new architecture
- Added comprehensive UCP documentation with API reference and examples
- Added OAuth 2.0 documentation
- Added WebSocket real-time documentation
