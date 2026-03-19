#!/usr/bin/env npx tsx
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

/**
 * Init script for remote/production database
 */

import { execSync } from 'child_process';

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateApiKey(prefix: 'pk' | 'sk'): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${key}`;
}

// For remote execution, use wrangler.local.jsonc if you have actual IDs
const CONFIG_FLAG = process.env.WRANGLER_CONFIG
  ? `-c ${process.env.WRANGLER_CONFIG}`
  : '-c wrangler.local.jsonc';

function runSql(sql: string) {
  const escaped = sql.replace(/'/g, "'\\''");
  execSync(`wrangler d1 execute DB --remote ${CONFIG_FLAG} --command='${escaped}'`, {
    stdio: 'inherit',
  });
}

async function init() {
  console.log('🚀 Initializing production store...\n');

  const storeId = crypto.randomUUID();
  console.log('🏪 Creating store...');
  runSql(`INSERT INTO stores (id, name, status) VALUES ('${storeId}', 'My Store', 'enabled')`);

  const publicKey = generateApiKey('pk');
  const adminKey = generateApiKey('sk');
  const publicHash = await hashKey(publicKey);
  const adminHash = await hashKey(adminKey);

  console.log('🔑 Creating API keys...');
  runSql(
    `INSERT INTO api_keys (id, store_id, key_hash, key_prefix, role) VALUES ('${crypto.randomUUID()}', '${storeId}', '${publicHash}', 'pk_', 'public')`
  );
  runSql(
    `INSERT INTO api_keys (id, store_id, key_hash, key_prefix, role) VALUES ('${crypto.randomUUID()}', '${storeId}', '${adminHash}', 'sk_', 'admin')`
  );

  console.log('\n✅ Store created!\n');
  console.log('─'.repeat(50));
  console.log('\n🔑 API Keys (save these, shown only once!):\n');
  console.log(`   Public:  ${publicKey}`);
  console.log(`   Admin:   ${adminKey}`);
  console.log('\n' + '─'.repeat(50));
  console.log('\n📝 Next steps:\n');
  console.log('   1. Connect Stripe:');
  console.log(`      curl -X POST https://YOUR_WORKER_URL/v1/setup/stripe \\`);
  console.log(`        -H "Authorization: Bearer ${adminKey}" \\`);
  console.log(`        -H "Content-Type: application/json" \\`);
  console.log(
    `        -d '{"stripe_secret_key":"sk_live_...","stripe_webhook_secret":"whsec_..."}'\n`
  );
  console.log('   2. Start admin dashboard:');
  console.log('      cd admin && npm run dev\n');
}

init().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
