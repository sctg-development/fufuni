/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useCallback } from 'react';
import { decodeJwt } from 'jose';
import { useAuth } from '@/authentication/providers/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface UseWishlistReturn {
  wishlist: string[];
  isLoading: boolean;
  isError: boolean;
  toggle: (productId: string) => Promise<void>;
  isFavorite: (productId: string) => boolean;
}

/**
 * Custom React hook to manage the user's wishlist (favorites).
 * 
 * Features:
 * - Fetches wishlist from Auth0 user_metadata stored in the JWT token
 * - Caches results with React Query (source of truth: JWT token)
 * - Provides toggle, add, and remove functionality
 * - Refreshes JWT token after mutations to ensure wishlist is up to date
 * - Handles loading and error states
 * 
 * Workflow:
 * 1. Get access token and decode JWT
 * 2. Extract wishlist from token['extra_user_info/user_metadata']
 * 3. After POST/DELETE, refresh token and update cache from new JWT
 * 
 * Usage:
 * ```tsx
 * function ProductCard({ productId }) {
 *   const { wishlist, toggle, isFavorite } = useWishlist();
 *   
 *   return (
 *     <button onClick={() => toggle(productId)}>
 *       {isFavorite(productId) ? '❤️' : '🤍'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useWishlist(): UseWishlistReturn {
  const auth = useAuth();
  const queryClient = useQueryClient();

  /**
   * Extract wishlist from JWT token
   * Token structure: payload['extra_user_info/user_metadata'].wishlist
   */
  const extractWishlistFromToken = useCallback((token: string): string[] => {
    try {
      const payload = decodeJwt(token) as any;
      const userMetadata = payload['extra_user_info/user_metadata'];
      return Array.isArray(userMetadata?.wishlist) ? userMetadata.wishlist : [];
    } catch (error) {
      console.error('Error decoding token for wishlist:', error);
      return [];
    }
  }, []);

  /**
   * Fetch the user's wishlist from the JWT token
   * Source of truth: JWT stored in Auth0
   */
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => {
      if (!auth.isAuthenticated) {
        return [];
      }

      try {
        const token = await auth.getAccessToken();
        if (!token) {
          return [];
        }

        return extractWishlistFromToken(token);
      } catch (error) {
        console.error('Error fetching wishlist from token:', error);
        throw error;
      }
    },
    enabled: auth.isAuthenticated,
  });

  /**
   * Mutation: Add a product to the wishlist
   * After POST, refresh token and extract updated wishlist from JWT
   */
  const addMutation = useMutation({
    mutationFn: async (productId: string) => {
      console.log('[Wishlist] Adding product to wishlist:', productId);
      
      // POST to backend - server updates Auth0 user_metadata
      const response = await auth.postJson(
        `${import.meta.env.API_BASE_URL}/v1/me/wishlist`,
        { productId }
      );
      console.log('[Wishlist] POST response:', response);

      // Refresh access token to get updated wishlist in JWT
      console.log('[Wishlist] Refreshing token after adding to wishlist...');
      const refreshedToken = await auth.refreshAccessToken();
      console.log('[Wishlist] Token refreshed:', refreshedToken ? 'yes' : 'no');
      
      if (!refreshedToken) {
        throw new Error('Failed to refresh token after adding to wishlist');
      }

      const wishlist = extractWishlistFromToken(refreshedToken);
      console.log('[Wishlist] Extracted wishlist from token:', wishlist);
      
      return {
        wishlist,
      };
    },
    onSuccess: (data) => {
      console.log('[Wishlist] Mutation success, updating cache:', data.wishlist);
      queryClient.setQueryData(['wishlist'], data.wishlist);
    },
    onError: (error) => {
      console.error('[Wishlist] Mutation error:', error);
    },
  });

  /**
   * Mutation: Remove a product from the wishlist
   * After DELETE, refresh token and extract updated wishlist from JWT
   */
  const removeMutation = useMutation({
    mutationFn: async (productId: string) => {
      console.log('[Wishlist] Removing product from wishlist:', productId);
      
      // DELETE from backend - server updates Auth0 user_metadata
      const response = await auth.deleteJson(
        `${import.meta.env.API_BASE_URL}/v1/me/wishlist/${productId}`
      );
      console.log('[Wishlist] DELETE response:', response);

      // Refresh access token to get updated wishlist in JWT
      console.log('[Wishlist] Refreshing token after removing from wishlist...');
      const refreshedToken = await auth.refreshAccessToken();
      console.log('[Wishlist] Token refreshed:', refreshedToken ? 'yes' : 'no');
      
      if (!refreshedToken) {
        throw new Error('Failed to refresh token after removing from wishlist');
      }

      const wishlist = extractWishlistFromToken(refreshedToken);
      console.log('[Wishlist] Extracted wishlist from token:', wishlist);
      
      return {
        wishlist,
      };
    },
    onSuccess: (data) => {
      console.log('[Wishlist] Mutation success, updating cache:', data.wishlist);
      queryClient.setQueryData(['wishlist'], data.wishlist);
    },
    onError: (error) => {
      console.error('[Wishlist] Mutation error:', error);
    },
  });

  /**
   * Toggle a product in/out of the wishlist
   */
  const toggle = useCallback(
    async (productId: string) => {
      if (!auth.isAuthenticated) {
        // TODO: Open login modal
        console.warn('User not authenticated');
        return;
      }

      const isFav = data.includes(productId);

      if (isFav) {
        await removeMutation.mutateAsync(productId);
      } else {
        await addMutation.mutateAsync(productId);
      }
    },
    [auth.isAuthenticated, data, addMutation, removeMutation]
  );

  /**
   * Check if a product is in the wishlist
   */
  const isFavorite = useCallback(
    (productId: string) => data.includes(productId),
    [data]
  );

  return {
    wishlist: data,
    isLoading: isLoading || addMutation.isPending || removeMutation.isPending,
    isError,
    toggle,
    isFavorite,
  };
}
