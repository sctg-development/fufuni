/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { Heart, Bookmark, User as UserIcon } from "lucide-react";
import { useWishlist } from "@/hooks/useWishlist";
import { useSavedCarts, type SavedCartSnapshot } from "@/hooks/useSavedCarts";
import { useNavigate } from "react-router-dom";
import { formatMoney } from "@/utils/currency";
import { resolveTitle } from "@/utils/description";
import { getProduct, type StoreProduct } from "@/lib/store-api";
import { SavedCartModal } from "@/modals/saved-cart-modal";

export function UserListsMenu() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const { wishlist } = useWishlist();
  const { savedCarts } = useSavedCarts();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SavedCartSnapshot | null>(null);

  const { data: wishlistProducts = [] } = useQuery<StoreProduct[], Error>({
    queryKey: ["wishlist-products", wishlist],
    queryFn: async () => {
      if (!wishlist || wishlist.length === 0) return [];
      const resolved = await Promise.all(
        wishlist.map(async (productId) => {
          try {
            return await getProduct(productId);
          } catch (error) {
            console.warn("[UserListsMenu] cannot load wishlist product", productId, error);
            return null;
          }
        }),
      );
      return resolved.filter((p): p is StoreProduct => p !== null);
    },
    enabled: wishlist.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  if (!isAuthenticated) return null;

  const totalItems = (wishlist?.length || 0) + (savedCarts?.length || 0);

  const handleLoadCart = (snapshot: SavedCartSnapshot | string) => {
    // Handle legacy format (just ID string)
    if (typeof snapshot === 'string') {
      console.warn('[UserListsMenu] Cannot load legacy cart ID without snapshot data');
      return;
    }
    
    // Open modal with snapshot
    setSelectedSnapshot(snapshot);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedSnapshot(null);
  };

  const handleLoadCartComplete = () => {
    // Navigate to cart page after loading
    navigate('/cart');
  };

  return (
    <>
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
          className="w-80"
        >
          <DropdownSection title={user?.name || user?.email || t("my-account", "My Account")} showDivider>
            <DropdownItem key="account" onPress={() => navigate('/account')}>
              {t('dashboard', 'Dashboard')}
            </DropdownItem>
          </DropdownSection>

          <DropdownSection title={t('my-wishlist', 'My Wishlist')} showDivider>
            {wishlist && wishlist.length > 0 ? (
              wishlist.map((productId) => {
                const matchedProduct = wishlistProducts.find((p) => p.id === productId);
                const displayTitle = matchedProduct
                  ? resolveTitle(matchedProduct.title, i18n.language)
                  : productId;

                return (
                  <DropdownItem
                    key={`wishlist-${productId}`}
                    startContent={<Heart className="w-4 h-4 text-danger shrink-0" fill="currentColor" />}
                    description={matchedProduct ? undefined : `ID: ${productId}`}
                    onPress={() => navigate(`/product/${productId}`)}
                  >
                    {displayTitle}
                  </DropdownItem>
                );
              })
            ) : (
              <DropdownItem key="wishlist-empty" isReadOnly className="text-default-400">
                {t('wishlist-empty', 'Your wishlist is empty')}
              </DropdownItem>
            )}
          </DropdownSection>

          <DropdownSection title={t('my-saved-carts', 'My Saved Carts')}>
            {savedCarts && savedCarts.length > 0 ? (
              savedCarts.map(snapshot => {
                // Handle both new snapshot format and legacy string format
                const isSnapshot = typeof snapshot === 'object' && snapshot !== null && 'items' in snapshot;
                if (!isSnapshot) {
                  // Legacy format: just an ID string - show but disable loading
                  return (
                    <DropdownItem
                      key={`cart-${snapshot}`}
                      startContent={<Bookmark className="w-4 h-4 text-primary shrink-0" fill="currentColor" />}
                      description={`ID: ${snapshot} (${t('legacy', 'legacy')})`}
                      isDisabled
                    >
                      {t('cart-number', { num: (snapshot as string).slice(0, 8) }) || `Cart #${(snapshot as string).slice(0, 8)}`}
                    </DropdownItem>
                  );
                }

                // New format: full snapshot
                const itemCount = snapshot.items?.length || 0;
                const totalCents = snapshot.totals?.total_cents || 0;
                const currency = snapshot.currency || 'USD';
                
                return (
                  <DropdownItem
                    key={`cart-${snapshot.id}`}
                    startContent={<Bookmark className="w-4 h-4 text-primary shrink-0" fill="currentColor" />}
                    description={`${itemCount} ${itemCount === 1 ? t('item') : t('items')} • ${formatMoney(totalCents, currency)}`}
                    onPress={() => handleLoadCart(snapshot)}
                  >
                    {t('cart-number', { num: snapshot.id.slice(0, 8) }) || `Cart #${snapshot.id.slice(0, 8)}`}
                  </DropdownItem>
                );
              })
            ) : (
              <DropdownItem key="carts-empty" isReadOnly className="text-default-400">
                {t('saved-carts-empty', 'No saved carts')}
              </DropdownItem>
            )}
          </DropdownSection>
        </DropdownMenu>
      </Dropdown>

      {/* Saved Cart Modal */}
      {selectedSnapshot && (
        <SavedCartModal
          isOpen={isModalOpen}
          onOpenChange={handleModalClose}
          snapshot={selectedSnapshot}
          onLoadCart={handleLoadCartComplete}
        />
      )}
    </>
  );
}
