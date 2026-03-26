/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState } from "react";
import {
  Dropdown,
  Button,
  Label,
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
      <Dropdown>
        <Dropdown.Trigger>
          <Button isIconOnly variant="tertiary" aria-label="Account Menu" className="relative">
            {totalItems > 0 && (
              <Badge content={totalItems.toString()} color="danger">
                <UserIcon size={20} className="text-default-500" />
              </Badge>
            )}
            {totalItems === 0 && <UserIcon size={20} className="text-default-500" />}
          </Button>
        </Dropdown.Trigger>
        
        <Dropdown.Popover>
          <Dropdown.Menu 
            aria-label="User Lists Menu" 
            className="w-80"
          >
            <Dropdown.Section>
              <div className="px-2 py-1 text-small font-left font-semibold text-default-900">{user?.name || user?.email || t("my-account", "My Account")}</div>
              <Dropdown.Item 
                key="account" 
                id="account"
                textValue="Dashboard"
                onPress={() => navigate('/account')}
              >
                <Label>{t('dashboard', 'Dashboard')}</Label>
              </Dropdown.Item>
            </Dropdown.Section>

            <Dropdown.Section>
              <div className="px-2 py-1 text-small font-left font-semibold text-default-900">{t('my-wishlist', 'My Wishlist')}</div>
              {wishlist && wishlist.length > 0 ? (
                wishlist.map((productId) => {
                  const matchedProduct = wishlistProducts.find((p) => p.id === productId);
                  const displayTitle = matchedProduct
                    ? resolveTitle(matchedProduct.title, i18n.language)
                    : productId;

                  return (
                    <Dropdown.Item
                      key={`wishlist-${productId}`}
                      id={`wishlist-${productId}`}
                      textValue={displayTitle}
                      onPress={() => navigate(`/product/${productId}`)}
                    >
                      <div className="flex gap-4 w-full items-center">
                        <Heart className="w-4 h-4 text-danger shrink-0" fill="currentColor" />
                        <div className="flex flex-col flex-1 gap-1">
                          <Label>{displayTitle}</Label>
                          {matchedProduct ? null : <p className="text-xs text-default-400">ID: {productId}</p>}
                        </div>
                      </div>
                    </Dropdown.Item>
                  );
                })
              ) : (
                <Dropdown.Item 
                  key="wishlist-empty" 
                  id="wishlist-empty"
                  textValue="Your wishlist is empty"
                  isDisabled 
                  className="text-default-400"
                >
                  <Label>{t('wishlist-empty', 'Your wishlist is empty')}</Label>
                </Dropdown.Item>
              )}
            </Dropdown.Section>

            <Dropdown.Section>
              <div className="px-2 py-1 text-small font-left font-semibold text-default-900">{t('my-saved-carts', 'My Saved Carts')}</div>
              {savedCarts && savedCarts.length > 0 ? (
                savedCarts.map(snapshot => {
                  // Handle both new snapshot format and legacy string format
                  const isSnapshot = typeof snapshot === 'object' && snapshot !== null && 'items' in snapshot;
                  if (!isSnapshot) {
                    // Legacy format: just an ID string - show but disable loading
                    return (
                      <Dropdown.Item
                        key={`cart-${snapshot}`}
                        id={`cart-${snapshot}`}
                        textValue={`Cart #${(snapshot as string).slice(0, 8)}`}
                        isDisabled
                      >
                        <div className="flex gap-4 w-full items-center">
                          <Bookmark className="w-4 h-4 text-primary shrink-0" fill="currentColor" />
                          <div className="flex flex-col flex-1 gap-1">
                            <Label>{t('cart-number', { num: (snapshot as string).slice(0, 8) }) || `Cart #${(snapshot as string).slice(0, 8)}`}</Label>
                            <p className="text-xs text-default-400">ID: {snapshot} (${t('legacy', 'legacy')})</p>
                          </div>
                        </div>
                      </Dropdown.Item>
                    );
                  }

                  // New format: full snapshot
                  const itemCount = snapshot.items?.length || 0;
                  const totalCents = snapshot.totals?.total_cents || 0;
                  const currency = snapshot.currency || 'USD';
                  
                  return (
                    <Dropdown.Item
                      key={`cart-${snapshot.id}`}
                      id={`cart-${snapshot.id}`}
                      textValue={t('cart-number', { num: snapshot.id.slice(0, 8) }) || `Cart #${snapshot.id.slice(0, 8)}`}
                      onPress={() => handleLoadCart(snapshot)}
                    >
                      <div className="flex gap-4 w-full items-center">
                        <Bookmark className="w-4 h-4 text-primary shrink-0" fill="currentColor" />
                        <div className="flex flex-col flex-1 gap-1">
                          <Label>{t('cart-number', { num: snapshot.id.slice(0, 8) }) || `Cart #${snapshot.id.slice(0, 8)}`}</Label>
                          <p className="text-xs text-default-400">{itemCount} ${itemCount === 1 ? t('item') : t('items')} • ${formatMoney(totalCents, currency)}</p>
                        </div>
                      </div>
                    </Dropdown.Item>
                  );
                })
              ) : (
                <Dropdown.Item 
                  key="carts-empty" 
                  id="carts-empty"
                  textValue="No saved carts"
                  isDisabled 
                  className="text-default-400"
                >
                  <Label>{t('saved-carts-empty', 'No saved carts')}</Label>
                </Dropdown.Item>
              )}
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
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
