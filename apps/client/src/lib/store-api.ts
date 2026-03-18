/**
 * Lightweight client for the public Merchant storefront API.
 *
 * The examples shipped with Merchant use a simple PK (public key) in a
 * `Bearer` header.  We replicate that here so that the React frontend can
 * fetch products without requiring any authentication state.
 *
 * You may expand this module later with helpers for cart/checkout.
 */

const API_BASE =
  (import.meta as any).env?.API_BASE_URL || "";
const PUBLIC_KEY = import.meta.env.MERCHANT_PK;

if (!PUBLIC_KEY) {
  console.warn(
    "store-api: no MERCHANT_PK environment variable defined, API calls may fail",
  );
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PUBLIC_KEY || ""}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "API request failed");
  }
  return data;
}

// -- products --------------------------------------------------------------

export interface StoreVariant {
  id: string;
  sku: string;
  title: string;
  price_cents: number;
  currency?: string; // ISO 4217 code (e.g. USD, EUR)
  image_url?: string;
  weight_g?: number;
  dims_cm?: { l: number; w: number; h: number } | null;
  requires_shipping?: boolean;
  barcode?: string | null;
  compare_at_price_cents?: number | null;
  tax_code?: string | null;
}

export interface StoreProduct {
  id: string;
  title: string;
  description?: string;
  status?: string;
  variants: StoreVariant[];
  image_url?: string;
  vendor?: string | null;
  tags?: string[] | null;
  handle?: string | null;
}

export async function getProducts(): Promise<StoreProduct[]> {
  const resp = await request<{ items: StoreProduct[] }>(
    `/v1/products?limit=100&status=active`,
  );

  // match example logic: keep only products with at least one variant
  return (resp.items || []).filter((p) => p.variants && p.variants.length > 0);
}

export async function getProduct(id: string): Promise<StoreProduct> {
  return request<StoreProduct>(`/v1/products/${id}`);
}

/**
 * Search products using the new `/v1/products/search?q=...` endpoint.
 * Returns the same item list structure; q is required and will be URL-encoded.
 */
export async function searchProducts(query: string): Promise<StoreProduct[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  const resp = await request<{ items: StoreProduct[] }>(
    `/v1/products/search?q=${q}&limit=100`,
  );
  return (resp.items || []).filter((p) => p.variants && p.variants.length > 0);
}

// helper functions for cart creation and checkout, mirroring the example API client

export interface CartResponse {
  id: string;
  // other fields may be present but we only care about id for now
}

export interface AddItemsResponse {
  success: boolean;
}

export interface CheckoutResponse {
  checkout_url: string;
}

export async function createCart(email: string): Promise<CartResponse> {
  return request<CartResponse>(`/v1/carts`, {
    method: 'POST',
    body: JSON.stringify({ customer_email: email }),
  });
}

export async function getCart(cartId: string): Promise<CartResponse> {
  return request<CartResponse>(`/v1/carts/${cartId}`);
}

