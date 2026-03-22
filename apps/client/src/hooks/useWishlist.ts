/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
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
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
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
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: import.meta.env.AUTH0_AUDIENCE || '',
          },
        });

        const response = await fetch(
          `${import.meta.env.API_BASE_URL}/v1/me/wishlist`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch wishlist');
        }

        const data = (await response.json()) as { wishlist: string[] };
        return data.wishlist;
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
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: import.meta.env.AUTH0_AUDIENCE || '',
        },
      });

      const response = await fetch(
        `${import.meta.env.API_BASE_URL}/v1/me/wishlist`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add product to wishlist');
      }

      return response.json();
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
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: import.meta.env.AUTH0_AUDIENCE || '',
        },
      });

      const response = await fetch(
        `${import.meta.env.API_BASE_URL}/v1/me/wishlist/${productId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to remove product from wishlist');
      }

      return response.json();
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
