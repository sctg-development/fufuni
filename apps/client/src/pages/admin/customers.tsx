import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSecuredApi } from "@/authentication";
import DefaultLayout from "@/layouts/default";
import { Input } from "@heroui/input";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/modal";
import { SearchIcon } from "@/components/icons";

// --- typings -------------------------------------------------------------
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
export default function CustomersPage() {
  const { t } = useTranslation();
  const { getJson, putJson } = useSecuredApi();

  const apiBase =
    (import.meta as any).env?.API_BASE_URL ? (import.meta as any).env.API_BASE_URL : "";

  // list state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");

  // selected customer / details
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerDetail, setCustomerDetail] = useState<
    (Customer & { addresses: Address[] }) | null
  >(null);
  const [customerOrders, setCustomerOrders] = useState<Order[] | null>(null);

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

  const openCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerDetail(null);
    setCustomerOrders(null);
    try {
      const detail = await getJson(`${apiBase}/v1/customers/${c.id}`);
      setCustomerDetail(detail);
      const ordersResp = await getJson(
        `${apiBase}/v1/customers/${c.id}/orders?limit=10`
      );
      setCustomerOrders(ordersResp.items || []);
    } catch (err) {
      console.error("Failed to load customer detail/orders", err);
    }
  };

  const updateField = async (
    field: "name" | "phone",
    value: string
  ) => {
    if (!selectedCustomer) return;
    try {
      await putJson(`${apiBase}/v1/customers/${selectedCustomer.id}`, {
        [field]: value || undefined,
      });
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCustomer.id ? { ...c, [field]: value || undefined } : c
        )
      );
      if (customerDetail)
        setCustomerDetail({ ...customerDetail, [field]: value || undefined });
    } catch (err) {
      console.error("Error updating customer", err);
    }
  };

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={t("search") + "..."}
              startContent={<SearchIcon className="text-default-400" />}
              size="sm"
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
                  <TableCell>{formatCurrency(c.stats.total_spent_cents)}</TableCell>
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
                            type="text"
                            defaultValue={customerDetail.name || ""}
                            onBlur={(e) =>
                              updateField("name", e.target.value || "")
                            }
                            placeholder="Customer name"
                            className="w-full px-3 py-2 font-mono text-sm rounded-lg focus:outline-none focus:ring-2"
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                            }}
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
                            <span className="font-mono" style={{ color: "var(--accent)" }}>
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
                            type="tel"
                            defaultValue={customerDetail.phone || ""}
                            onBlur={(e) =>
                              updateField("phone", e.target.value || "")
                            }
                            placeholder="Phone number"
                            className="w-full px-3 py-2 font-mono text-sm rounded-lg focus:outline-none focus:ring-2"
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                            }}
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
                          {formatCurrency(customerDetail.stats.total_spent_cents)}
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
                                {addr.name && <p className="font-medium">{addr.name}</p>}
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
                              <p className="font-mono text-sm">{order.number}</p>
                              <p
                                className="text-xs font-mono"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {new Date(order.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm">
                                {formatCurrency(order.amounts.total_cents)}
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
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  Customer since {new Date(selectedCustomer.created_at).toLocaleString()}
                  {selectedCustomer.stats.last_order_at && (
                    <span>
                      {' '}
                      · Last order{' '}
                      {new Date(selectedCustomer.stats.last_order_at).toLocaleString()}
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
