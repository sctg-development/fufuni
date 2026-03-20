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
import {
  Input,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
} from "@heroui/react";

import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { SearchIcon } from "@/components/icons";
import { formatMoney } from "@/utils/currency";

// --- typings -------------------------------------------------------------
/**
 * A customer record as returned by the backend API.
 */
interface Customer {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  created_at: string;
  stats: {
    order_count: number;
    total_spent_cents: number;
    last_order_at?: string;
  };
}

/**
 * A postal address associated with a customer.
 */
interface Address {
  id: string;
  label?: string;
  is_default: boolean;
  name?: string;
  company?: string;
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

/**
 * A simplified order record shown in the customer detail view.
 */
interface Order {
  id: string;
  number: string;
  created_at: string;
  amounts: {
    total_cents: number;
  };
  status: string;
}

// -------------------------------------------------------------------------
/**
 * Admin interface for browsing and editing customer records, including
 * filtering, detail inspection, and inline field editing.
 */
export default function CustomersPage() {
  const { t } = useTranslation();
  const { getJson, putJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // list state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");

  // selected customer / details
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [customerDetail, setCustomerDetail] = useState<
    (Customer & { addresses: Address[] }) | null
  >(null);
  const [customerOrders, setCustomerOrders] = useState<Order[] | null>(null);

  /**
   * Retrieve customer list from the API, optionally filtering by the current
   * search term, and update component state.
   */
  const loadCustomers = async () => {
    setLoading(true);
    try {
      let url = `${apiBase}/v1/customers?limit=100`;
      const term = globalFilter.trim();

      if (term) {
        url += `&search=${encodeURIComponent(term)}`;
      }
      const resp = await getJson(url);

      setCustomers(resp.items || []);
    } catch (err) {
      console.error("Failed to load customers", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [globalFilter]);

  /**
   * Load detailed information and recent orders for the given customer, then
   * display the detail modal.
   *
   * @param c - customer to open
   */
  const openCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerDetail(null);
    setCustomerOrders(null);
    try {
      const detail = await getJson(`${apiBase}/v1/customers/${c.id}`);

      setCustomerDetail(detail);
      const ordersResp = await getJson(
        `${apiBase}/v1/customers/${c.id}/orders?limit=10`,
      );

      setCustomerOrders(ordersResp.items || []);
    } catch (err) {
      console.error("Failed to load customer detail/orders", err);
    }
  };

  /**
   * Send an update for the selected customer's editable field (name or phone)
   * and update both list and detail state optimistically.
   *
   * @param field - field key to update
   * @param value - new value for the field
   */
  const updateField = async (field: "name" | "phone", value: string) => {
    if (!selectedCustomer) return;
    try {
      await putJson(`${apiBase}/v1/customers/${selectedCustomer.id}`, {
        [field]: value || undefined,
      });
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCustomer.id
            ? { ...c, [field]: value || undefined }
            : c,
        ),
      );
      if (customerDetail)
        setCustomerDetail({ ...customerDetail, [field]: value || undefined });
    } catch (err) {
      console.error("Error updating customer", err);
    }
  };

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {/* header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">
            {t("admin-customers-title")}
          </h1>
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("search") + "..."}
              size="sm"
              startContent={<SearchIcon className="text-default-400" />}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>
        </div>

        {/* customer list */}
        {loading ? (
          <p className="text-default-500">{t("admin-customers-loading")}</p>
        ) : customers.length === 0 ? (
          <p>{t("admin-customers-empty")}</p>
        ) : (
          <Table aria-label="Customers" selectionMode="none">
            <TableHeader>
              <TableColumn>{t("admin-customers-col-name")}</TableColumn>
              <TableColumn>{t("admin-customers-col-email")}</TableColumn>
              <TableColumn>{t("admin-customers-col-orders")}</TableColumn>
              <TableColumn>{t("admin-customers-col-spent")}</TableColumn>
              <TableColumn>{t("admin-customers-col-first-order")}</TableColumn>
            </TableHeader>
            <TableBody emptyContent="">
              {customers.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => openCustomer(c)}
                >
                  <TableCell>{c.name || "-"}</TableCell>
                  <TableCell>{c.email}</TableCell>
                  <TableCell>{c.stats.order_count}</TableCell>
                  <TableCell>
                    {formatMoney(c.stats.total_spent_cents, "EUR")}
                  </TableCell>
                  <TableCell>
                    {new Date(c.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* customer detail modal */}
      <Modal
        isOpen={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
      >
        <ModalContent>
          <ModalHeader>
            {customerDetail?.name || selectedCustomer?.email || t("customer")}
          </ModalHeader>
          <ModalBody>
            {customerDetail && selectedCustomer ? (
              <div className="space-y-5">
                {/* Contact / Stats / Addresses / Orders copied roughly from merchant */}
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-4">
                    {/* Contact Info */}
                    <div
                      className="p-3 rounded-lg space-y-3"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      <h4
                        className="text-xs font-medium uppercase tracking-wide"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Contact
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <label
                            className="block text-xs font-medium uppercase tracking-wide mb-1.5"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Name
                          </label>
                          <input
                            className="w-full px-3 py-2 font-mono text-sm rounded-lg focus:outline-none focus:ring-2"
                            defaultValue={customerDetail.name || ""}
                            placeholder="Customer name"
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                            }}
                            type="text"
                            onBlur={(e) =>
                              updateField("name", e.target.value || "")
                            }
                          />
                        </div>
                        <div>
                          <label
                            className="block text-xs font-medium uppercase tracking-wide mb-1.5"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Email
                          </label>
                          <div
                            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg"
                            style={{
                              background: "var(--bg-subtle)",
                              border: "1px solid var(--border-subtle)",
                            }}
                          >
                            <span
                              className="font-mono"
                              style={{ color: "var(--accent)" }}
                            >
                              {customerDetail.email}
                            </span>
                          </div>
                        </div>
                        <div>
                          <label
                            className="block text-xs font-medium uppercase tracking-wide mb-1.5"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Phone
                          </label>
                          <input
                            className="w-full px-3 py-2 font-mono text-sm rounded-lg focus:outline-none focus:ring-2"
                            defaultValue={customerDetail.phone || ""}
                            placeholder="Phone number"
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                            }}
                            type="tel"
                            onBlur={(e) =>
                              updateField("phone", e.target.value || "")
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div
                        className="p-3 rounded-lg"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <p
                          className="text-xs uppercase"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Orders
                        </p>
                        <p className="text-xl font-semibold font-mono mt-1">
                          {customerDetail.stats.order_count}
                        </p>
                      </div>
                      <div
                        className="p-3 rounded-lg"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <p
                          className="text-xs uppercase"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Spent
                        </p>
                        <p className="text-xl font-semibold font-mono mt-1">
                          {formatMoney(
                            customerDetail.stats.total_spent_cents,
                            "EUR",
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Addresses */}
                    {customerDetail.addresses &&
                      customerDetail.addresses.length > 0 && (
                        <div
                          className="p-3 rounded-lg"
                          style={{ border: "1px solid var(--border)" }}
                        >
                          <h4
                            className="text-xs font-medium uppercase tracking-wide mb-2 flex items-center gap-2"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Addresses
                          </h4>
                          <div className="space-y-3">
                            {customerDetail.addresses.map((addr) => (
                              <div key={addr.id} className="font-mono text-sm">
                                <div className="flex items-center gap-2 mb-1">
                                  {addr.label && (
                                    <span
                                      className="text-xs px-1.5 py-0.5 rounded font-sans"
                                      style={{
                                        background: "var(--accent)",
                                        color: "white",
                                      }}
                                    >
                                      {addr.label}
                                    </span>
                                  )}
                                  {addr.is_default && (
                                    <span
                                      className="text-xs font-sans"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      Default
                                    </span>
                                  )}
                                </div>
                                {addr.name && (
                                  <p className="font-medium">{addr.name}</p>
                                )}
                                {addr.company && (
                                  <p style={{ color: "var(--text-secondary)" }}>
                                    {addr.company}
                                  </p>
                                )}
                                <p>{addr.line1}</p>
                                {addr.line2 && <p>{addr.line2}</p>}
                                <p>
                                  {[addr.city, addr.state, addr.postal_code]
                                    .filter(Boolean)
                                    .join(", ")}
                                </p>
                                <p>{addr.country}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Recent Orders */}
                  <div
                    className="p-3 rounded-lg"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    <h4
                      className="text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Recent Orders
                    </h4>
                    {customerOrders && customerOrders.length > 0 ? (
                      <div className="space-y-2">
                        {customerOrders.map((order) => (
                          <div
                            key={order.id}
                            className="flex items-center justify-between py-2 border-b last:border-0"
                            style={{ borderColor: "var(--border-subtle)" }}
                          >
                            <div>
                              <p className="font-mono text-sm">
                                {order.number}
                              </p>
                              <p
                                className="text-xs font-mono"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {new Date(
                                  order.created_at,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm">
                                {formatMoney(order.amounts.total_cents, "EUR")}
                              </p>
                              <p
                                className="text-xs font-mono capitalize"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {order.status}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p
                        className="text-sm font-mono"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        No orders yet
                      </p>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div
                  className="text-xs font-mono pt-4 border-t"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  Customer since{" "}
                  {new Date(selectedCustomer.created_at).toLocaleString()}
                  {selectedCustomer.stats.last_order_at && (
                    <span>
                      {" "}
                      · Last order{" "}
                      {new Date(
                        selectedCustomer.stats.last_order_at,
                      ).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p>Loading…</p>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </DefaultLayout>
  );
}
