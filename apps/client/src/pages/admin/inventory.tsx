import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Package,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSecuredApi } from "@/authentication";
import DefaultLayout from "@/layouts/default";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { Card, CardBody } from "@heroui/card";
import { Tooltip } from "@heroui/tooltip";
import { SearchIcon } from "@/components/icons";
import clsx from "clsx";

// --- typings -------------------------------------------------------------
interface WarehouseInventory {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
}

interface InventoryItem {
  sku: string;
  product_title?: string;
  on_hand: number;
  reserved: number;
  available: number;
  warehouses?: WarehouseInventory[];
}

const ADJUST_REASONS = ["restock", "correction", "damaged", "return"] as const;

export default function InventoryPage() {
  const { t } = useTranslation();
  const { getJson, postJson } = useSecuredApi();

  const apiBase =
    (import.meta as any).env?.API_BASE_URL ? (import.meta as any).env.API_BASE_URL : "";

  // List state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState<string>("restock");

  // Load inventory
  const loadData = async () => {
    setLoading(true);
    try {
      const response = await getJson(`${apiBase}/v1/inventory?cb=${Date.now()}`);
      setInventory(response.items || []);
    } catch (err) {
      console.error("Failed to load inventory", err);
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
      return inventory.filter(item =>
        item.sku.toLowerCase().includes(term) ||
        item.product_title?.toLowerCase().includes(term)
      );
    }
    return inventory;
  }, [inventory, globalFilter]);

  const adjustMutation = useMutation({
    mutationFn: ({ sku, warehouseId, delta, reason }: { sku: string; warehouseId: string; delta: number; reason: string }) =>
      postJson(`${apiBase}/v1/inventory/${encodeURIComponent(sku)}/warehouse-adjust`, { 
        warehouse_id: warehouseId,
        delta, 
        reason 
      }),
    onSuccess: (updated: InventoryItem) => {
      // Update state locally
      setInventory(inventory.map(item => item.sku === updated.sku ? updated : item));
      setSelectedItem(updated);
      setAdjustDelta("");
      setAdjustReason("restock");
      setSelectedWarehouse("");
    },
  });

  const handleAdjust = async () => {
    if (!selectedItem || !selectedWarehouse) return;
    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta)) return;
    
    adjustMutation.mutate(
      { sku: selectedItem.sku, warehouseId: selectedWarehouse, delta, reason: adjustReason },
      {
        onSuccess: () => {
          // Close modal after successful adjustment
          onOpenChange();
        },
      }
    );
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleAdjust();
  };

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
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <Card className="mb-6">
          <CardBody>
            <Input
              isClearable
              className="w-full"
              placeholder={t("admin-common-search", "Search...")}
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
                <TableColumn key="sku">{t("admin-inventory-col-sku")}</TableColumn>
                <TableColumn key="product">{t("admin-inventory-col-product")}</TableColumn>
                <TableColumn key="on_hand">{t("admin-inventory-col-on-hand")}</TableColumn>
                <TableColumn key="reserved">{t("admin-inventory-col-reserved")}</TableColumn>
                <TableColumn key="available">{t("admin-inventory-col-available")}</TableColumn>
              </TableHeader>
              <TableBody
                items={displayed}
                isLoading={loading}
                loadingContent={<div>{t("admin-common-loading", "Loading...")}</div>}
                emptyContent={<div>{t("admin-inventory-empty")}</div>}
              >
                {(item) => {
                  const isLow = item.available <= 5 && item.available > 0;
                  const isOut = item.available <= 0;
                  return (
                    <TableRow
                      key={item.sku}
                      onClick={() => handleOpenItem(item)}
                      className="cursor-pointer"
                    >
                      <TableCell>
                        <span className="font-mono text-sm">{item.sku}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{item.product_title || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{item.on_hand}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{item.reserved}</span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={clsx(
                            "font-mono text-sm",
                            isOut && "text-red-500",
                            isLow && "text-amber-500"
                          )}
                        >
                          {isLow && <AlertTriangle size={12} className="inline mr-1" />}
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
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="md">
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
                      <Package size={18} className="text-gray-600" />
                    </div>
                    <div>
                      <p className="font-mono text-sm font-medium">{selectedItem.sku}</p>
                      <p className="font-mono text-sm text-gray-600">
                        {selectedItem.product_title || "-"}
                      </p>
                    </div>
                  </div>

                  {/* Stock levels */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg text-center border">
                      <p className="text-2xl font-mono font-semibold">{selectedItem.on_hand}</p>
                      <p className="text-xs mt-1 text-gray-600">
                        {t("admin-inventory-col-on-hand")}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg text-center border">
                      <p className="text-2xl font-mono font-semibold">{selectedItem.reserved}</p>
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
                            "text-amber-500"
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
                    onSubmit={handleFormSubmit}
                    className="space-y-4 pt-4 border-t"
                  >
                    {/* Warehouse selection */}
                    {selectedItem.warehouses && selectedItem.warehouses.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium">
                          {t("admin-inventory-warehouses", "Warehouse Details")}
                        </p>
                        <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                          {selectedItem.warehouses.map((w) => (
                            <label
                              key={w.warehouse_id}
                              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name="warehouse"
                                value={w.warehouse_id}
                                checked={selectedWarehouse === w.warehouse_id}
                                onChange={(e) => setSelectedWarehouse(e.target.value)}
                                className="w-4 h-4"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium">{w.warehouse_name}</p>
                                <p className="text-xs text-gray-500">
                                  Qty: {w.quantity}
                                </p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        {t("admin-inventory-no-warehouses", "No warehouse data available")}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <Tooltip content={t("admin-inventory-field-quantity", "Enter quantity to add or remove")}>
                        <Input
                          type="number"
                          label={t("admin-inventory-field-quantity")}
                          placeholder="e.g. 50 or -10"
                          value={adjustDelta}
                          onValueChange={setAdjustDelta}
                          required
                        />
                      </Tooltip>
                      <Tooltip content={t("admin-inventory-field-reason", "Reason for adjustment")}>
                        <Select
                          label={t("admin-inventory-field-reason")}
                          selectedKeys={[adjustReason]}
                          onSelectionChange={(key) =>
                            setAdjustReason(Array.from(key).join(""))
                          }
                        >
                          {ADJUST_REASONS.map((r) => (
                            <SelectItem key={r} value={r}>
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
                          type="button"
                          onClick={() => setAdjustDelta(String(n))}
                          className="px-2 py-1 text-xs font-mono rounded-lg border hover:bg-gray-100 transition-colors"
                        >
                          +{n}
                        </button>
                      ))}
                    </div>
                  </form>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="light" onPress={() => onOpenChange()}>
                {t("admin-common-cancel", "Cancel")}
              </Button>
              <Button
                color="primary"
                onPress={handleAdjust}
                isDisabled={adjustMutation.isPending || !adjustDelta || !selectedWarehouse}
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
