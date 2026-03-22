/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Button } from '@heroui/react';
import { Bookmark } from 'lucide-react';
import { useAuth0 } from '@auth0/auth0-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SaveCartButtonProps {
  cartId: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * SaveCartButton — Save the current cart to the user's account
 * 
 * Requires authentication. Saves the current cart ID to the user's
 * saved carts list for quick retrieval later.
 * 
 * Usage:
 * ```tsx
 * <SaveCartButton cartId={123} onSuccess={() => alert('Saved!')} />
 * ```
 */
export function SaveCartButton({
  cartId,
  onSuccess,
  onError,
}: SaveCartButtonProps) {
  const { t } = useTranslation();
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveCart = async () => {
    if (!isAuthenticated) {
      const error = new Error('User not authenticated');
      onError?.(error);
      return;
    }

    try {
      setIsLoading(true);

      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: import.meta.env.AUTH0_AUDIENCE || '',
        },
      });

      const response = await fetch(
        `${import.meta.env.API_BASE_URL}/v1/me/saved-carts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cartId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save cart');
      }

      onSuccess?.();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      console.error('Error saving cart:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Button
      isLoading={isLoading}
      variant="bordered"
      size="md"
      startContent={<Bookmark className="w-4 h-4" />}
      onPress={handleSaveCart}
    >
      {t('save-cart', { defaultValue: 'Save cart' })}
    </Button>
  );
}
