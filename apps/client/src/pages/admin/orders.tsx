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

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from "@tanstack/react-table";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  RefreshCw,
  Truck,
  ExternalLink,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Modal, Card, Separator, Label, Button, Chip } from "@heroui/react";

import { formatMoney } from "@/utils/currency";
import { useSecuredApi } from "@/authentication";
import DefaultLayout from "@/layouts/default";

// --- typings -------------------------------------------------------------
/**
 * Represents an order record retrieved from the backend API.
 */
interface Order {
  id: string;
  number?: string;
  shipping?: { name?: string; phone?: string; address: any };
  customer_email: string;
  status: string;
  amounts: {
    total_cents: number;
    subtotal_cents?: number;
    tax_cents?: number;
    shipping_cents?: number;
    currency?: string;
  };
  created_at: string;
  items: Array<{
    title: string;
    sku: string;
    qty: number;
    unit_price_cents: number;
  }>;
  currency?: string;
  stripe?: { payment_intent_id?: string };
  tracking?: { number?: string; url?: string };
}

const columnHelper = createColumnHelper<Order>();
/**
 * Allowed status values that orders may have. Used in the status filter
 * dropdown and update form.
 */
const ORDER_STATUSES = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "refunded",
  "canceled",
] as const;

/**
 * Orders administration page. Supports searching, filtering, sorting, and
 * updating order statuses (including refunds and tracking information).
 */
