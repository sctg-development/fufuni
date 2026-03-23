/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useCallback } from 'react';
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
 * - Fetches wishlist from Auth0 user_metadata via backend API
 * - Caches results with React Query
 * - Provides toggle, add, and remove functionality
 * - Handles loading and error states
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
  const { isAuthenticated, getJson, deleteJson, postJson} = useAuth();
  const queryClient = useQueryClient();

  /**
   * Fetch the user's wishlist from the backend
   */
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => {
      if (!isAuthenticated) {
        return [];
      }

      try {
        const result = await getJson(
          `${import.meta.env.API_BASE_URL}/v1/me/wishlist`
        );

        return (result?.wishlist || []) as string[];
      } catch (error) {
        console.error('Error fetching wishlist:', error);
        throw error;
      }
    },
    enabled: isAuthenticated,
  });

  /**
   * Mutation: Add a product to the wishlist
   */
  const addMutation = useMutation({
    mutationFn: async (productId: string) => {
      const result = await postJson(
        `${import.meta.env.API_BASE_URL}/v1/me/wishlist`,
        { productId }
      );

      return result;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['wishlist'], data.wishlist);
    },
  });

  /**
   * Mutation: Remove a product from the wishlist
   */
  const removeMutation = useMutation({
    mutationFn: async (productId: string) => {
      const result = await deleteJson(
        `${import.meta.env.API_BASE_URL}/v1/me/wishlist/${productId}`
      );

      return result;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['wishlist'], data.wishlist);
    },
  });

  /**
   * Toggle a product in/out of the wishlist
   */
  const toggle = useCallback(
    async (productId: string) => {
      if (!isAuthenticated) {
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
    [isAuthenticated, data, addMutation, removeMutation]
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
