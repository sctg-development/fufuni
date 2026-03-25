/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Store metadata utilities for managing Auth0 user_metadata
 * Handles normalization and retrieval of store-specific metadata
 */

/**
 * Normalize store URL for use as a metadata key.
 * Auth0 does not allow dots (.), colons (:), or slashes (/) in user_metadata field names,
 * so we replace them with underscores.
 * 
 * @param storeUrl - The store URL to normalize (e.g., "https://store.example.com/")
 * @returns Normalized key (e.g., "https___store_example_com") or undefined
 */
export const normalizeStoreUrl = (storeUrl?: string): string | undefined => {
  if (!storeUrl) return undefined;
  const normalized = storeUrl
    .replace(/\/$/, '') // Remove trailing slash
    .replace(/[:.\/]/g, '_'); // Replace dots, colons, and slashes with underscores
  return normalized || undefined;
};

/**
 * Extract store-specific metadata from user_metadata.
 * Falls back to root-level metadata for backward compatibility.
 * 
 * @param userMetadata - The Auth0 user_metadata object
 * @param storeUrl - Optional store URL to use as key
 * @returns Store metadata object or the parent metadata if no store URL
 */
export const getStoreMetadata = (
  userMetadata: any,
  storeUrl?: string
): any => {
  if (!userMetadata || typeof userMetadata !== 'object') return undefined;
  
  const normalizedUrl = normalizeStoreUrl(storeUrl);
  if (normalizedUrl && userMetadata[normalizedUrl] && typeof userMetadata[normalizedUrl] === 'object') {
    return userMetadata[normalizedUrl];
  }
  
  return userMetadata;
};
