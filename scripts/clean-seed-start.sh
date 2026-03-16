#!/bin/bash
#
# Copyright (c) 2024-2026 Ronan LE MEILLAT
# License: AGPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <http://www.gnu.org/licenses/>.
#/
# Clean Seed & Start Script
# Orchestrates: clean DB → start dev environment → initialize & seed data
#
# Usage: npm run clean:seed:start
#        Or directly: bash scripts/clean-seed-start.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
MERCHANT_DIR="$ROOT_DIR/apps/merchant"

echo "🧹 Cleaning .wrangler directory..."
rm -rf "$MERCHANT_DIR/.wrangler"
echo "   ✓ Cleaned"

echo ""
echo "🚀 Starting development environment..."
echo "   (This will run in the background while we initialize the database)"
echo ""

# Load environment variables (only the ones we need)
if [ -f "$ROOT_DIR/.env" ]; then
  # Extract API_BASE_URL and MERCHANT_SK safely
  API_BASE_URL=$(grep "^API_BASE_URL" "$ROOT_DIR/.env" | cut -d'=' -f2 | tr -d '"')
  MERCHANT_SK=$(grep "^MERCHANT_SK" "$ROOT_DIR/.env" | cut -d'=' -f2 | tr -d '"')
  STRIPE_SECRET_KEY=$(grep "^STRIPE_SECRET_KEY" "$ROOT_DIR/.env" | cut -d'=' -f2 | tr -d '"')
  STRIPE_WEBHOOK_SECRET=$(grep "^STRIPE_WEBHOOK_SECRET" "$ROOT_DIR/.env" | cut -d'=' -f2 | tr -d '"')
  
  if [ -z "$API_BASE_URL" ]; then
    API_BASE_URL="http://localhost:8787"
  fi
  
  if [ -z "$MERCHANT_SK" ]; then
    echo "❌ Error: MERCHANT_SK not found in .env file"
    exit 1
  fi
else
  echo "❌ Error: .env file not found at $ROOT_DIR/.env"
  exit 1
fi

# Start dev:env in the background
npm run dev:env &
DEV_PID=$!
echo "   Dev server PID: $DEV_PID"

# Wait for the API to be ready (with timeout of 30 seconds)
echo ""
echo "⏳ Waiting for API to be ready..."
RETRY=0
MAX_RETRIES=30
while [ $RETRY -lt $MAX_RETRIES ]; do
  # Simple check: does the server respond to any request?
  # (status doesn't matter, just that it's listening)
  if curl -s -o /dev/null http://localhost:8787/ 2>/dev/null || \
     curl -s -o /dev/null http://localhost:8787/v1 2>/dev/null; then
    echo "   ✓ API is ready!"
    break
  fi
  
  RETRY=$((RETRY + 1))
  if [ $RETRY -eq $MAX_RETRIES ]; then
    echo "   ❌ API did not respond within 30 seconds"
    kill $DEV_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo ""
echo "📝 Initializing database..."
cd "$MERCHANT_DIR"
npx tsx scripts/init.ts
echo "   ✓ Initialization complete"

echo ""
echo "\nInitializing Stripe"
curl -s -X POST http://localhost:8787/v1/setup/stripe \
  -H "Authorization: Bearer ${MERCHANT_SK}" \
  -H "Content-Type: application/json" \
  -d "{\"stripe_secret_key\": \"${STRIPE_SECRET_KEY}\", \"stripe_webhook_secret\": \"${STRIPE_WEBHOOK_SECRET}\"}"
echo "   ✓ Stripe initialization complete"


echo ""
echo "🌱 Seeding database..."
npx tsx scripts/seed.ts "$API_BASE_URL" "$MERCHANT_SK"
echo "   ✓ Seeding complete"

echo ""
echo "✅ Database initialized and populated!"
echo ""
echo "📊 Development environment is running. Press Ctrl+C to stop."
echo ""

# Bring the dev server back to foreground
wait $DEV_PID
