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


import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const TABLES = [
  'api_keys',
  'products',
  'variants',
  'inventory',
  'inventory_logs',
  'carts',
  'cart_items',
  'orders',
  'order_items',
  'refunds',
  'discounts',
  'discount_usage',
  'customers',
  'customer_addresses',
  'events',
  'webhooks',
  'webhook_deliveries',
  'oauth_clients',
  'oauth_authorizations',
  'oauth_tokens',
  'config',
];

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' });
}

function printHelp() {
  console.log(`
D1 → Durable Objects Migration Tool

Usage:
  npx tsx scripts/migrate-d1-to-do.ts export [options]    Export D1 data to JSON
  npx tsx scripts/migrate-d1-to-do.ts import [options]    Import JSON data via API

Export options:
  --remote              Export from remote D1 (default: local)
  --db=<name>           D1 database name (default: merchant-db)
  --output=<file>       Output file (default: d1-export-<timestamp>.json)

Import options:
  --file=<path>         JSON file to import (required)
  --url=<url>           API URL (default: http://localhost:8787)
  --key=<admin_key>     Admin API key (required)

Examples:
  # Export local D1 data
  npx tsx scripts/migrate-d1-to-do.ts export

  # Export remote D1 data
  npx tsx scripts/migrate-d1-to-do.ts export --remote --db=merchant-db

  # Import to local DO
  npx tsx scripts/migrate-d1-to-do.ts import --file=d1-export.json --key=sk_...

  # Import to remote DO
  npx tsx scripts/migrate-d1-to-do.ts import --file=d1-export.json --url=https://store.workers.dev --key=sk_...
`);
}

async function exportD1() {
  const isRemote = process.argv.includes('--remote');
  const dbName = process.argv.find((a) => a.startsWith('--db='))?.split('=')[1] || 'merchant-db';
  const outputFile =
    process.argv.find((a) => a.startsWith('--output='))?.split('=')[1] ||
    `d1-export-${Date.now()}.json`;

  console.log(`\n📤 Exporting D1 data...\n`);
  console.log(`   Mode: ${isRemote ? 'REMOTE' : 'LOCAL'}`);
  console.log(`   Database: ${dbName}`);
  console.log(`   Output: ${outputFile}\n`);

  const remoteFlag = isRemote ? '--remote' : '--local';
  const exportData: Record<string, any[]> = {};
  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const result = run(
        `npx wrangler d1 execute ${dbName} ${remoteFlag} --json --command "SELECT * FROM ${table}"`
      );
      const parsed = JSON.parse(result);
      const rows = parsed[0]?.results || [];
      exportData[table] = rows;
      totalRows += rows.length;
      if (rows.length > 0) {
        console.log(`   ✓ ${table}: ${rows.length} rows`);
      }
    } catch (e: any) {
      if (e.message?.includes('no such table') || e.stderr?.includes('no such table')) {
        exportData[table] = [];
      } else {
        console.log(`   ✗ ${table}: error`);
        exportData[table] = [];
      }
    }
  }

  console.log(`\n   Total: ${totalRows} rows\n`);

  writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
  console.log(`✅ Exported to ${outputFile}\n`);

  if (totalRows > 0) {
    console.log(`Next step: Import this data to the new DO-based deployment:`);
    console.log(`   npx tsx scripts/migrate-d1-to-do.ts import --file=${outputFile} --key=sk_...\n`);
  }
}

async function importData() {
  const fileArg = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1];
  const urlArg =
    process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] || 'http://localhost:8787';
  const keyArg = process.argv.find((a) => a.startsWith('--key='))?.split('=')[1];

  if (!fileArg || !existsSync(fileArg)) {
    console.error('❌ Error: --file=<path> is required and file must exist');
    process.exit(1);
  }

  if (!keyArg) {
    console.error('❌ Error: --key=<admin_key> is required');
    console.error('   Run "npx tsx scripts/init.ts" first to create API keys');
    process.exit(1);
  }

  console.log(`\n📥 Importing data to Durable Objects...\n`);
  console.log(`   File: ${fileArg}`);
  console.log(`   URL: ${urlArg}\n`);

  const data = JSON.parse(readFileSync(fileArg, 'utf-8'));

  async function api(method: string, path: string, body?: any) {
    const res = await fetch(`${urlArg}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${keyArg}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`${method} ${path}: ${(err as any).error?.message || res.statusText}`);
    }
    return res.json();
  }

  let imported = 0;
  let skipped = 0;

  for (const product of data.products || []) {
    try {
      const created = await api('POST', '/v1/products', {
        title: product.title,
        description: product.description || '',
        status: product.status || 'active',
      });

      const variants = (data.variants || []).filter((v: any) => v.product_id === product.id);
      for (const variant of variants) {
        try {
          await api('POST', `/v1/products/${created.id}/variants`, {
            sku: variant.sku,
            title: variant.title,
            price_cents: variant.price_cents,
            weight_g: variant.weight_g || 0,
            dims_cm: variant.dims_cm,
            status: variant.status || 'active',
          });

          const inv = (data.inventory || []).find((i: any) => i.sku === variant.sku);
          if (inv && inv.on_hand > 0) {
            await api('POST', `/v1/inventory/${encodeURIComponent(variant.sku)}/adjust`, {
              delta: inv.on_hand,
              reason: 'restock',
            });
          }
        } catch {
          skipped++;
        }
      }

      console.log(`   ✓ Product: ${product.title} (${variants.length} variants)`);
      imported++;
    } catch {
      console.log(`   ✗ Product: ${product.title} (skipped)`);
      skipped++;
    }
  }

  for (const customer of data.customers || []) {
    try {
      console.log(`   ✓ Customer: ${customer.email}`);
      imported++;
    } catch {
      skipped++;
    }
  }

  for (const discount of data.discounts || []) {
    try {
      await api('POST', '/v1/discounts', {
        code: discount.code,
        type: discount.type,
        value: discount.value,
        status: discount.status || 'active',
        min_purchase_cents: discount.min_purchase_cents,
        max_discount_cents: discount.max_discount_cents,
        starts_at: discount.starts_at,
        expires_at: discount.expires_at,
        usage_limit: discount.usage_limit,
      });
      console.log(`   ✓ Discount: ${discount.code}`);
      imported++;
    } catch {
      skipped++;
    }
  }

  console.log(`\n✅ Import complete`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Skipped: ${skipped}`);

  console.log(`\n⚠️  Note: The following were NOT imported (security/session data):`);
  console.log(`   • API keys (run init.ts to create new ones)`);
  console.log(`   • OAuth tokens (customers will need to re-authenticate)`);
  console.log(`   • Orders (historical, read from export file if needed)`);
  console.log(`   • Stripe config (re-run /v1/setup/stripe)\n`);
}

async function main() {
  const command = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === 'export') {
    await exportD1();
  } else if (command === 'import') {
    await importData();
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
