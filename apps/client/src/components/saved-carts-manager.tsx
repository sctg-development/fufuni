/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useMemo, useState } from "react";
import {
  Card,
  CardBody,
  Button,
  Chip,
  Divider,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Link as HeroUILink,
} from "@heroui/react";
import { useSavedCarts } from "@/hooks/useSavedCarts";
import { SavedCartSnapshot } from "@/hooks/useSavedCarts";
import { formatMoney } from "@/utils/currency";

/**
 * SavedCartsManager - Modern saved carts interface
 * Displays saved carts with detailed view, restore, and delete actions
 */
export function SavedCartsManager() {
  const { savedCarts, toggleSavedCart, isLoading } = useSavedCarts();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [selectedCart, setSelectedCart] = useState<
    SavedCartSnapshot | null
  >(null);

  const totalSavedValue = useMemo(() => {
    return savedCarts.reduce((sum, cart) => {
      if (typeof cart === "string") return sum;
      return sum + (cart as SavedCartSnapshot).totals.total_cents;
    }, 0);
  }, [savedCarts]);

  const handleViewCart = (cart: SavedCartSnapshot | string) => {
    if (typeof cart !== "string") {
      setSelectedCart(cart);
      onOpen();
    }
  };

  const handleRestoreCart = (cartId: string) => {
    // TODO: Implement cart restoration logic
    console.log("Restoring cart:", cartId);
  };

  if (savedCarts.length === 0) {
    return (
      <Card className="border border-default-200 bg-default-50">
        <CardBody className="py-12 text-center">
          <div className="space-y-4">
            <p className="text-5xl">🛒</p>
            <p className="text-lg font-semibold text-default-700">
              Pas de panier sauvegardé
            </p>
            <p className="text-sm text-default-500">
              Sauvegardez vos paniers pour les finaliser plus tard
            </p>
            <HeroUILink href="/" className="mt-4">
              <Button color="primary" variant="flat">
                Découvrir nos produits
              </Button>
            </HeroUILink>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="bg-linear-to-br from-purple-500/10 to-purple-600/10 border border-purple-200">
        <CardBody>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-default-600 font-medium">
                Paniers sauvegardés
              </p>
              <p className="text-3xl font-bold text-purple-600 mt-1">
                {savedCarts.length}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-default-600 font-medium">
                Valeur totale
              </p>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                {savedCarts.length > 0 && typeof savedCarts[0] !== 'string'
                  ? formatMoney(
                      totalSavedValue,
                      (savedCarts[0] as SavedCartSnapshot).currency
                    )
                  : "N/A"}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Saved Carts List */}
      <div className="space-y-3">
        {savedCarts.map((cart, idx) => {
          if (typeof cart === "string") {
            return (
              <Card
                key={idx}
                className="border border-default-200 hover:border-purple-300 transition-colors"
              >
                <CardBody className="flex-row justify-between items-center">
                  <div>
                    <p className="font-semibold">{cart}</p>
                    <p className="text-sm text-default-500">ID de panier</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      isIconOnly
                      variant="light"
                      color="danger"
                      size="sm"
                      isLoading={isLoading}
                      onPress={() => toggleSavedCart(cart)}
                    >
                      🗑️
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          }

          const cartData = cart as SavedCartSnapshot;
          const itemCount = cartData.items.length;
          const savedDate = new Date(cartData.saved_at);
          const daysSaved = Math.floor(
            (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24),
          );

          return (
            <Card
              key={idx}
              className="border border-default-200 hover:border-purple-300 transition-colors"
            >
              <CardBody className="py-4">
                <div className="flex justify-between items-start gap-4">
                  {/* Info Section - Clickable */}
                  <div
                    className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleViewCart(cartData)}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-lg">
                        Panier #{cartData.id.substring(0, 8)}
                      </p>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={
                          cartData.status === "open"
                            ? "success"
                            : cartData.status === "checked_out"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {cartData.status === "open"
                          ? "Ouvert"
                          : cartData.status === "checked_out"
                            ? "En cours"
                            : "Expiré"}
                      </Chip>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                      <div>
                        <p className="text-xs text-default-500">Articles</p>
                        <p className="text-lg font-bold text-purple-600">
                          {itemCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500">Total</p>
                        <p className="text-lg font-bold text-purple-600">
                          {formatMoney(
                            cartData.totals.total_cents,
                            cartData.currency
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500">Devise</p>
                        <p className="text-lg font-bold text-purple-600">
                          {cartData.currency}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500">Sauvegardé</p>
                        <p className="text-sm font-semibold text-default-700">
                          {daysSaved === 0 ? "Aujourd'hui" : `${daysSaved}j`}
                        </p>
                      </div>
                    </div>

                    {/* Items Preview */}
                    <div className="mt-3 pt-3 border-t border-default-100">
                      <p className="text-xs font-semibold text-default-600 mb-2">
                        Articles ({itemCount})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {cartData.items.map((item, itemIdx) => (
                          <Chip
                            key={itemIdx}
                            size="sm"
                            variant="flat"
                            className="text-xs"
                          >
                            {item.title} x{item.qty}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 ml-3 shrink-0">
                    <Button
                      isIconOnly
                      color="primary"
                      variant="flat"
                      size="sm"
                      onPress={() => handleViewCart(cartData)}
                      title="Voir les détails"
                    >
                      👁️
                    </Button>
                    <Button
                      isIconOnly
                      color="success"
                      variant="flat"
                      size="sm"
                      onPress={() => handleRestoreCart(cartData.id)}
                      title="Restaurer le panier"
                    >
                      ↩️
                    </Button>
                    <Button
                      isIconOnly
                      color="danger"
                      variant="light"
                      size="sm"
                      isLoading={isLoading}
                      onPress={() => toggleSavedCart(cartData.id)}
                      title="Supprimer"
                    >
                      🗑️
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Cart Details Modal */}
      <Modal size="2xl" isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Détails du panier
              </ModalHeader>
              <Divider />
              <ModalBody>
                {selectedCart && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-default-500">ID</p>
                        <p className="font-mono text-xs">
                          {selectedCart.id}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-default-500">Devise</p>
                        <p className="font-semibold">
                          {selectedCart.currency}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-default-500">Email</p>
                        <p className="text-sm">{selectedCart.customer_email}</p>
                      </div>
                      <div>
                        <p className="text-sm text-default-500">Status</p>
                        <Chip
                          size="sm"
                          variant="flat"
                          color={
                            selectedCart.status === "open"
                              ? "success"
                              : selectedCart.status === "checked_out"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {selectedCart.status}
                        </Chip>
                      </div>
                    </div>

                    <Divider />

                    {/* Items Table */}
                    <Table aria-label="Articles du panier">
                      <TableHeader>
                        <TableColumn>Titre</TableColumn>
                        <TableColumn>Quantité</TableColumn>
                        <TableColumn>Prix unitaire</TableColumn>
                        <TableColumn>Total</TableColumn>
                      </TableHeader>
                      <TableBody>
                        {selectedCart.items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{item.title}</TableCell>
                            <TableCell>{item.qty}</TableCell>
                            <TableCell>
                              ${(item.unit_price_cents / 100).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              ${(
                                (item.unit_price_cents * item.qty) /
                                100
                              ).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <Divider />

                    {/* Totals */}
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-default-600">Sous-total</span>
                        <span className="font-semibold">
                          {formatMoney(
                            selectedCart.totals.subtotal_cents,
                            selectedCart.currency
                          )}
                        </span>
                      </div>
                      {selectedCart.totals.discount_cents > 0 && (
                        <div className="flex justify-between text-success">
                          <span className="text-default-600">Réduction</span>
                          <span className="font-semibold">
                            -{formatMoney(
                              selectedCart.totals.discount_cents,
                              selectedCart.currency
                            )}
                          </span>
                        </div>
                      )}
                      {selectedCart.totals.shipping_cents > 0 && (
                        <div className="flex justify-between">
                          <span className="text-default-600">Livraison</span>
                          <span className="font-semibold">
                            {formatMoney(
                              selectedCart.totals.shipping_cents,
                              selectedCart.currency
                            )}
                          </span>
                        </div>
                      )}
                      {selectedCart.totals.tax_cents > 0 && (
                        <div className="flex justify-between">
                          <span className="text-default-600">Taxes</span>
                          <span className="font-semibold">
                            {formatMoney(
                              selectedCart.totals.tax_cents,
                              selectedCart.currency
                            )}
                          </span>
                        </div>
                      )}
                      <Divider className="my-2" />
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total</span>
                        <span className="text-primary">
                          {formatMoney(
                            selectedCart.totals.total_cents,
                            selectedCart.currency
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="text-xs text-default-500 space-y-1">
                      <p>
                        Sauvegardé le:{" "}
                        {new Date(selectedCart.saved_at).toLocaleString()}
                      </p>
                      <p>
                        Expire le:{" "}
                        {new Date(selectedCart.expires_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </ModalBody>
              <Divider />
              <ModalFooter>
                <Button
                  color="danger"
                  variant="light"
                  onPress={onClose}
                >
                  Fermer
                </Button>
                {selectedCart && (
                  <Button
                    color="primary"
                    onPress={() => {
                      handleRestoreCart(selectedCart.id);
                      onClose();
                    }}
                  >
                    Restaurer le panier
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
