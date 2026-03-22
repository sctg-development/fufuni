/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Button, Tooltip } from '@heroui/react';
import { Heart } from 'lucide-react';
import { useWishlist } from '@/hooks/useWishlist';
import { useTranslation } from 'react-i18next';

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

  const isFav = isFavorite(productId);

  const tooltipContent = isFav
    ? t('remove-from-wishlist', { defaultValue: 'Remove from favorites' })
    : t('add-to-wishlist', { defaultValue: 'Add to favorites' });

  return (
    <Tooltip content={tooltipContent} delay={500}>
      <Button
        isIconOnly={isIconOnly}
        className={`${
          isFav ? 'text-red-500' : 'text-default-400'
        } hover:text-red-500 transition-colors`}
        variant="light"
        size={size}
        isLoading={isLoading}
        onPress={() => toggle(productId)}
      >
        <Heart
          className="w-5 h-5"
          fill={isFav ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
      </Button>
    </Tooltip>
  );
}
