/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
  DropdownSection,
  Badge,
} from "@heroui/react";
import { useAuth } from "@/authentication/providers/use-auth";
import { useTranslation } from "react-i18next";
import { Heart, Bookmark, User as UserIcon } from "lucide-react";
import { useWishlist } from "@/hooks/useWishlist";
import { useSavedCarts } from "@/hooks/useSavedCarts";
import { useNavigate } from "react-router-dom";

export function UserListsMenu() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const { wishlist } = useWishlist();
  const { savedCarts } = useSavedCarts();
  const navigate = useNavigate();

  if (!isAuthenticated) return null;

  const totalItems = (wishlist?.length || 0) + (savedCarts?.length || 0);

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button isIconOnly variant="light" aria-label="Account Menu" className="relative">
          <Badge content={totalItems} color="danger" size="sm" isInvisible={totalItems === 0}>
            <UserIcon size={20} className="text-default-500" />
          </Badge>
        </Button>
      </DropdownTrigger>
      
      <DropdownMenu 
        aria-label="User Lists Menu" 
        variant="flat"
        className="w-64"
      >
        <DropdownSection title={user?.name || user?.email || t("my-account", "My Account")} showDivider>
          <DropdownItem key="account" onPress={() => navigate('/account')}>
            {t('dashboard', 'Dashboard')}
          </DropdownItem>
        </DropdownSection>

        <DropdownSection title={t('my-wishlist', 'My Wishlist')} showDivider>
          {wishlist && wishlist.length > 0 ? (
            wishlist.map(sku => (
              <DropdownItem
                key={`wishlist-${sku}`}
                startContent={<Heart className="w-4 h-4 text-danger shrink-0" fill="currentColor" />}
                description={`SKU: ${sku}`}
                onPress={() => navigate(`/product/${sku}`)}
              >
                {t('view-product', 'View Product')}
              </DropdownItem>
            ))
          ) : (
            <DropdownItem key="wishlist-empty" isReadOnly className="text-default-400">
              {t('wishlist-empty', 'Your wishlist is empty')}
            </DropdownItem>
          )}
        </DropdownSection>

        <DropdownSection title={t('my-saved-carts', 'My Saved Carts')}>
          {savedCarts && savedCarts.length > 0 ? (
            savedCarts.map(cartId => (
              <DropdownItem
                key={`cart-${cartId}`}
                startContent={<Bookmark className="w-4 h-4 text-primary flex-shrink-0" fill="currentColor" />}
                description={t('saved-cart-id', { id: cartId })}
              >
                {t('cart-number', { num: cartId }) || `Cart #${cartId}`}
              </DropdownItem>
            ))
          ) : (
            <DropdownItem key="carts-empty" isReadOnly className="text-default-400">
              {t('saved-carts-empty', 'No saved carts')}
            </DropdownItem>
          )}
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