export default function OrdersPage() {
  const { t } = useTranslation();
  const { getJson, patchJson, postJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // trigger new fetch by bumping this counter; used in query key and url cache-bust
  const [refreshIndex, setRefreshIndex] = useState(0);

  /**
   * React Query hook to fetch the list of orders whenever the status filter
   * or refreshIndex changes. The `cb` parameter busts cache.
   */
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["orders", statusFilter, refreshIndex],
    queryFn: () =>
      getJson(
        `${apiBase}/v1/orders?limit=100${statusFilter ? `&status=${statusFilter}` : ""}&cb=${Date.now()}`,
      ),
  });

  const orders: Order[] = data?.items || [];

  /**
   * Mutation used to update an order record (status, tracking, etc.). On
   * success it refreshes the list and optionally updates the detail pane.
   */
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      patchJson(`${apiBase}/v1/orders/${id}`, data),
    onSuccess: (updated: Order) => {
      console.log("order status updated", updated);
      setRefreshIndex((i) => i + 1);
      setSelectedOrder(updated);
    },
    onError: (err) => {
      console.error("failed to update order", err);
    },
  });

  /**
   * Mutation that triggers a refund for a given order ID. On success the
   * order list is refreshed and any selection cleared.
   */
  const refundMutation = useMutation({
    mutationFn: (id: string) =>
      postJson(`${apiBase}/v1/orders/${id}/refund`, {}),
    onSuccess: () => {
      setRefreshIndex((i) => i + 1);
      setSelectedOrder(null);
    },
  });

  const resendConfirmationMutation = useMutation({
    mutationFn: (id: string) =>
      postJson(`${apiBase}/v1/orders/${id}/resend-confirmation`, {}),
    onSuccess: () => {
      window.alert(t("admin-orders-resend-success"));
    },
    onError: () => {
      window.alert(t("admin-orders-resend-error"));
    },
  });

  const regenerateLinkMutation = useMutation({
    mutationFn: (id: string) =>
      postJson(`${apiBase}/v1/orders/${id}/regenerate-tracking-link`, {}),
    onSuccess: () => {
      window.alert(t("admin-orders-regenerate-success"));
    },
    onError: () => {
      window.alert(t("admin-orders-regenerate-error"));
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("number", {
        header: t("admin-orders-col-order"),
        cell: (info) => (
          <span className="font-mono text-sm">
            {info.getValue() || info.row.original.id.slice(0, 8)}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.shipping?.name || "", {
        id: "name",
        header: t("admin-orders-col-name"),
        cell: (info) => (
          <span className="font-mono text-sm">{info.getValue() || "-"}</span>
        ),
      }),
      columnHelper.accessor("customer_email", {
        header: t("admin-orders-col-email"),
        cell: (info) => (
          <span className="font-mono text-sm">{info.getValue() || "-"}</span>
        ),
      }),
      columnHelper.accessor("status", {
        header: t("admin-orders-col-status"),
        cell: (info) => (
          <span className="font-mono text-sm">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor((row) => row.amounts.total_cents, {
        id: "total",
        header: t("admin-orders-col-total"),
        cell: (info) => {
          const order = info.row.original;
          const currency = order.amounts.currency || order.currency || "USD";

          return (
            <span className="font-mono text-sm">
              {formatMoney(info.getValue(), currency)}
            </span>
          );
        },
      }),
      columnHelper.accessor("created_at", {
        header: t("admin-orders-col-date"),
        cell: (info) => (
          <span className="font-mono text-sm">
            {new Date(info.getValue()).toLocaleDateString()}
          </span>
        ),
      }),
    ],
    [t],
  );

  const table = useReactTable({
    data: orders,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  /**
   * Format a cents amount as a dollar string with two decimals.
   *
   * @param cents - amount in cents
   * @returns formatted string, e.g. "$12.34"
   */
  const formatCurrency = (cents: number, currency: string) =>
    formatMoney(cents, currency);

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 h-9">
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--text)" }}
          >
            {t("admin-orders-title")}
          </h1>
          <button
            className="p-2 rounded hover:bg-(--bg-hover) transition-colors disabled:opacity-50"
            disabled={isFetching}
            style={{ color: "var(--text-muted)" }}
            onClick={() => setRefreshIndex((i) => i + 1)}
          >
            <RefreshCw className={isFetching ? "animate-spin" : ""} size={16} />
          </button>
        </div>

        {/* Table card */}
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Filters */}
          <div
            className="flex items-center border-b"
            style={{ borderColor: "var(--border)" }}
          >
            {/* Search */}
            <div
              className="flex-1 flex items-center gap-2 px-4 py-3"
              style={{ color: "var(--text-muted)" }}
            >
              <Search className="shrink-0" size={16} />
              <input
                className="bg-transparent border-0 font-mono text-sm w-full focus:outline-none"
                placeholder={t("search") + "..."}
                style={{ color: "var(--text)" }}
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </div>

            {/* Status filter */}
            <select
              className="h-full px-4 py-3 font-mono text-sm bg-transparent border-0 border-l focus:outline-none cursor-pointer"
              style={{
                borderColor: "var(--border)",
                color: statusFilter ? "var(--text)" : "var(--text-muted)",
              }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">{t("all")}</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2
                className="animate-spin"
                size={20}
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          ) : orders.length === 0 ? (
            <div
              className="py-12 text-center text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              {t("admin-orders-empty")}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={clsx(
                          "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide",
                          header.column.getCanSort() &&
                            "cursor-pointer select-none hover:bg-(--bg-hover)",
                        )}
                        style={{ color: "var(--text-muted)" }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getCanSort() && (
                            <span className="ml-1">
                              {header.column.getIsSorted() === "asc" ? (
                                <ChevronUp size={14} />
                              ) : header.column.getIsSorted() === "desc" ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronsUpDown
                                  className="opacity-30"
                                  size={14}
                                />
                              )}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-(--bg-hover)"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    onClick={() => setSelectedOrder(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Order Detail Modal */}
        <Modal
          isOpen={!!selectedOrder}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedOrder(null);
            }
          }}
        >
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog>
                {({ close }) => (
                  <>
                    <Modal.CloseTrigger onPress={close} />
                    <Modal.Header>
                      {selectedOrder
                        ? `${t("admin-orders-order-prefix")} ${
                            selectedOrder.number || selectedOrder.id.slice(0, 8)
                          }`
                        : t("admin-orders-title")}
                    </Modal.Header>
                    <Modal.Body>
                      {selectedOrder && (
                        <div className="space-y-5">
                          {/* Status Badge */}
                          <Chip size="sm" color="accent" variant="primary">
                            <span className="text-sm capitalize">{selectedOrder.status}</span>
                          </Chip>

                          {/* Two column layout */}
                          <div className="grid grid-cols-2 gap-5">
                            {/* Left column */}
                            <div className="space-y-4">
                              {/* Customer */}
                              <Card>
                                <Card.Content className="gap-3">
                                  <h4 className="text-sm font-semibold">{t("admin-orders-customer")}</h4>
                                  {selectedOrder.shipping?.name && (
                                    <p className="font-mono text-sm font-medium">
                                      {selectedOrder.shipping.name}
                                    </p>
                                  )}
                                  <p className="font-mono text-sm text-default-500">
                                    {selectedOrder.customer_email}
                                  </p>
                                  {selectedOrder.shipping?.phone && (
                                    <p className="font-mono text-sm text-default-500">
                                      {selectedOrder.shipping.phone}
                                    </p>
                                  )}
                                </Card.Content>
                              </Card>

                              {/* Shipping Address */}
                              {selectedOrder.shipping?.address && (
                                <Card>
                                  <Card.Content className="gap-3">
                                    <h4 className="text-sm font-semibold">{t("admin-orders-ship-to")}</h4>
                                    <div className="font-mono text-sm space-y-1">
                                      {selectedOrder.shipping.name && (
                                        <p className="font-medium">
                                          {selectedOrder.shipping.name}
                                        </p>
                                      )}
                                      {selectedOrder.shipping.address.line1 && (
                                        <p>{selectedOrder.shipping.address.line1}</p>
                                      )}
                                      {selectedOrder.shipping.address.line2 && (
                                        <p>{selectedOrder.shipping.address.line2}</p>
                                      )}
                                      <p>
                                        {[
                                          selectedOrder.shipping.address.city,
                                          selectedOrder.shipping.address.state,
                                          selectedOrder.shipping.address.postal_code,
                                        ]
                                          .filter(Boolean)
                                          .join(", ")}
                                      </p>
                                      {selectedOrder.shipping.address.country && (
                                        <p>{selectedOrder.shipping.address.country}</p>
                                      )}
                                    </div>
                                  </Card.Content>
                                </Card>
                              )}

                              {/* Stripe Info */}
                              {selectedOrder.stripe?.payment_intent_id && (
                                <Card>
                                  <Card.Content className="gap-2">
                                    <h4 className="text-sm font-semibold">{t("admin-orders-stripe")}</h4>
                                    <p className="text-xs font-mono break-all text-default-500">
                                      {t("admin-orders-stripe-prefix")}{" "}
                                      {selectedOrder.stripe.payment_intent_id}
                                    </p>
                                  </Card.Content>
                                </Card>
                              )}
                            </div>

                            {/* Right column */}
                            <div className="space-y-4">
                              {/* Items */}
                              <Card>
                                <Card.Content className="gap-3">
                                  <h4 className="text-sm font-semibold">{t("admin-orders-items")}</h4>
                                  <div className="space-y-2">
                                    {selectedOrder.items.map((item, i) => (
                                      <div
                                        key={i}
                                        className="flex items-center justify-between text-sm pb-2 border-b last:pb-0 last:border-0"
                                      >
                                        <div>
                                          <p className="font-mono">{item.title}</p>
                                          <p className="text-xs font-mono text-default-500">
                                            {item.sku} × {item.qty}
                                          </p>
                                        </div>
                                        <p className="font-mono">
                                          {formatCurrency(
                                            item.unit_price_cents * item.qty,
                                            selectedOrder.amounts.currency ||
                                              selectedOrder.currency ||
                                              "USD",
                                          )}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </Card.Content>
                              </Card>

                              {/* Summary */}
                              <Card>
                                <Card.Content className="gap-1">
                                  <div className="space-y-1 text-sm font-mono">
                                    <div className="flex justify-between">
                                      <span className="text-default-500">
                                        {t("admin-orders-subtotal")}
                                      </span>
                                      <span>
                                        {formatCurrency(
                                          selectedOrder.amounts.subtotal_cents || 0,
                                          selectedOrder.amounts.currency ||
                                            selectedOrder.currency ||
                                            "USD",
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-default-500">
                                        {t("admin-orders-tax")}
                                      </span>
                                      <span>
                                        {formatCurrency(
                                          selectedOrder.amounts.tax_cents || 0,
                                          selectedOrder.amounts.currency ||
                                            selectedOrder.currency ||
                                            "USD",
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-default-500">
                                        {t("admin-orders-shipping")}
                                      </span>
                                      <span>
                                        {formatCurrency(
                                          selectedOrder.amounts.shipping_cents || 0,
                                          selectedOrder.amounts.currency ||
                                            selectedOrder.currency ||
                                            "USD",
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex justify-between pt-2 mt-2 border-t font-semibold">
                                      <span>{t("admin-orders-total")}</span>
                                      <span>
                                        {formatCurrency(
                                          selectedOrder.amounts.total_cents,
                                          selectedOrder.amounts.currency ||
                                            selectedOrder.currency ||
                                            "USD",
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </Card.Content>
                              </Card>
                            </div>
                          </div>

                          <Separator />

                          {/* Status & Tracking */}
                          <div className="grid grid-cols-2 gap-5">
                            {/* Status Update */}
                            <div>
                              <Label>{t("admin-orders-status")}</Label>
                              <select
                                className="w-full px-3 py-2 mt-2 font-mono text-sm rounded-lg bg-default-100 border border-default-300 focus:outline-none focus:ring-2"
                                disabled={updateMutation.isPending}
                                value={selectedOrder.status}
                                onChange={(e) => {
                                  const newStatus = e.target.value;
                                  console.log("select status", newStatus);
                                  setSelectedOrder((o) =>
                                    o ? { ...o, status: newStatus } : o,
                                  );
                                  updateMutation.mutate({
                                    id: selectedOrder.id,
                                    data: { status: newStatus },
                                  });
                                }}
                              >
                                {ORDER_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Tracking */}
                            <div>
                              <Label className="flex items-center gap-2">
                                <Truck size={14} />
                                {t("admin-orders-tracking")}
                              </Label>
                              <input
                                className="w-full px-3 py-2 mt-2 font-mono text-sm rounded-lg bg-default-100 border border-default-300 focus:outline-none focus:ring-2"
                                defaultValue={selectedOrder.tracking?.number || ""}
                                placeholder={t("admin-orders-tracking-placeholder")}
                                type="text"
                                onBlur={(e) => {
                                  if (
                                    e.target.value !==
                                    (selectedOrder.tracking?.number || "")
                                  ) {
                                    updateMutation.mutate({
                                      id: selectedOrder.id,
                                      data: { tracking_number: e.target.value },
                                    });
                                  }
                                }}
                              />
                              {selectedOrder.tracking?.url && (
                                <a
                                  className="inline-flex items-center gap-1 text-sm mt-2 hover:underline text-accent"
                                  href={selectedOrder.tracking.url}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                >
                                  <ExternalLink size={14} />
                                  {t("admin-orders-track-package")}
                                </a>
                              )}
                            </div>
                          </div>

                          <Separator />

                          {/* Footer: Timestamp + Refund */}
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-mono text-default-500">
                              {t("admin-orders-created")}{" "}
                              {new Date(selectedOrder.created_at).toLocaleString()}
                            </p>
                            <div className="flex items-center gap-3">
                              <Button
                                size="sm"
                                variant="secondary"
                                isDisabled={resendConfirmationMutation.isPending}
                                onPress={() => {
                                  resendConfirmationMutation.mutate(selectedOrder.id);
                                }}
                              >
                                {resendConfirmationMutation.isPending
                                  ? t("admin-orders-resend-sending")
                                  : t("admin-orders-btn-resend-confirmation")}
                              </Button>

                              <Button
                                size="sm"
                                variant="tertiary"
                                isDisabled={regenerateLinkMutation.isPending}
                                onPress={() => {
                                  regenerateLinkMutation.mutate(selectedOrder.id);
                                }}
                              >
                                {regenerateLinkMutation.isPending
                                  ? t("admin-orders-regenerating")
                                  : t("admin-orders-btn-regenerate-link")}
                              </Button>

                              {selectedOrder.status === "paid" &&
                                selectedOrder.stripe?.payment_intent_id && (
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    isDisabled={refundMutation.isPending}
                                    onPress={() => {
                                      if (confirm(t("admin-orders-confirm-refund"))) {
                                        refundMutation.mutate(selectedOrder.id);
                                      }
                                    }}
                                  >
                                    {refundMutation.isPending
                                      ? t("admin-orders-refunding")
                                      : t("admin-orders-btn-refund")}
                                  </Button>
                                )}
                            </div>
                          </div>
                        </div>
                      )}
                    </Modal.Body>
                  </>
                )}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
