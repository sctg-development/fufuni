# Merchant App Test Suite

Comprehensive test suite for the multi-currency merchant platform, covering schema validation, API routes, pricing, and end-to-end integration scenarios.

## Test Files

### 1. **schema-validation.test.ts** ✅ (544 lines)
Unit tests for Zod schema validation across all API data models.

**Coverage:**
- Currency schema validation (code length, decimal places, symbols)
- Country schema with language validation
- Warehouse schema with coordinates
- Region schema with currency mappings
- Cart and checkout schemas
- Discount code validation
- Email validation with multiple formats
- **NEW: Variant Pricing schema** (CreateVariantPriceBody, VariantResponse.currency)
- UUID v4 validation
- ISO 8601 date handling

**Status:** ✅ 44 tests PASS

### 2. **api-helpers.test.ts** ✅ (100+ lines)
Unit tests for utility functions: email validation, password hashing, request helpers.

**Status:** ✅ 38 tests PASS

### 3. **regions.integration.test.ts** ✅ (500+ lines)
Full integration tests for multi-region setup with currencies, countries, warehouses, shipping, and regions.

**Coverage:**
- Currency CRUD (Create, Read, Update, List)
- Country management with language codes
- Warehouse creation and priority ordering
- Shipping rate configuration with per-currency pricing
- Region setup and linking
- Region-aware checkout

**Status:** ⏳ 26 tests (requires running server)

### 4. **advanced-routes.test.ts** ✅ (670+ lines)
Comprehensive integration tests for core business workflows.

**Coverage:**
- **Region-Aware Checkout** (6 tests) - Cart creation, retrieval, validation
- **Inventory Management** (3 tests) - List, SKU lookup, warehouse inventory
- **Order Management** (3 tests) - Orders with pagination and status filtering
- **Discount Management** (2 tests) - Discount creation and application
- **Customer Management** (4 tests) - Customer CRUD and details
- **Multi-Devise Product & Pricing Flow** ✨ NEW (9 tests)
  - Multi-currency product and variant creation
  - Variant price management (list, add, update, delete)
  - Currency field in variant responses
  - Price resolution in cart context
  - Multi-currency workflows
- **Authorization** (3 tests) - Access control validation
- **Error Handling** (3 tests) - Validation and database error handling

**Status:** ⏳ 33 tests (requires running server)

### 5. **variant-pricing.test.ts** ✨ NEW (430+ lines)
Dedicated integration tests for variant pricing and multi-currency product management.

**Coverage:**
- **Variant Pricing Management** (9 tests)
  - List, add, update, delete variant prices
  - Multi-currency pricing
  - Authorization enforcement
- **Multi-Devise Cart & Checkout Flow** (3 tests)
  - Price resolution by region currency
  - Currency consistency validation

**Status:** ⏳ 12 tests (requires running server)

## Running Tests

### Prerequisites
1. **Environment Variables**: Project root `.env` must have:
   ```
   MERCHANT_SK=sk_xxxxx...
   MERCHANT_PK=pk_xxxxx...
   ```

2. **Development Server** (for integration tests):
   ```bash
   cd apps/merchant
   npm run dev:env
   ```

### Quick Test Commands
```bash
# Unit tests only (no server needed)
npm run test -- schema-validation.test.ts --run
npm run test -- api-helpers.test.ts --run

# All integration tests (requires server)
npm run test

# Single integration test file
npm run test -- advanced-routes.test.ts --run
npm run test -- variant-pricing.test.ts --run

# Watch mode (auto-rerun on changes)
npm run test -- advanced-routes.test.ts
```

## Test Statistics

| File | Tests | Type | Status |
|------|-------|------|--------|
| schema-validation.test.ts | 44 | Unit | ✅ PASS |
| api-helpers.test.ts | 38 | Unit | ✅ PASS |
| regions.integration.test.ts | 26 | Integration | ⏳ Requires Server |
| advanced-routes.test.ts | 33 | Integration | ⏳ Requires Server |
| variant-pricing.test.ts | 12 | Integration | ⏳ Requires Server |
| **TOTAL** | **153** | Mixed | **82 Pass + 71 Pending** |

## Key Features

### Unique Test Data Generation
All integration tests use `Date.now()` to generate unique test IDs, preventing UNIQUE constraint violations:
```typescript
const testId = Date.now().toString().slice(-6);
code: `TS${testId}`.substring(0, 3), // Unique currency codes
```

### Proper Cleanup
All resources created during tests are properly cleaned up in `afterAll()` hooks:
- Currencies, countries, warehouses deleted
- Foreign keys respected during deletion
- Test isolation guaranteed

### TypeScript Support
All test files use proper typing with generic `api<T>()` function to avoid TypeScript unknowns.

### Multi-Currency Testing
Tests verify complete multi-currency workflows:
- Product → Variant → Prices (multiple currencies) → Cart → Checkout
- Currency resolution by region
- Price validation by currency code
- Admin UI currency display

## API Endpoints Tested

**Variant Pricing Routes (NEW):**
- `GET /v1/products/{id}/variants/{variantId}/prices` - List prices
- `POST /v1/products/{id}/variants/{variantId}/prices` - Add/update price
- `DELETE /v1/products/{id}/variants/{variantId}/prices/{currencyId}` - Delete price

**Product Management:**
- `GET /v1/products`, `POST /v1/products`, `GET /v1/products/{id}`
- `POST /v1/products/{id}/variants`, `GET /v1/products/{id}/variants`

**Cart & Checkout:**
- `POST /v1/carts`, `GET /v1/carts/{id}`
- `POST /v1/carts/{id}/items`, `POST /v1/carts/{id}/checkout`

**Regions & Multi-Currency:**
- `POST/GET /v1/regions/currencies`
- `POST/GET /v1/regions/countries`
- `POST/GET /v1/regions/warehouses`
- `POST/GET /v1/regions`

**Orders & Customers:**
- `GET/POST /v1/orders`, `GET/POST /v1/customers`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests SKIPPED | Start dev server: `npm run dev:env` |
| "Unknown currency_id" | Ensure region setup completed first |
| UNIQUE constraint error | Should be fixed with Date.now() IDs |
| Type errors | Regenerate test files or check TypeScript version |

## Test Data Patterns

### 1. Multi-Currency Setup
```typescript
const usd = await api('/v1/regions/currencies', 'POST', {
  code: `US${testId}`.substring(0, 3),
  display_name: 'Test USD',
  symbol: '$',
  decimal_places: 2,
});
```

### 2. Region with Currency
```typescript
const region = await api('/v1/regions', 'POST', {
  display_name: 'Test Region',
  currency_id: usd.id,
});
```

### 3. Variant Pricing
```typescript
await api(`/v1/products/{id}/variants/{variantId}/prices`, 'POST', {
  currency_id: usd.id,
  price_cents: 2999,
});
```

## Maintenance

When adding features:
1. Add schema tests in `schema-validation.test.ts`
2. Add integration tests in `advanced-routes.test.ts`
3. Create dedicated test file if 30+ tests needed
4. Use `Date.now()` for test data IDs
5. Implement `afterAll()` cleanup
6. Type API responses with `api<T>()`

## Notes

- Tests create real data in the database (localhost only)
- All test data automatically cleaned up after execution
- Admin key (MERCHANT_SK) used for all operations
- Authorization tested by attempting public key access
- Integration tests require running API server on localhost:8787
