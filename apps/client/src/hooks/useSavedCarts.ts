/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState, useEffect, useCallback } from 'react';
import { decodeJwt } from 'jose';
import { useAuth } from '@/authentication/providers/use-auth';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';

export interface UseSavedCartsReturn {
  savedCarts: string[];
  isLoading: boolean;
  isError: boolean;
  toggleSavedCart: (cartId: string) => Promise<void>;
  isSaved: (cartId: string) => boolean;
}

const SAVED_CARTS_UPDATED_EVENT = 'fufuni:saved-carts-updated';

/**
 * Lightweight token parser function.
 * Extracts saved carts from the user_metadata of the JWT access_token.
 */
const STORE_URL = (import.meta.env.STORE_URL || '').replace(/\/$/, '');

function getStoreMetadata(userMetadata: any): any {
  if (!userMetadata || typeof userMetadata !== 'object') return undefined;
  if (STORE_URL && userMetadata[STORE_URL] && typeof userMetadata[STORE_URL] === 'object') {
    return userMetadata[STORE_URL];
  }
  return userMetadata;
}

export function getSavedCartsFromToken(token: string | null): string[] {
  if (!token) return [];
  try {
    const payload = decodeJwt(token) as any;
    const userMetadata = payload['extra_user_info/user_metadata'];
    const storeMetadata = getStoreMetadata(userMetadata);

    if (Array.isArray(storeMetadata?.saved_carts)) {
      return storeMetadata.saved_carts;
    }

    // fallback to legacy root key for backward compatibility
    if (Array.isArray(userMetadata?.saved_carts)) {
      return userMetadata.saved_carts;
    }

    return [];
  } catch (error) {
    console.error('[useSavedCarts] Error decoding token for saved carts:', error);
    return [];
  }
}

/**
 * Custom React hook to manage the user's saved carts.
 * 
 * Features:
 * - Extremely lightweight: 100% derived from the JWT user_metadata
 * - Uses `useTokenRefresh` to keep JWT synced after mutations
 * - Uses a CustomEvent for fast cross-component reactivity without heavy contexts/query caches
 */
export function useSavedCarts(): UseSavedCartsReturn {
  const auth = useAuth();
  const { refreshToken } = useTokenRefresh();
  
  const [savedCarts, setSavedCarts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(auth.isAuthenticated);
  const [isError, setIsError] = useState<boolean>(false);

  // Load saved carts from token initially
  useEffect(() => {
    let isMounted = true;
    
    const loadSavedCarts = async () => {
      if (!auth.isAuthenticated) {
        if (isMounted) {
          setSavedCarts([]);
          setIsLoading(false);
        }
        return;
      }
      
      try {
        const token = await auth.getAccessToken();
        if (isMounted) {
          setSavedCarts(getSavedCartsFromToken(token));
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[useSavedCarts] Error fetching token:', err);
        if (isMounted) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };
    
    loadSavedCarts();
    
    return () => { isMounted = false; };
  }, [auth.isAuthenticated, auth.getAccessToken]);

  // Synchronize state across multiple instances instantly
  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<string[]>;
      setSavedCarts(customEvent.detail);
    };
    window.addEventListener(SAVED_CARTS_UPDATED_EVENT, handleSync);
    return () => window.removeEventListener(SAVED_CARTS_UPDATED_EVENT, handleSync);
  }, []);

  const toggleSavedCart = useCallback(
    async (cartId: string) => {
      if (!auth.isAuthenticated) {
        console.warn('[useSavedCarts] Attempted to toggle without authentication');
        return;
      }

      const saved = savedCarts.includes(cartId);

      setIsLoading(true);
      setIsError(false);

      try {
        if (saved) {
          await auth.deleteJson(`${import.meta.env.API_BASE_URL}/v1/me/saved-carts/${cartId}`);
        } else {
          await auth.postJson(`${import.meta.env.API_BASE_URL}/v1/me/saved-carts`, { cartId });
        }

        const newToken = await refreshToken();
        const newSavedCarts = getSavedCartsFromToken(newToken || null);
        
        setSavedCarts(newSavedCarts);
        window.dispatchEvent(new CustomEvent(SAVED_CARTS_UPDATED_EVENT, { detail: newSavedCarts }));
        
      } catch (error) {
        console.error('[useSavedCarts] Mutation error:', error);
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [auth, refreshToken, savedCarts]
  );

  const isSaved = useCallback(
    (cartId: string) => savedCarts.includes(cartId),
    [savedCarts]
  );

  return {
    savedCarts,
    isLoading,
    isError,
    toggleSavedCart,
    isSaved,
  };
}
