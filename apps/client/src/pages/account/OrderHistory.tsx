/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Card,
  CardBody,
  Spinner,
  Button,
  Chip,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";

import { useAuth } from "../../authentication/providers/use-auth";

interface OrderItem {
  sku: string;
  title: string;
  qty: number;
  unit_price_cents: number;
}

interface Order {
  id: string;
  number: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  shipping_cents: number;
  total_cents: number;
  created_at: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  items: OrderItem[];
}

interface OrderListResponse {
  items: Order[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

// Map order status to a Chip color
const STATUS_COLORS: Record<
  string,
  "success" | "warning" | "danger" | "default" | "primary"
> = {
  paid: "success",
  processing: "primary",
  shipped: "primary",
  delivered: "success",
  refunded: "danger",
  canceled: "danger",
  pending: "warning",
};

/**
 * Displays the paginated order history for the authenticated customer.
 */
export default function OrderHistory() {
  const { t } = useTranslation();
  const auth = useAuth() as any;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const apiBase =
    import.meta.env.VITE_API_BASE_URL || import.meta.env.API_BASE_URL;

  const fetchOrders = async (nextCursor?: string) => {
    setLoading(true);
    try {
      const url = nextCursor
        ? `${apiBase}/v1/me/orders?limit=10&cursor=${encodeURIComponent(nextCursor)}`
        : `${apiBase}/v1/me/orders?limit=10`;

      const result: OrderListResponse = await auth.getJson(url);

      setOrders(result.items);
      setCursor(result.pagination.nextCursor);
      setHasMore(result.pagination.hasMore);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auth?.getJson) {
      fetchOrders();
    }
  }, [auth]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label={t("loading", "Loading...")} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("account-orders", "My Orders")}</h1>

      {orders.length === 0 ? (
        <Card>
          <CardBody>{t("account-no-orders", "No orders yet")}</CardBody>
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableColumn>{t("account-order-number", "Order #")}</TableColumn>
              <TableColumn>{t("account-date", "Date")}</TableColumn>
              <TableColumn>{t("account-status", "Status")}</TableColumn>
              <TableColumn>{t("account-total", "Total")}</TableColumn>
              <TableColumn>{t("account-actions", "Actions")}</TableColumn>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.number}</TableCell>
                  <TableCell>
                    {new Date(order.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      color={STATUS_COLORS[order.status] || "default"}
                      size="sm"
                      variant="flat"
                    >
                      {order.status}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    ${(order.total_cents / 100).toFixed(2)} {order.currency}
                  </TableCell>
                  <TableCell>
                    <Link to={`/account/orders/${order.number}`}>
                      <Button size="sm" variant="light">
                        {t("account-view", "View")}
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {hasMore && (
            <div className="flex justify-center">
              <Button onClick={() => fetchOrders(cursor ?? undefined)}>
                {t("account-load-more", "Load More")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
