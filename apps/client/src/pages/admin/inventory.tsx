import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  AlertTriangle,
  Package,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSecuredApi } from "@/authentication";
import DefaultLayout from "@/layouts/default";
import { Modal } from "@heroui/modal";
import clsx from "clsx";

// --- typings -------------------------------------------------------------
interface InventoryItem {
  sku: string;
  product_title?: string;
  on_hand: number;
  reserved: number;
  available: number;
}

const columnHelper = createColumnHelper<InventoryItem>();
const ADJUST_REASONS = ["restock", "correction", "damaged", "return"] as const;

export default function InventoryPage() {
  const { t } = useTranslation();
  const { getJson, postJson } = useSecuredApi();
  const queryClient = useQueryClient();

  const apiBase =
    (import.meta as any).env?.API_BASE_URL ? (import.meta as any).env.API_BASE_URL : "";

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState<string>("restock");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => getJson(`${apiBase}/v1/inventory`),
  });

  const inventory: InventoryItem[] = data?.items || [];

  const adjustMutation = useMutation({
    mutationFn: ({ sku, delta, reason }: { sku: string; delta: number; reason: string }) =>
      postJson(`${apiBase}/v1/inventory/${sku}/adjust`, { delta, reason }),
    onSuccess: (updated: InventoryItem) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setSelectedItem(updated);
      setAdjustDelta("");
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("sku", {
        header: t("admin-inventory-col-sku"),
        cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor("product_title", {
        header: t("admin-inventory-col-product"),
        cell: (info) => <span className="font-mono text-sm">{info.getValue() || "-"}</span>,
      }),
      columnHelper.accessor("on_hand", {
        header: t("admin-inventory-col-on-hand"),
        cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor("reserved", {
        header: t("admin-inventory-col-reserved"),
        cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor("available", {
        header: t("admin-inventory-col-available"),
        cell: (info) => {
          const value = info.getValue();
          const isLow = value <= 5 && value > 0;
          const isOut = value <= 0;
          return (
            <span
              className={clsx(
                "font-mono text-sm",
                isOut && "text-red-500",
                isLow && "text-amber-500"
              )}
            >
              {isLow && <AlertTriangle size={12} className="inline mr-1" />}
              {value}
            </span>
          );
        },
      }),
    ],
    [t]
  );

  const table = useReactTable({
    data: inventory,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta)) return;
    adjustMutation.mutate({ sku: selectedItem.sku, delta, reason: adjustReason });
  };

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 h-9">
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            {t("admin-inventory-title")}
          </h1>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
            style={{ color: "var(--text-muted)" }}
          >
            <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Table card */}
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {/* Search */}
          <div className="flex items-center border-b" style={{ borderColor: "var(--border)" }}>
            <div
              className="flex-1 flex items-center gap-2 px-4 py-3"
              style={{ color: "var(--text-muted)" }}
            >
              <Search size={16} className="flex-shrink-0" />
              <input
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={t("search") + "..."}
                className="bg-transparent border-0 font-mono text-sm w-full focus:outline-none"
                style={{ color: "var(--text)" }}
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-muted)" }} />
            </div>
          ) : inventory.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              {t("admin-inventory-empty")}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className={clsx(
                          "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide",
                          header.column.getCanSort() &&
                            "cursor-pointer select-none hover:bg-[var(--bg-hover)]"
                        )}
                        style={{ color: "var(--text-muted)" }}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="ml-1">
                              {header.column.getIsSorted() === "asc" ? (
                                <ChevronUp size={14} />
                              ) : header.column.getIsSorted() === "desc" ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronsUpDown size={14} className="opacity-30" />
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
                    onClick={() => {
                      setSelectedItem(row.original);
                      setAdjustDelta("");
                      setAdjustReason("restock");
                    }}
                    className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail modal */}
        <Modal
          isOpen={!!selectedItem}
          onClose={() => {
            setSelectedItem(null);
            setAdjustDelta("");
          }}
          title={selectedItem?.sku || t("admin-inventory-title")}
          size="md"
        >
          {selectedItem && (
            <div className="space-y-5">
              {/* Product info */}
              <div
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ border: "1px solid var(--border)" }}
              >
                <div
                  className="w-10 h-10 flex items-center justify-center rounded-lg"
                  style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
                >
                  <Package size={18} style={{ color: "var(--text-secondary)" }} />
                </div>
                <div>
                  <p className="font-mono text-sm font-medium">{selectedItem.sku}</p>
                  <p className="font-mono text-sm" style={{ color: "var(--text-secondary)" }}>
                    {selectedItem.product_title || '-'}
                  </p>
                </div>
              </div>

              {/* Stock levels */}
              <div className="grid grid-cols-3 gap-3">
                <div
                  className="p-3 rounded-lg text-center"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <p className="text-2xl font-mono font-semibold">{selectedItem.on_hand}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {t("admin-inventory-col-on-hand")}
                  </p>
                </div>
                <div
                  className="p-3 rounded-lg text-center"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <p className="text-2xl font-mono font-semibold">{selectedItem.reserved}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {t("admin-inventory-col-reserved")}
                  </p>
                </div>
                <div
                  className="p-3 rounded-lg text-center"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <p
                    className={clsx(
                      "text-2xl font-mono font-semibold",
                      selectedItem.available <= 0 && "text-red-500",
                      selectedItem.available > 0 && selectedItem.available <= 5 && "text-amber-500"
                    )}
                  >
                    {selectedItem.available}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {t("admin-inventory-col-available")}
                  </p>
                </div>
              </div>

              {/* Adjust form */}
              <form
                onSubmit={handleAdjust}
                className="space-y-4 pt-4 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block text-xs font-medium uppercase tracking-wide mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {t("admin-inventory-field-quantity")}
                    </label>
                    <input
                      type="number"
                      value={adjustDelta}
                      onChange={(e) => setAdjustDelta(e.target.value)}
                      placeholder="e.g. 50 or -10"
                      required
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg focus:outline-none focus:ring-2"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-xs font-medium uppercase tracking-wide mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {t("admin-inventory-field-reason")}
                    </label>
                    <select
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg focus:outline-none focus:ring-2"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    >
                      {ADJUST_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("admin-inventory-quick-label")}
                  </span>
                  {[10, 25, 50, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAdjustDelta(String(n))}
                      className="px-2 py-1 text-xs font-mono rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                    >
                      +{n}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={adjustMutation.isPending || !adjustDelta}
                  className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {adjustMutation.isPending ? t("admin-inventory-adjusting") : t("admin-inventory-btn-apply")}
                </button>
              </form>
            </div>
          )}
        </Modal>
      </div>
    </DefaultLayout>
  );
}
