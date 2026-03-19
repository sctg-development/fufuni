/**
 * MIT License
 *
 * Copyright (c) 2025 ygwyg
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

import { Context, Next } from 'hono';
import { rateLimits, getLimitForRequest, type RateLimitConfig } from '../config/rate-limits';
import { ApiError, type Env } from '../types';

// ============================================================
// RATE LIMITING MIDDLEWARE
// ============================================================
// Uses in-memory sliding window counters per isolate
// For high-traffic production, consider Cloudflare Rate Limiting
// or upgrading to use KV/Durable Objects

type WindowCounter = {
  count: number;
  windowStart: number;
};

// In-memory store - resets when isolate recycles
// Key format: `${identifier}:${windowStart}`
const counters = new Map<string, WindowCounter>();

// Cleanup old entries periodically
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  const cutoff = now - 5 * 60 * 1000; // Remove entries older than 5 minutes

  for (const [key, value] of counters.entries()) {
    if (value.windowStart < cutoff) {
      counters.delete(key);
    }
  }
}

function getWindowStart(windowMs: number): number {
  const now = Date.now();
  return Math.floor(now / windowMs) * windowMs;
}

function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();

  const windowStart = getWindowStart(config.windowMs);
  const key = `${identifier}:${windowStart}`;

  let counter = counters.get(key);

  if (!counter || counter.windowStart !== windowStart) {
    counter = { count: 0, windowStart };
    counters.set(key, counter);
  }

  const remaining = Math.max(0, config.requests - counter.count);
  const resetAt = windowStart + config.windowMs;

  if (counter.count >= config.requests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  counter.count++;
  return { allowed: true, remaining: remaining - 1, resetAt };
}

/**
 * Rate limiting middleware
 * Must be applied after auth middleware to get role info
 */
export function rateLimitMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const path = c.req.path;

    // Get identifier - prefer API key, fall back to IP
    const authHeader = c.req.header('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const identifier = apiKey || ip;

    // Check whitelist
    if (apiKey && rateLimits.whitelist.some((w) => apiKey.startsWith(w))) {
      return next();
    }

    // Determine role from API key prefix
    let role: 'admin' | 'public' | undefined;
    if (apiKey?.startsWith('sk_')) {
      role = 'admin';
    } else if (apiKey?.startsWith('pk_')) {
      role = 'public';
    }

    // Get rate limit config for this request
    const config = getLimitForRequest(path, role);

    // Check rate limit
    const { allowed, remaining, resetAt } = checkRateLimit(identifier, config);

    // Add headers if configured
    if (rateLimits.includeHeaders) {
      c.header('X-RateLimit-Limit', String(config.requests));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
    }

    if (!allowed) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      c.header('Retry-After', String(retryAfter));

      throw new ApiError(
        'rate_limit_exceeded',
        429,
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`
      );
    }

    return next();
  };
}

/**
 * Get current rate limit status for an identifier
 * Useful for debugging or admin endpoints
 */
export function getRateLimitStatus(identifier: string, config: RateLimitConfig) {
  const windowStart = getWindowStart(config.windowMs);
  const key = `${identifier}:${windowStart}`;
  const counter = counters.get(key);

  return {
    identifier,
    requests_made: counter?.count || 0,
    requests_limit: config.requests,
    requests_remaining: Math.max(0, config.requests - (counter?.count || 0)),
    window_ms: config.windowMs,
    window_reset_at: new Date(windowStart + config.windowMs).toISOString(),
  };
}



