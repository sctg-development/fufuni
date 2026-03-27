/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";
import { Input } from "@heroui/react";
import { Select, Label, ListBox } from "@heroui/react";
import { Table } from "@heroui/react";
import {
  Modal,
} from "@heroui/react";
import { Card} from "@heroui/react";
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
  currency = "",
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
  const [isAddPriceModalOpen, setIsAddPriceModalOpen] = useState(false);
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

      setIsAddPriceModalOpen(false);
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
    if (!confirm(t("admin-variant-prices-confirm-delete"))) {
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
    setIsAddPriceModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">
            {t("admin-variant-prices-title")}
          </h3>
          <p className="text-xs text-default-500">
            {t("admin-variant-prices-subtitle")} {variantTitle}
          </p>
        </div>
        <Button
          isDisabled={availableCurrencies.length === 0}
          onPress={handleOpenModal}
        >
          <Plus className="w-4 h-4" />
          {t("admin-variant-prices-add")}
        </Button>
      </div>

      {/* Base currency fallback */}
      <Card>
        <Card.Content className="text-sm">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-mono text-xs text-default-500">
                {t("admin-variant-prices-base")} ({currency})
              </p>
              <p className="font-semibold">{variantTitle}</p>
            </div>
            <p className="font-mono font-bold text-sm">
              {formatMoney(basePriceCents, currency)}
            </p>
          </div>
          <p className="text-xs text-default-400 mt-2">
            {t("admin-variant-prices-base-note")}
          </p>
        </Card.Content>
      </Card>

      {/* Inline edit bar (shows when a currency is being edited) */}
      {editingCurrencyId && (
        <Card>
          <Card.Content className="text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-sm">
                  {t("admin-variant-prices-editing")}{" "}
                  {prices.find((p) => p.currency_id === editingCurrencyId)
                    ?.currency_code || editingCurrencyId}
                </p>
                <p className="text-xs text-default-500">
                  {t("admin-variant-prices-editing-note")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-28"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
                <Button
                  size="sm"
                  onPress={() => handleSaveEdit(editingCurrencyId)}
                >
                  {t("admin-common-save")}
                </Button>
                <Button
                  size="sm"
                  onPress={() => {
                    setEditingCurrencyId(null);
                    setEditValue("");
                  }}
                >
                  {t("admin-common-cancel")}
                </Button>
              </div>
            </div>
          </Card.Content>
        </Card>
      )}

      {/* Prices table */}
      {prices.length === 0 ? (
        <Card>
          <Card.Content className="text-center text-sm text-default-500 py-6">
            {t("admin-variant-prices-empty")}
          </Card.Content>
        </Card>
      ) : (
        <Table>
          <Table.Content>
            <Table.Header>
              <Table.Column isRowHeader>
                {t("admin-variant-prices-currency")}
              </Table.Column>
              <Table.Column>
                {t("admin-variant-prices-price")}
              </Table.Column>
              <Table.Column>
                {t("admin-common-actions")}
              </Table.Column>
            </Table.Header>
            <Table.Body items={prices} renderEmptyState={() => "No prices"}>
            {(price) => {
              const isEditing = editingCurrencyId === price.currency_id;

              return (
                <Table.Row key={price.currency_id} className="odd:bg-default-50">
                  <Table.Cell>
                    <div>
                      <p className="font-mono font-semibold text-sm">
                        {price.currency_code}
                      </p>
                      <p className="text-xs text-default-500">
                        {price.currency_symbol}
                      </p>
                    </div>
                  </Table.Cell>

                  <Table.Cell>
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-28"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
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
                  </Table.Cell>

                  <Table.Cell>
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="tertiary"
                          aria-label="Save price"
                          onPress={() => handleSaveEdit(price.currency_id)}
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="tertiary"
                          aria-label="Edit price"
                          onPress={() => {
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
                        variant="tertiary"
                        aria-label="Delete price"
                        isDisabled={isEditing}
                        onPress={() => handleDeletePrice(price.currency_id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              );
            }}
          </Table.Body>
          </Table.Content>
        </Table>
      )}

      {/* Add price modal */}
      <Modal
        isOpen={isAddPriceModalOpen}
        onOpenChange={setIsAddPriceModalOpen}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.CloseTrigger onPress={close} />
                  <Modal.Header>
                    {t("admin-variant-prices-add-title")}
                  </Modal.Header>
                  <Modal.Body>
                    <div className="space-y-4">
                      <p className="text-sm text-default-600">{variantTitle}</p>

                      <Select
                        placeholder={t("admin-common-select")}
                        value={selectedCurrency || ""}
                        onChange={(value) => setSelectedCurrency((value as string) || "")}
                      >
                        <Label>{t("admin-variant-prices-select-currency")}</Label>
                        <Select.Trigger>
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {availableCurrencies.map((curr) => (
                              <ListBox.Item key={curr.id} id={curr.id} textValue={curr.code}>
                                {curr.code} - {curr.display_name} ({curr.symbol})
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>

                      <div>
                        <label className="text-sm font-medium">
                          {t("admin-variant-prices-enter-price")}
                        </label>
                        <Input
                          placeholder="29.99"
                          type="number"
                          step="0.01"
                          min="0"
                          value={priceInput}
                          onChange={(e) => setPriceInput(e.target.value)}
                        />
                      </div>
                    </div>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="tertiary"
                      onPress={close}
                    >
                      {t("admin-common-cancel")}
                    </Button>
                    <Button
                      isDisabled={!selectedCurrency || !priceInput || submitting}
                      isPending={submitting}
                      onPress={handleAddPrice}
                    >
                      {t("admin-common-add")}
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
