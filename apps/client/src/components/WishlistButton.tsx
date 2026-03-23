/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Button, Tooltip } from '@heroui/react';
import { Heart } from 'lucide-react';
import { useWishlist } from '@/hooks/useWishlist';
import { useAuth } from '@/authentication/providers/use-auth';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { LoginModal } from './LoginModal';

interface WishlistButtonProps {
  productId: string;
  size?: 'sm' | 'md' | 'lg';
  isIconOnly?: boolean;
}

/**
 * WishlistButton — Heart toggle button to add/remove a product from favorites
 * 
 * Shows a filled heart if the product is in the wishlist, empty otherwise.
 * Requires authentication; will show a login prompt if not authenticated.
 * 
 * Workflow:
 * - Authenticated: Click heart → POST /v1/me/wishlist → Token refresh → Heart red
 * - Not authenticated: Click heart → LoginModal → Login → POST /v1/me/wishlist → Heart red
 * 
 * The pending action is preserved across Auth0 redirect via appState + sessionStorage.
 * 
 * Usage:
 * ```tsx
 * <WishlistButton productId="prod_123" />
 * ```
 */
export function WishlistButton({
  productId,
  size = 'md',
  isIconOnly = true,
}: WishlistButtonProps) {
  const { t } = useTranslation();
  const { isFavorite, toggle, isLoading } = useWishlist();
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [returnTo, setReturnTo] = useState<string | undefined>(undefined);

  const isFav = isFavorite(productId);

  const tooltipContent = isFav
    ? t('remove-from-wishlist')
    : t('add-to-wishlist');

  const onWishlistToggle = () => {
    console.log('[WishlistButton] Toggle clicked, isAuthenticated:', isAuthenticated);
    
    if (!isAuthenticated) {
      console.log('[WishlistButton] Not authenticated, opening login modal');
      setReturnTo(`${location.pathname}${location.search}`);
      setLoginModalOpen(true);
      return;
    }

    console.log('[WishlistButton] Calling toggle for product:', productId, 'isFav:', isFav);
    toggle(productId);
  };

  /**
   * Detect if there's a pending wishlist action after auth redirect
   * and execute the toggle immediately
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    const pendingItem = sessionStorage.getItem('pendingWishlistProduct');
    if (pendingItem && pendingItem === productId && !isFav) {
      // Trigger the wishlist addition for the product
      toggle(productId);
      // Clean up the sessionStorage
      sessionStorage.removeItem('pendingWishlistProduct');
    }
  }, [isAuthenticated, productId, isFav, toggle]);

  return (
    <>
      <Tooltip content={tooltipContent} delay={500}>
        <Button
          isIconOnly={isIconOnly}
          className={`${
            isFav ? 'text-red-500' : 'text-default-400'
          } hover:text-red-500 transition-colors`}
          variant="light"
          size={size}
          isLoading={isLoading}
          onPress={onWishlistToggle}
        >
          <Heart
            className="w-5 h-5"
            fill={isFav ? 'currentColor' : 'none'}
            strokeWidth={2}
          />
        </Button>
      </Tooltip>

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        returnTo={returnTo}
        pendingWishlistProduct={productId}
      />
    </>
  );
}
