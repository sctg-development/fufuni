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

// ============================================================
// RATE LIMIT CONFIGURATION
// ============================================================
// Easy to update - just modify these values
// Limits are per API key, per window

export type RateLimitConfig = {
  requests: number; // Max requests allowed
  windowMs: number; // Time window in milliseconds
};

export const rateLimits = {
  // Default for all endpoints
  default: {
    requests: 100,
    windowMs: 60 * 1000, // 1 minute
  },

  // Per role overrides
  roles: {
    admin: {
      requests: 2000,
      windowMs: 60 * 1000,
    },
    public: {
      requests: 60,
      windowMs: 60 * 1000,
    },
  },

  // Per endpoint overrides (path prefix -> config)
  // More specific paths take precedence
  endpoints: {
    // Checkout is rate limited more strictly to prevent abuse
    '/v1/carts': {
      requests: 30,
      windowMs: 60 * 1000,
    },
    // Webhooks from Stripe need higher limits
    '/v1/webhooks/stripe': {
      requests: 1000,
      windowMs: 60 * 1000,
    },
    // Images upload is expensive
    '/v1/images': {
      requests: 20,
      windowMs: 60 * 1000,
    },
  },

  // IPs/keys to never rate limit (e.g., internal services)
  // Add API key prefixes or full keys here
  whitelist: [] as string[],

  // Whether to include rate limit headers in responses
  includeHeaders: true,
} as const;

// Helper to get limit for a specific request
export function getLimitForRequest(path: string, role?: 'admin' | 'public'): RateLimitConfig {
  // Check endpoint-specific overrides first
  for (const [prefix, config] of Object.entries(rateLimits.endpoints)) {
    if (path.startsWith(prefix)) {
      return config;
    }
  }

  // Check role-based limits
  if (role && rateLimits.roles[role]) {
    return rateLimits.roles[role];
  }

  // Fall back to default
  return rateLimits.default;
}



