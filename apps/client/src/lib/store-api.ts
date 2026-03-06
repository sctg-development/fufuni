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
  image_url?: string;
}

export interface StoreProduct {
  id: string;
  title: string;
  description?: string;
  status?: string;
  variants: StoreVariant[];
  image_url?: string;
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

// TODO: export cart helpers (createCart/addItems/checkout) if needed in the
// frontend later.
