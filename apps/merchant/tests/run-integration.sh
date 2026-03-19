#!/bin/bash

# Integration test runner for multi-region features
# Prerequisites:
# - .env file with MERCHANT_SK and MERCHANT_PK at project root
# - Node.js and npm installed

set -e

echo "🧪 Multi-Region Integration Tests"
echo "=================================="
echo ""

# Check if dev server is running
echo "📡 Checking if dev server is running on http://localhost:8787..."
if ! curl -s http://localhost:8787/ > /dev/null 2>&1; then
  echo "❌ Dev server not running!"
  echo ""
  echo "To start the dev server, run in another terminal:"
  echo "  cd apps/merchant"
  echo "  npm run dev:env"
  echo ""
  exit 1
fi

echo "✅ Dev server is running"
echo ""

# Check .env file
if [ ! -f "../../.env" ]; then
  echo "❌ .env file not found at project root"
  exit 1
fi

# Extract API keys from .env
MERCHANT_SK=$(grep "^MERCHANT_SK=" ../../.env | cut -d'=' -f2)
MERCHANT_PK=$(grep "^MERCHANT_PK=" ../../.env | cut -d'=' -f2)

if [ -z "$MERCHANT_SK" ] || [ -z "$MERCHANT_PK" ]; then
  echo "❌ MERCHANT_SK or MERCHANT_PK not found in .env"
  exit 1
fi

echo "✅ API keys loaded from .env"
echo ""

# Run the tests
echo "🚀 Running integration tests..."
echo ""

npx vitest run tests/regions.integration.test.ts --reporter=verbose

echo ""
echo "✅ Integration tests complete!"
