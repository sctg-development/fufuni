/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import React, { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle, Package, Plus, Trash2 } from "lucide-react";
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
import { Tooltip } from "@heroui/tooltip";
import { Chip } from "@heroui/chip";
import clsx from "clsx";

import { SearchIcon } from "@/components/icons";
import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { resolveTitle } from "@/utils/description";

// --- typings -------------------------------------------------------------
/**
 * Complete warehouse definition.
 */
interface Warehouse {
  id: string;
  display_name: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  priority: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Inventory levels for a specific warehouse.
 */
interface WarehouseInventory {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
}

/**
 * Represents a single inventory item (SKU) along with aggregated counts
 * and potential per-warehouse breakdown.
 */
interface InventoryItem {
  sku: string;
  product_title?: string;
  on_hand: number;
  reserved: number;
  available: number;
  warehouses?: WarehouseInventory[];
}

/**
 * Allowed reasons for adjusting stock levels. Used in the adjustment form.
 */
const ADJUST_REASONS = ["restock", "correction", "damaged", "return"] as const;

/**
 * Admin inventory overview page. Lists SKUs, allows searching, refreshing
 * and making warehouse-specific quantity adjustments.
 */
export default function InventoryPage() {
  const { t, i18n } = useTranslation();
  const { getJson, postJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // List state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState<string>("restock");

  // Load inventory
  /**
   * Retrieve the current inventory snapshot from the backend and update state.
   * Adds a cache‑busting query parameter to avoid stale results.
   * Also loads the complete list of all warehouses. Uses JWT token from useSecuredApi.
   */
  const loadData = async () => {
    setLoading(true);
    try {
      const [inventoryResponse, warehousesResponse] = await Promise.all([
        getJson(`${apiBase}/v1/inventory?cb=${Date.now()}`),
        getJson(`${apiBase}/v1/regions/warehouses?limit=500`),
      ]);

      setInventory(inventoryResponse.items || []);
      setAllWarehouses(warehousesResponse.items || []);
    } catch (err) {
      console.error("Failed to load inventory or warehouses", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered inventory
  const displayed = useMemo(() => {
    const term = globalFilter.trim().toLowerCase();

    if (term) {
      return inventory.filter(
        (item) =>
          item.sku.toLowerCase().includes(term) ||
          item.product_title?.toLowerCase().includes(term),
      );
    }

    return inventory;
  }, [inventory, globalFilter]);

  const adjustMutation = useMutation({
    mutationFn: ({
      sku,
      warehouseId,
      delta,
      reason,
    }: {
      sku: string;
      warehouseId: string;
      delta: number;
      reason: string;
    }) =>
      postJson(
        `${apiBase}/v1/inventory/${encodeURIComponent(sku)}/warehouse-adjust`,
        {
          warehouse_id: warehouseId,
          delta,
          reason,
        },
      ),
    onSuccess: (updated: InventoryItem) => {
      // Update state locally
      setInventory(
        inventory.map((item) => (item.sku === updated.sku ? updated : item)),
      );
      setSelectedItem(updated);
      setAdjustDelta("");
      setAdjustReason("restock");
      setSelectedWarehouse("");
    },
  });

  /**
   * Initialize a product in a new warehouse with a default quantity of 1.
   * Uses the adjust endpoint with delta=1 and reason='restock'.
   */
  const initializeWarehouseMutation = useMutation({
    mutationFn: ({ sku, warehouseId }: { sku: string; warehouseId: string }) =>
      postJson(
        `${apiBase}/v1/inventory/${encodeURIComponent(sku)}/warehouse-adjust`,
        {
          warehouse_id: warehouseId,
          delta: 1,
          reason: "restock",
        },
      ),
    onSuccess: (updated: InventoryItem) => {
      setInventory(
        inventory.map((item) => (item.sku === updated.sku ? updated : item)),
      );
      setSelectedItem(updated);
    },
  });

  /**
   * Remove a product from a warehouse (only when quantity is 0).
   * Sends a DELETE request to remove the warehouse_inventory record.
   */
  const deleteWarehouseMutation = useMutation({
    mutationFn: ({ sku, warehouseId }: { sku: string; warehouseId: string }) =>
      postJson(
        `${apiBase}/v1/inventory/${encodeURIComponent(sku)}/warehouse-delete`,
        { warehouse_id: warehouseId },
      ),
    onSuccess: (updated: InventoryItem) => {
      setInventory(
        inventory.map((item) => (item.sku === updated.sku ? updated : item)),
      );
      setSelectedItem(updated);
    },
  });

  /**
   * Check if a warehouse already has this product in inventory.
   *
   * @param warehouseId - warehouse ID to check
   * @returns true if product exists in warehouse
   */
  const hasProductInWarehouse = (warehouseId: string) =>
    selectedItem?.warehouses?.some((w) => w.warehouse_id === warehouseId) ??
    false;

  /**
   * Get the current quantity of a product in a specific warehouse.
   *
   * @param warehouseId - warehouse ID to check
   * @returns quantity or 0
   */
  const getWarehouseQuantity = (warehouseId: string) =>
    selectedItem?.warehouses?.find((w) => w.warehouse_id === warehouseId)
      ?.quantity ?? 0;

  /**
   * Trigger the inventory adjustment mutation using current form values.
   * Validates input and ensures an item and warehouse are selected.
   */
  const handleAdjust = async () => {
    if (!selectedItem || !selectedWarehouse) return;
    const delta = parseInt(adjustDelta, 10);

    if (isNaN(delta)) return;

    adjustMutation.mutate(
      {
        sku: selectedItem.sku,
        warehouseId: selectedWarehouse,
        delta,
        reason: adjustReason,
      },
      {
        onSuccess: () => {
          // Close modal after successful adjustment
          onOpenChange();
        },
      },
    );
  };

  /**
   * Form submit handler simply prevents default and delegates to handleAdjust.
   *
   * @param e - form event
   */
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleAdjust();
  };

  /**
   * Open the detail modal for a given inventory item, initializing form
   * fields to sensible defaults based on the first warehouse.
   *
   * @param item - inventory SKU to inspect
   */
  const handleOpenItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setSelectedWarehouse(item.warehouses?.[0]?.warehouse_id || "");
    setAdjustDelta("");
    setAdjustReason("restock");
    onOpen();
  };

  return (
    <DefaultLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">{t("admin-inventory-title")}</h1>
          <button
            className="p-2 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
            disabled={loading}
            onClick={loadData}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={20} />
          </button>
        </div>

        <Card className="mb-6">
          <CardBody>
            <Input
              isClearable
              className="w-full"
              placeholder={t("admin-common-search")}
              startContent={<SearchIcon className="w-4 h-4" />}
              value={globalFilter}
              onValueChange={setGlobalFilter}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Table isStriped>
              <TableHeader>
                <TableColumn key="sku">
                  {t("admin-inventory-col-sku")}
                </TableColumn>
                <TableColumn key="product">
                  {t("admin-inventory-col-product")}
                </TableColumn>
                <TableColumn key="on_hand">
                  {t("admin-inventory-col-on-hand")}
                </TableColumn>
                <TableColumn key="reserved">
                  {t("admin-inventory-col-reserved")}
                </TableColumn>
                <TableColumn key="available">
                  {t("admin-inventory-col-available")}
                </TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={<div>{t("admin-inventory-empty")}</div>}
                isLoading={loading}
                items={displayed}
                loadingContent={
                  <div>{t("admin-common-loading")}</div>
                }
              >
                {(item) => {
                  const isLow = item.available <= 5 && item.available > 0;
                  const isOut = item.available <= 0;

                  return (
                    <TableRow
                      key={item.sku}
                      className="cursor-pointer"
                      onClick={() => handleOpenItem(item)}
                    >
                      <TableCell>
                        <span className="font-mono text-sm">{item.sku}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {resolveTitle(item.product_title || "-", i18n.language)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {item.on_hand}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {item.reserved}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={clsx(
                            "font-mono text-sm",
                            isOut && "text-red-500",
                            isLow && "text-amber-500",
                          )}
                        >
                          {isLow && (
                            <AlertTriangle className="inline mr-1" size={12} />
                          )}
                          {item.available}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        {/* Detail modal */}
        <Modal isOpen={isOpen} size="md" onOpenChange={onOpenChange}>
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              {selectedItem?.sku || t("admin-inventory-title")}
            </ModalHeader>
            <ModalBody>
              {selectedItem && (
                <div className="space-y-5">
                  {/* Product info */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border">
                    <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-100 border">
                      <Package className="text-gray-600" size={18} />
                    </div>
                    <div>
                      <p className="font-mono text-sm font-medium">
                        {selectedItem.sku}
                      </p>
                      <p className="font-mono text-sm text-gray-600">
                        {selectedItem.product_title || "-"}
                      </p>
                    </div>
                  </div>

                  {/* Stock levels */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg text-center border">
                      <p className="text-2xl font-mono font-semibold">
                        {selectedItem.on_hand}
                      </p>
                      <p className="text-xs mt-1 text-gray-600">
                        {t("admin-inventory-col-on-hand")}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg text-center border">
                      <p className="text-2xl font-mono font-semibold">
                        {selectedItem.reserved}
                      </p>
                      <p className="text-xs mt-1 text-gray-600">
                        {t("admin-inventory-col-reserved")}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg text-center border">
                      <p
                        className={clsx(
                          "text-2xl font-mono font-semibold",
                          selectedItem.available <= 0 && "text-red-500",
                          selectedItem.available > 0 &&
                            selectedItem.available <= 5 &&
                            "text-amber-500",
                        )}
                      >
                        {selectedItem.available}
                      </p>
                      <p className="text-xs mt-1 text-gray-600">
                        {t("admin-inventory-col-available")}
                      </p>
                    </div>
                  </div>

                  {/* Adjust form */}
                  <form
                    className="space-y-4 pt-4 border-t"
                    onSubmit={handleFormSubmit}
                  >
                    {/* Warehouse distribution */}
                    <div className="space-y-3">
                      <p className="text-sm font-medium">
                        {t("admin-inventory-warehouses")}
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {allWarehouses.map((warehouse) => {
                          const exists = hasProductInWarehouse(warehouse.id);
                          const qty = getWarehouseQuantity(warehouse.id);
                          const isSelected = selectedWarehouse === warehouse.id;

                          return (
                            <div
                              key={warehouse.id}
                              className={clsx(
                                "flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors",
                                isSelected
                                  ? "bg-blue-50 border-blue-300"
                                  : "hover:bg-gray-50",
                              )}
                            >
                              {/* Warehouse info + status */}
                              <label className="flex items-center gap-3 flex-1 cursor-pointer">
                                <input
                                  checked={isSelected}
                                  className="w-4 h-4"
                                  name="warehouse"
                                  type="radio"
                                  value={warehouse.id}
                                  onChange={(e) =>
                                    setSelectedWarehouse(e.target.value)
                                  }
                                />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">
                                    {warehouse.display_name}
                                  </p>
                                  {exists && (
                                    <p className="text-xs text-gray-500">
                                      Qty: {qty}
                                    </p>
                                  )}
                                </div>

                                {/* Status badge */}
                                {!exists && (
                                  <Chip
                                    color="default"
                                    size="sm"
                                    variant="flat"
                                  >
                                    {t("admin-inventory-not-stocked")}
                                  </Chip>
                                )}
                                {exists && qty === 0 && (
                                  <Chip color="danger" size="sm" variant="flat">
                                    {t("admin-inventory-badge-empty")}
                                  </Chip>
                                )}
                                {exists && qty > 0 && qty <= 5 && (
                                  <Chip
                                    color="warning"
                                    size="sm"
                                    variant="flat"
                                  >
                                    {t("admin-inventory-low")}
                                  </Chip>
                                )}
                                {exists && qty > 5 && (
                                  <Chip
                                    color="success"
                                    size="sm"
                                    variant="flat"
                                  >
                                    {t("admin-inventory-in-stock")}
                                  </Chip>
                                )}
                              </label>

                              {/* Quick actions */}
                              <div className="flex items-center gap-1">
                                {!exists && (
                                  <Tooltip
                                    content={t(
                                      "admin-inventory-init-warehouse",
                                    )}
                                  >
                                    <Button
                                      isIconOnly
                                      color="success"
                                      isLoading={
                                        initializeWarehouseMutation.isPending
                                      }
                                      size="sm"
                                      variant="light"
                                      onPress={() => {
                                        if (selectedItem) {
                                          initializeWarehouseMutation.mutate({
                                            sku: selectedItem.sku,
                                            warehouseId: warehouse.id,
                                          });
                                        }
                                      }}
                                    >
                                      <Plus size={16} />
                                    </Button>
                                  </Tooltip>
                                )}

                                {exists && qty === 0 && (
                                  <Tooltip
                                    content={t(
                                      "admin-inventory-remove-warehouse",
                                    )}
                                  >
                                    <Button
                                      isIconOnly
                                      color="danger"
                                      isLoading={
                                        deleteWarehouseMutation.isPending
                                      }
                                      size="sm"
                                      variant="light"
                                      onPress={() => {
                                        if (selectedItem) {
                                          deleteWarehouseMutation.mutate({
                                            sku: selectedItem.sku,
                                            warehouseId: warehouse.id,
                                          });
                                        }
                                      }}
                                    >
                                      <Trash2 size={16} />
                                    </Button>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Adjustment form for selected warehouse */}
                    {selectedWarehouse &&
                      hasProductInWarehouse(selectedWarehouse) && (
                        <div className="space-y-3 pt-3 border-t">
                          <p className="text-xs font-medium text-gray-600">
                            {t("admin-inventory-adjust-section")}
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <Tooltip
                              content={t(
                                "admin-inventory-field-quantity",
                                "Enter quantity to add or remove",
                              )}
                            >
                              <Input
                                required
                                label={t("admin-inventory-field-quantity")}
                                placeholder="e.g. 50 or -10"
                                type="number"
                                value={adjustDelta}
                                onValueChange={setAdjustDelta}
                              />
                            </Tooltip>
                            <Tooltip
                              content={t(
                                "admin-inventory-field-reason",
                                "Reason for adjustment",
                              )}
                            >
                              <Select
                                label={t("admin-inventory-field-reason")}
                                selectedKeys={[adjustReason]}
                                onSelectionChange={(key) =>
                                  setAdjustReason(Array.from(key).join(""))
                                }
                              >
                                {ADJUST_REASONS.map((r) => (
                                  <SelectItem key={r}>
                                    {r.charAt(0).toUpperCase() + r.slice(1)}
                                  </SelectItem>
                                ))}
                              </Select>
                            </Tooltip>
                          </div>

                          {/* Quick actions */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">
                              {t("admin-inventory-quick-label")}
                            </span>
                            {[10, 25, 50, 100].map((n) => (
                              <button
                                key={n}
                                className="px-2 py-1 text-xs font-mono rounded-lg border hover:bg-gray-100 transition-colors"
                                type="button"
                                onClick={() => setAdjustDelta(String(n))}
                              >
                                +{n}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                  </form>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                variant="light"
                onPress={() => onOpenChange()}
              >
                {t("admin-common-cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={
                  adjustMutation.isPending ||
                  !adjustDelta ||
                  !selectedWarehouse ||
                  !hasProductInWarehouse(selectedWarehouse)
                }
                onPress={handleAdjust}
              >
                {adjustMutation.isPending
                  ? t("admin-inventory-adjusting")
                  : t("admin-inventory-btn-apply")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
