/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 *
 * Multi-currency pricing management component for product variants.
 * Allows admin to set and manage prices for variants across different currencies.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Card, CardBody } from "@heroui/card";
import { Trash2, Plus, Pencil, Save } from "lucide-react";

import { useSecuredApi } from "@/authentication";
import { formatMoney } from "@/utils/currency";

interface VariantPrice {
  id: string;
  currency_id: string;
  currency_code: string;
  currency_symbol: string;
  price_cents: number;
}

interface Currency {
  id: string;
  code: string;
  display_name: string;
  symbol: string;
  decimal_places: number;
  status: "active" | "inactive";
}

interface Props {
  productId: string;
  variantId: string;
  variantTitle: string;
  basePriceCents: number; // Fallback price in USD/base currency
  currency?: string; // Base currency code (e.g., "USD")
}

/**
 * Component for managing multi-currency pricing of a product variant.
 * Displays existing prices and allows creation/deletion per currency.
 */
export function VariantPrices({
  productId,
  variantId,
  variantTitle,
  basePriceCents,
  currency = "USD",
}: Props) {
  const { t } = useTranslation();
  const { getJson, postJson, deleteJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // State
  const [prices, setPrices] = useState<VariantPrice[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Modal state for adding price
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");
  const [priceInput, setPriceInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Inline edit state: only one currency can be edited at a time.
  const [editingCurrencyId, setEditingCurrencyId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  // Load initial data
  useEffect(() => {
    loadData();
  }, [variantId]);

  /**
   * Fetch current variant prices and available currencies from API.
   */
  const loadData = async () => {
    try {
      const [pricesRes, currenciesRes] = await Promise.all([
        getJson(
          `${apiBase}/v1/products/${productId}/variants/${variantId}/prices`
        ),
        getJson(`${apiBase}/v1/regions/currencies?limit=100&status=active`),
      ]);

      setPrices(pricesRes.items || []);
      setCurrencies(currenciesRes.items || []);
    } catch (err) {
      console.error("Failed to load variant pricing data", err);
    }
  };

  /**
   * Check if a currency is already configured for this variant.
   */
  const isCurrencyAlreadySet = (currencyId: string) =>
    prices.some((p) => p.currency_id === currencyId);

  /**
   * Get list of currencies not yet configured for this variant.
   */
  const availableCurrencies = currencies.filter(
    (c) => !isCurrencyAlreadySet(c.id)
  );

  /**
   * Add a new price for the variant in a selected currency.
   */
  const handleAddPrice = async () => {
    if (!selectedCurrency || !priceInput) return;

    setSubmitting(true);
    try {
      const priceCents = Math.round(parseFloat(priceInput) * 100);
      const response = await postJson(
        `${apiBase}/v1/products/${productId}/variants/${variantId}/prices`,
        {
          currency_id: selectedCurrency,
          price_cents: priceCents,
        }
      );

      if (response) {
        setPrices([...prices, response]);
      }

      onOpenChange();
      setSelectedCurrency("");
      setPriceInput("");
    } catch (err) {
      console.error("Failed to add price", err);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Edit/save a price inline.
   * This uses the same POST endpoint as add price (which is an upsert on the backend).
   */
  const handleSaveEdit = async (currencyId: string) => {
    const parsed = parseFloat(editValue);
    if (!editValue || isNaN(parsed) || parsed < 0) {
      // Invalid or empty value: exit edit mode without applying changes.
      setEditingCurrencyId(null);
      setEditValue("");
      return;
    }

    const priceCents = Math.round(parsed * 100);

    try {
      const response = await postJson(
        `${apiBase}/v1/products/${productId}/variants/${variantId}/prices`,
        { currency_id: currencyId, price_cents: priceCents }
      );

      if (response) {
        setPrices(
          prices.map((p) =>
            p.currency_id === currencyId ? { ...p, price_cents: priceCents } : p
          )
        );
      }
    } catch (err) {
      console.error("Failed to update price", err);
    } finally {
      setEditingCurrencyId(null);
      setEditValue("");
    }
  };

  /**
   * Delete a price for the variant in a specific currency.
   */
  const handleDeletePrice = async (currencyId: string) => {
    if (!confirm(t("admin-variant-prices-confirm-delete", "Delete this price?"))) {
      return;
    }

    try {
      await deleteJson(
        `${apiBase}/v1/products/${productId}/variants/${variantId}/prices/${currencyId}`
      );

      setPrices(prices.filter((p) => p.currency_id !== currencyId));
    } catch (err) {
      console.error("Failed to delete price", err);
    }
  };

  const handleOpenModal = () => {
    setSelectedCurrency("");
    setPriceInput("");
    onOpen();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">
            {t("admin-variant-prices-title", "Multi-Currency Prices")}
          </h3>
          <p className="text-xs text-default-500">
            {t("admin-variant-prices-subtitle", "Manage prices for")} {variantTitle}
          </p>
        </div>
        <Button
          isDisabled={availableCurrencies.length === 0}
          size="sm"
          color="primary"
          startContent={<Plus className="w-4 h-4" />}
          onPress={handleOpenModal}
        >
          {t("admin-variant-prices-add", "Add Price")}
        </Button>
      </div>

      {/* Base currency fallback */}
      <Card>
        <CardBody className="text-sm">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-mono text-xs text-default-500">
                {t("admin-variant-prices-base", "Base Price")} ({currency})
              </p>
              <p className="font-semibold">{variantTitle}</p>
            </div>
            <p className="font-mono font-bold text-sm">
              {formatMoney(basePriceCents, currency)}
            </p>
          </div>
          <p className="text-xs text-default-400 mt-2">
            {t(
              "admin-variant-prices-base-note",
              "Used as fallback if no price exists for the customer's currency"
            )}
          </p>
        </CardBody>
      </Card>

      {/* Inline edit bar (shows when a currency is being edited) */}
      {editingCurrencyId && (
        <Card>
          <CardBody className="text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-sm">
                  {t("admin-variant-prices-editing", "Editing price for")}{" "}
                  {prices.find((p) => p.currency_id === editingCurrencyId)
                    ?.currency_code || editingCurrencyId}
                </p>
                <p className="text-xs text-default-500">
                  {t(
                    "admin-variant-prices-editing-note",
                    "Enter a new amount and save. Cancelling will discard changes."
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  size="sm"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-28"
                  value={editValue}
                  onValueChange={setEditValue}
                />
                <Button
                  color="success"
                  size="sm"
                  onPress={() => handleSaveEdit(editingCurrencyId)}
                >
                  {t("admin-common-save", "Save")}
                </Button>
                <Button
                  color="default"
                  size="sm"
                  onPress={() => {
                    setEditingCurrencyId(null);
                    setEditValue("");
                  }}
                >
                  {t("admin-common-cancel", "Cancel")}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Prices table */}
      {prices.length === 0 ? (
        <Card>
          <CardBody className="text-center text-sm text-default-500 py-6">
            {t(
              "admin-variant-prices-empty",
              "No prices configured. Add a price to get started."
            )}
          </CardBody>
        </Card>
      ) : (
        <Table isStriped>
          <TableHeader>
            <TableColumn>
              {t("admin-variant-prices-currency", "Currency")}
            </TableColumn>
            <TableColumn align="end">
              {t("admin-variant-prices-price", "Price")}
            </TableColumn>
            <TableColumn align="end" width={60}>
              {t("admin-common-actions", "Actions")}
            </TableColumn>
          </TableHeader>
          <TableBody items={prices} emptyContent="No prices">
            {(price) => {
              const isEditing = editingCurrencyId === price.currency_id;

              return (
                <TableRow key={price.currency_id}>
                  <TableCell>
                    <div>
                      <p className="font-mono font-semibold text-sm">
                        {price.currency_code}
                      </p>
                      <p className="text-xs text-default-500">
                        {price.currency_symbol}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell align="right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          size="sm"
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-28"
                          value={editValue}
                          onValueChange={setEditValue}
                          autoFocus
                          aria-label={`Edit price for ${price.currency_code}`}
                        />
                        <span className="text-xs text-default-400 font-mono">
                          {price.currency_code}
                        </span>
                      </div>
                    ) : (
                      <p className="font-mono font-semibold text-sm">
                        {formatMoney(price.price_cents, price.currency_code)}
                      </p>
                    )}
                  </TableCell>

                  <TableCell align="right">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <Button
                          isIconOnly
                          size="sm"
                          color="success"
                          variant="light"
                          aria-label="Save price"
                          onPress={() => handleSaveEdit(price.currency_id)}
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          isIconOnly
                          size="sm"
                          color="primary"
                          variant="light"
                          aria-label="Edit price"
                          onPress={() => {
                            console.log("VariantPrices: start editing", price.currency_id);
                            setEditingCurrencyId(price.currency_id);
                            setEditValue((price.price_cents / 100).toFixed(2));
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}

                      <Button
                        isIconOnly
                        size="sm"
                        color="danger"
                        variant="light"
                        aria-label="Delete price"
                        isDisabled={isEditing}
                        onPress={() => handleDeletePrice(price.currency_id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
      )}

      {/* Add price modal */}
      <Modal isOpen={isOpen} size="md" onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>
            {t("admin-variant-prices-add-title", "Add Price for Variant")}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <p className="text-sm text-default-600">{variantTitle}</p>

              <Select
                label={t("admin-variant-prices-select-currency", "Select Currency")}
                placeholder={t("admin-common-select", "Choose...")}
                selectedKeys={selectedCurrency ? [selectedCurrency] : []}
                onSelectionChange={(key) =>
                  setSelectedCurrency(Array.from(key).join(""))
                }
              >
                {availableCurrencies.map((curr) => (
                <SelectItem key={curr.id}>
                    {curr.code} - {curr.display_name} ({curr.symbol})
                  </SelectItem>
                ))}
              </Select>

              <Input
                label={t("admin-variant-prices-enter-price", "Price")}
                placeholder="29.99"
                type="number"
                step="0.01"
                min="0"
                value={priceInput}
                onValueChange={setPriceInput}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              color="default"
              variant="light"
              onPress={() => onOpenChange()}
            >
              {t("admin-common-cancel", "Cancel")}
            </Button>
            <Button
              color="primary"
              isDisabled={!selectedCurrency || !priceInput || submitting}
              isLoading={submitting}
              onPress={handleAddPrice}
            >
              {t("admin-common-add", "Add")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
