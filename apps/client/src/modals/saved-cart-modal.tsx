/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Divider,
  Card,
  CardBody,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import type { SavedCartSnapshot } from "@/hooks/useSavedCarts";
import { formatMoney } from "@/utils/currency";

interface SavedCartModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  snapshot: SavedCartSnapshot;
  onLoadCart?: () => void;
}

/**
 * SavedCartModal — Display details of a saved cart snapshot and allow loading it
 */
export function SavedCartModal({
  isOpen,
  onOpenChange,
  snapshot,
  onLoadCart,
}: SavedCartModalProps) {
  const { t } = useTranslation();
  const { addItem, clear } = useCart();

  const handleLoadCart = () => {
    try {
      // Clear current cart and load saved items
      clear();
      
      // Add each item from the snapshot
      snapshot.items.forEach((item) => {
        addItem({
          sku: item.sku,
          title: item.title,
          price_cents: item.unit_price_cents,
          currency: snapshot.currency,
          qty: item.qty,
        });
      });

      // Call optional callback (e.g., navigate to cart)
      onLoadCart?.();
      
      // Close modal
      onOpenChange(false);
    } catch (error) {
      console.error('[SavedCartModal] Error loading cart:', error);
    }
  };

  const itemCount = snapshot.items?.length || 0;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {t('load-saved-cart', 'Load Saved Cart')}
            </ModalHeader>

            <Divider />

            <ModalBody className="gap-4">
              {/* Cart Summary */}
              <div className="flex justify-between items-center p-3 bg-default-100 rounded-lg">
                <div>
                  <p className="text-sm text-default-500">
                    {t('saved-on', 'Saved on')}:{' '}
                    {new Date(snapshot.saved_at).toLocaleDateString()}
                  </p>
                  <p className="font-semibold">
                    {itemCount} {itemCount === 1 ? t('item') : t('items')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-default-500">{t('total', 'Total')}</p>
                  <p className="text-xl font-bold">
                    {formatMoney(snapshot.totals.total_cents, snapshot.currency)}
                  </p>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {snapshot.items.map((item, idx) => (
                  <Card key={`${item.sku}-${idx}`} className="bg-default-50">
                    <CardBody className="flex-row gap-3 p-3">
                      <div className="flex-1">
                        <p className="font-medium">{item.title}</p>
                        <p className="text-sm text-default-500">
                          {t('sku', 'SKU')}: {item.sku}
                        </p>
                        <p className="text-sm text-default-500">
                          {t('qty', 'Qty')}: {item.qty} ×{' '}
                          {formatMoney(item.unit_price_cents, snapshot.currency)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {formatMoney(
                            item.unit_price_cents * item.qty,
                            snapshot.currency
                          )}
                        </p>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>

              {/* Totals Breakdown */}
              <Card className="bg-default-50">
                <CardBody className="gap-2 p-3">
                  <div className="flex justify-between text-sm">
                    <span>{t('subtotal', 'Subtotal')}</span>
                    <span>
                      {formatMoney(
                        snapshot.totals.subtotal_cents,
                        snapshot.currency
                      )}
                    </span>
                  </div>
                  {snapshot.totals.discount_cents > 0 && (
                    <div className="flex justify-between text-sm text-success">
                      <span>{t('discount', 'Discount')}</span>
                      <span>
                        -
                        {formatMoney(
                          snapshot.totals.discount_cents,
                          snapshot.currency
                        )}
                      </span>
                    </div>
                  )}
                  {snapshot.totals.shipping_cents > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>{t('shipping', 'Shipping')}</span>
                      <span>
                        {formatMoney(
                          snapshot.totals.shipping_cents,
                          snapshot.currency
                        )}
                      </span>
                    </div>
                  )}
                  {snapshot.totals.tax_cents > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>{t('tax', 'Tax')}</span>
                      <span>
                        {formatMoney(
                          snapshot.totals.tax_cents,
                          snapshot.currency
                        )}
                      </span>
                    </div>
                  )}
                  <Divider className="my-1" />
                  <div className="flex justify-between font-semibold text-lg">
                    <span>{t('total', 'Total')}</span>
                    <span>
                      {formatMoney(
                        snapshot.totals.total_cents,
                        snapshot.currency
                      )}
                    </span>
                  </div>
                </CardBody>
              </Card>

              {/* Warning Message */}
              <div className="p-3 bg-warning-50 rounded-lg border border-warning-200">
                <p className="text-sm text-warning-700">
                  {t(
                    'load-cart-warning',
                    'This will replace your current cart with all items from this saved cart.'
                  )}
                </p>
              </div>
            </ModalBody>

            <Divider />

            <ModalFooter>
              <Button color="default" variant="light" onPress={onClose}>
                {t('cancel', 'Cancel')}
              </Button>
              <Button
                color="primary"
                onPress={handleLoadCart}
                startContent={<Trash2 className="w-4 h-4" />}
              >
                {t('load-cart', 'Load Cart')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