export async function addItemsToCart(
  cartId: string,
  items: Array<{ sku: string; qty: number }>,
): Promise<AddItemsResponse> {
  return request<AddItemsResponse>(`/v1/carts/${cartId}/items`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function checkoutCart(
  cartId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResponse> {
  return request<CheckoutResponse>(`/v1/carts/${cartId}/checkout`, {
    method: 'POST',
    body: JSON.stringify({
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });
}

export interface ShippingAddressInput {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
  billing_same_as_shipping?: boolean;
}

export async function setShippingAddress(
  cartId: string,
  address: ShippingAddressInput,
): Promise<CartResponse> {
  return request<CartResponse>(`/v1/carts/${cartId}/shipping-address`, {
    method: 'PUT',
    body: JSON.stringify(address),
  });
}

export interface AvailableShippingRateItem {
  id: string;
  display_name: string;
  description?: string;
  amount_cents: number;
  currency: string;
  min_delivery_days?: number;
  max_delivery_days?: number;
  shipping_class_id?: string | null;
}

export interface AvailableShippingRatesResponse {
  items: AvailableShippingRateItem[];
  cart_weight_g?: number;
}

export async function getAvailableShippingRates(
  cartId: string,
): Promise<AvailableShippingRatesResponse> {
  return request<AvailableShippingRatesResponse>(`/v1/carts/${cartId}/available-shipping-rates`);
}

export interface SelectShippingRateBody {
  shipping_rate_id: string;
}

export async function selectShippingRate(
  cartId: string,
  rateId: string,
): Promise<CartResponse> {
  return request<CartResponse>(`/v1/carts/${cartId}/shipping-rate`, {
    method: 'PUT',
    body: JSON.stringify({ shipping_rate_id: rateId }),
  });
}

// ============================================================
// MULTI-REGION API HELPERS
// ============================================================

export interface Currency {
  id: string;
  code: string;
  display_name: string;
  symbol: string;
  decimal_places: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Country {
  id: string;
  code: string;
  display_name: string;
  country_name: string;
  language_code: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  display_name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country_code: string;
  priority: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface ShippingRate {
  id: string;
  display_name: string;
  description?: string;
  max_weight_g?: number;
  min_delivery_days?: number;
  max_delivery_days?: number;
  shipping_class_id?: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Region {
  id: string;
  display_name: string;
  currency_id: string;
  currency_code?: string;
  is_default: boolean;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface PaginationResponse<T> {
  items: T[];
  pagination: {
    has_more: boolean;
    next_cursor: string | null;
  };
}

// Regions
export async function getRegions(limit?: number, cursor?: string): Promise<PaginationResponse<Region>> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);
  return request<PaginationResponse<Region>>(`/v1/regions?${params.toString()}`);
}

export async function getRegion(id: string): Promise<Region> {
  return request<Region>(`/v1/regions/${id}`);
}

export async function createRegion(data: {
  display_name: string;
  currency_id: string;
  is_default?: boolean;
  country_ids?: string[];
  warehouse_ids?: string[];
  shipping_rate_ids?: string[];
}): Promise<Region> {
  return request<Region>(`/v1/regions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateRegion(id: string, data: {
  display_name?: string;
  currency_id?: string;
  is_default?: boolean;
  status?: 'active' | 'inactive';
}): Promise<Region> {
  return request<Region>(`/v1/regions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteRegion(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/v1/regions/${id}`, {
    method: 'DELETE',
  });
}

// Currencies
export async function getCurrencies(limit?: number, cursor?: string): Promise<PaginationResponse<Currency>> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);
  return request<PaginationResponse<Currency>>(`/v1/regions/currencies?${params.toString()}`);
}

export async function getCurrency(id: string): Promise<Currency> {
  return request<Currency>(`/v1/regions/currencies/${id}`);
}

export async function createCurrency(data: {
  code: string;
  display_name: string;
  symbol: string;
  decimal_places?: number;
}): Promise<Currency> {
  return request<Currency>(`/v1/regions/currencies`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCurrency(id: string, data: {
  display_name?: string;
  symbol?: string;
  decimal_places?: number;
  status?: 'active' | 'inactive';
}): Promise<Currency> {
  return request<Currency>(`/v1/regions/currencies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCurrency(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/v1/regions/currencies/${id}`, {
    method: 'DELETE',
  });
}

// Countries
export async function getCountries(limit?: number, cursor?: string): Promise<PaginationResponse<Country>> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);
  return request<PaginationResponse<Country>>(`/v1/regions/countries?${params.toString()}`);
}

export async function getCountry(id: string): Promise<Country> {
  return request<Country>(`/v1/regions/countries/${id}`);
}

export async function createCountry(data: {
  code: string;
  display_name: string;
  country_name: string;
  language_code?: string;
}): Promise<Country> {
  return request<Country>(`/v1/regions/countries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCountry(id: string, data: {
  display_name?: string;
  country_name?: string;
  language_code?: string;
  status?: 'active' | 'inactive';
}): Promise<Country> {
  return request<Country>(`/v1/regions/countries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCountry(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/v1/regions/countries/${id}`, {
    method: 'DELETE',
  });
}

// Warehouses
export async function getWarehouses(limit?: number, cursor?: string): Promise<PaginationResponse<Warehouse>> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);
  return request<PaginationResponse<Warehouse>>(`/v1/regions/warehouses?${params.toString()}`);
}

export async function getWarehouse(id: string): Promise<Warehouse> {
  return request<Warehouse>(`/v1/regions/warehouses/${id}`);
}

export async function createWarehouse(data: {
  display_name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country_code: string;
  priority?: number;
}): Promise<Warehouse> {
  return request<Warehouse>(`/v1/regions/warehouses`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateWarehouse(id: string, data: {
  display_name?: string;
  address_line1?: string;
  address_line2?: string | null;
  city?: string;
  state?: string | null;
  postal_code?: string;
  country_code?: string;
  priority?: number;
  status?: 'active' | 'inactive';
}): Promise<Warehouse> {
  return request<Warehouse>(`/v1/regions/warehouses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteWarehouse(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/v1/regions/warehouses/${id}`, {
    method: 'DELETE',
  });
}

// Shipping Classes
export interface ShippingClass {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  resolution: 'exclusive' | 'additive';
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export async function getShippingClasses(limit?: number, cursor?: string): Promise<PaginationResponse<ShippingClass>> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);
  return request<PaginationResponse<ShippingClass>>(`/v1/regions/shipping-classes?${params.toString()}`);
}

export async function getShippingClass(id: string): Promise<ShippingClass> {
  return request<ShippingClass>(`/v1/regions/shipping-classes/${id}`);
}

export async function createShippingClass(data: {
  code: string;
  display_name: string;
  description?: string;
  resolution?: 'exclusive' | 'additive';
}): Promise<ShippingClass> {
  return request<ShippingClass>(`/v1/regions/shipping-classes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateShippingClass(id: string, data: {
  display_name?: string;
  description?: string | null;
  resolution?: 'exclusive' | 'additive';
  status?: 'active' | 'inactive';
}): Promise<ShippingClass> {
  return request<ShippingClass>(`/v1/regions/shipping-classes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteShippingClass(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/v1/regions/shipping-classes/${id}`, {
    method: 'DELETE',
  });
}

// Shipping Rates
export async function getShippingRates(limit?: number, cursor?: string): Promise<PaginationResponse<ShippingRate>> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);
  return request<PaginationResponse<ShippingRate>>(`/v1/regions/shipping-rates?${params.toString()}`);
}

export async function getShippingRate(id: string): Promise<ShippingRate> {
  return request<ShippingRate>(`/v1/regions/shipping-rates/${id}`);
}

export async function createShippingRate(data: {
  display_name: string;
  description?: string;
  max_weight_g?: number;
  min_delivery_days?: number;
  max_delivery_days?: number;
}): Promise<ShippingRate> {
  return request<ShippingRate>(`/v1/regions/shipping-rates`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateShippingRate(id: string, data: {
  display_name?: string;
  description?: string | null;
  max_weight_g?: number | null;
  min_delivery_days?: number | null;
  max_delivery_days?: number | null;
  status?: 'active' | 'inactive';
}): Promise<ShippingRate> {
  return request<ShippingRate>(`/v1/regions/shipping-rates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteShippingRate(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/v1/regions/shipping-rates/${id}`, {
    method: 'DELETE',
  });
}

