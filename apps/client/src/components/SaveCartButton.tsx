/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Button } from '@heroui/react';
import { Bookmark } from 'lucide-react';
import { useAuth } from '@/authentication/providers/use-auth';
import { useTranslation } from 'react-i18next';
import { useSavedCarts } from '@/hooks/useSavedCarts';
import { useState } from 'react';

interface SaveCartButtonProps {
  cartId?: string;
  onBeforeSave?: () => Promise<string | undefined>;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * SaveCartButton — Save or unsave the current cart to the user's account
 * 
 * Requires authentication. Saves the current cart ID to the user's
 * saved carts list for quick retrieval later. Uses the Auth0 user_metadata token.
 * 
 * Usage:
 * ```tsx
 * <SaveCartButton cartId={123} onSuccess={() => alert('Saved!')} />
 * ```
 */
export function SaveCartButton({
  cartId,
  onBeforeSave,
  onSuccess,
  onError,
}: SaveCartButtonProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { toggleSavedCart, isSaved, isLoading } = useSavedCarts();
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);

  const saved = cartId ? isSaved(cartId) : false;

  const handleToggleCart = async () => {
    if (!isAuthenticated) {
      const error = new Error('User not authenticated');
      onError?.(error);
      return;
    }

    try {
      setIsProcessingLocal(true);
      let targetCartId = cartId;
      
      if (!targetCartId && onBeforeSave) {
        targetCartId = await onBeforeSave();
      }

      if (!targetCartId) {
        console.error('[SaveCartButton] No cart ID provided. cartId:', cartId);
        throw new Error('No cart ID provided or created');
      }

      await toggleSavedCart(targetCartId);
      onSuccess?.();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      console.error('Error toggling cart:', err);
    } finally {
      setIsProcessingLocal(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Button
      isLoading={isLoading || isProcessingLocal}
      variant={saved ? "solid" : "bordered"}
      color={saved ? "primary" : "default"}
      size="md"
      className={saved ? "text-primary-foreground" : ""}
      startContent={
        <Bookmark 
          className="w-4 h-4" 
          fill={saved ? "currentColor" : "none"}
        />
      }
      onPress={handleToggleCart}
    >
      {saved ? t('unsave-cart', 'Unsave Cart') : t('save-cart')}
    </Button>
  );
}
