/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState, useEffect, useCallback } from 'react';
import { decodeJwt } from 'jose';
import { useAuth } from '@/authentication/providers/use-auth';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { getStoreMetadata } from '@/lib/store-metadata';

export interface UseWishlistReturn {
  wishlist: string[];
  isLoading: boolean;
  isError: boolean;
  toggle: (productId: string) => Promise<void>;
  isFavorite: (productId: string) => boolean;
}

const WISHLIST_UPDATED_EVENT = 'fufuni:wishlist-updated';

/**
 * Lightweight token parser function.
 * Extracts wishlist from the user_metadata of the JWT access_token.
 */
const STORE_URL = import.meta.env.STORE_URL;

export function getWishlistFromToken(token: string | null): string[] {
  if (!token) return [];
  try {
    const payload = decodeJwt(token) as any;
    const userMetadata = payload['extra_user_info/user_metadata'];
    const storeMetadata = getStoreMetadata(userMetadata, STORE_URL);

    if (Array.isArray(storeMetadata?.wishlist)) {
      return storeMetadata.wishlist;
    }

    // fallback to legacy root key for backward compatibility
    if (Array.isArray(userMetadata?.wishlist)) {
      return userMetadata.wishlist;
    }

    return [];
  } catch (error) {
    console.error('[useWishlist] Error decoding token for wishlist:', error);
    return [];
  }
}

/**
 * Custom React hook to manage the user's wishlist (favorites).
 * 
 * Features:
 * - Extremely lightweight: 100% derived from the JWT user_metadata
 * - Uses `useTokenRefresh` to keep JWT synced after mutations
 * - Uses a CustomEvent for fast cross-component reactivity without heavy contexts/query caches
 */
export function useWishlist(): UseWishlistReturn {
  const auth = useAuth();
  const { refreshToken } = useTokenRefresh();
  
  const [wishlist, setWishlist] = useState<string[]>([]);
  // We're loading initially if we are authenticated
  const [isLoading, setIsLoading] = useState<boolean>(auth.isAuthenticated);
  const [isError, setIsError] = useState<boolean>(false);

  // Load wishlist from token initially
  useEffect(() => {
    let isMounted = true;
    
    const loadWishlist = async () => {
      if (!auth.isAuthenticated) {
        if (isMounted) {
          setWishlist([]);
          setIsLoading(false);
        }
        return;
      }
      
      try {
        const token = await auth.getAccessToken();
        if (isMounted) {
          setWishlist(getWishlistFromToken(token));
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[useWishlist] Error fetching token:', err);
        if (isMounted) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };
    
    loadWishlist();
    
    return () => { isMounted = false; };
  }, [auth.isAuthenticated, auth.getAccessToken]);

  // Synchronize state across multiple `useWishlist` instances instantly
  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<string[]>;
      setWishlist(customEvent.detail);
    };
    window.addEventListener(WISHLIST_UPDATED_EVENT, handleSync);
    return () => window.removeEventListener(WISHLIST_UPDATED_EVENT, handleSync);
  }, []);

  const toggle = useCallback(
    async (productId: string) => {
      if (!auth.isAuthenticated) {
        console.warn('[useWishlist] Attempted to toggle without authentication');
        return;
      }

      const isFav = wishlist.includes(productId);

      // Optimistic loading state
      setIsLoading(true);
      setIsError(false);

      try {
        // Toggle in backend
        if (isFav) {
          await auth.deleteJson(`${import.meta.env.API_BASE_URL}/v1/me/wishlist/${productId}`);
        } else {
          await auth.postJson(`${import.meta.env.API_BASE_URL}/v1/me/wishlist`, { productId });
        }

        // Backend mutated effectively. Ask for a new JWT token to update local single truth!
        const newToken = await refreshToken();
        
        // Parse directly from the freshly refreshed token payload
        const newWishlist = getWishlistFromToken(newToken || null);
        
        // Update this instance
        setWishlist(newWishlist);
        
        // Notify any other instances across the app (product lists, badges, etc.)
        window.dispatchEvent(new CustomEvent(WISHLIST_UPDATED_EVENT, { detail: newWishlist }));
        
      } catch (error) {
        console.error('[useWishlist] Mutation error:', error);
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [auth, refreshToken, wishlist]
  );

  const isFavorite = useCallback(
    (productId: string) => wishlist.includes(productId),
    [wishlist]
  );

  return {
    wishlist,
    isLoading,
    isError,
    toggle,
    isFavorite,
  };
}
