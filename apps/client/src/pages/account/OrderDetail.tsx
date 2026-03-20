/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Button,
  Chip,
  Divider,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";

import { useAuth } from "../../authentication/providers/use-auth";
import { downloadInvoicePdf } from "../../utils/invoice-pdf";

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
 * Displays detailed information for a single order.
 * Allows downloading the invoice as PDF.
 */
export default function OrderDetail() {
  const { t } = useTranslation();
  const { number } = useParams<{ number: string }>();
  const navigate = useNavigate();
  const auth = useAuth() as any;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const apiBase =
    import.meta.env.VITE_API_BASE_URL || import.meta.env.API_BASE_URL;

  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true);
      try {
        const result: Order = await auth.getJson(
          `${apiBase}/v1/me/orders/${number}`,
        );

        setOrder(result);
      } catch (error) {
        console.error("Error fetching order:", error);
        navigate("/account/orders");
      } finally {
        setLoading(false);
      }
    };

    if (auth?.getJson && number) {
      fetchOrder();
    }
  }, [auth, number, apiBase, navigate]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label={t("loading", "Loading...")} />
      </div>
    );
  }

  if (!order) {
    return (
      <Card>
        <CardBody>{t("account-order-not-found", "Order not found")}</CardBody>
      </Card>
    );
  }

  const handleDownloadPDF = async () => {
    // Generate and download the invoice PDF using jsPDF
    const storeName = import.meta.env.VITE_STORE_NAME || "Fufuni Store";
    const locale = "en-US"; // Could also use i18n locale here

    downloadInvoicePdf(
      {
        number: order.number,
        created_at: order.created_at,
        currency: order.currency,
        email: auth.user?.email || "",
        shipping_name: undefined, // Would need to add shipping name to order response
        items: order.items,
        subtotal_cents: order.subtotal_cents,
        shipping_cents: order.shipping_cents,
        tax_cents: order.tax_cents,
        total_cents: order.total_cents,
        tracking_number: order.tracking_number ?? undefined,
        tracking_url: order.tracking_url ?? undefined,
      },
      storeName,
      locale,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">
          {t("account-order", "Order")} #{order.number}
        </h1>
        <div className="flex gap-2">
          <Button variant="light" onClick={() => navigate("/account/orders")}>
            {t("account-back", "Back")}
          </Button>
          <Button color="primary" onClick={handleDownloadPDF}>
            {t("account-download-invoice", "Download Invoice")}
          </Button>
        </div>
      </div>

      {/* Order Summary */}
      <Card>
        <CardHeader className="flex gap-3 justify-between">
          <h2 className="text-lg font-semibold">
            {t("account-order-details", "Order Details")}
          </h2>
          <Chip color={STATUS_COLORS[order.status] || "default"} variant="flat">
            {order.status}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">
                {t("account-date", "Date")}
              </p>
              <p className="font-semibold">
                {new Date(order.created_at).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">
                {t("account-currency", "Currency")}
              </p>
              <p className="font-semibold">{order.currency}</p>
            </div>
            {order.shipped_at && (
              <div>
                <p className="text-sm text-gray-500">
                  {t("account-shipped-at", "Shipped")}
                </p>
                <p className="font-semibold">
                  {new Date(order.shipped_at).toLocaleDateString()}
                </p>
              </div>
            )}
            {order.tracking_number && (
              <div>
                <p className="text-sm text-gray-500">
                  {t("account-tracking", "Tracking")}
                </p>
                <p className="font-semibold">{order.tracking_number}</p>
                {order.tracking_url && (
                  <a
                    className="text-blue-600 text-sm"
                    href={order.tracking_url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("account-track-shipment", "Track Shipment")}
                  </a>
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t("account-items", "Items")}
          </h2>
        </CardHeader>
        <Divider />
        <CardBody>
          <Table>
            <TableHeader>
              <TableColumn>{t("account-item", "Item")}</TableColumn>
              <TableColumn>{t("account-qty", "Qty")}</TableColumn>
              <TableColumn>{t("account-unit-price", "Unit Price")}</TableColumn>
              <TableColumn>{t("account-total", "Total")}</TableColumn>
            </TableHeader>
            <TableBody>
              {order.items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>{item.qty}</TableCell>
                  <TableCell>
                    ${(item.unit_price_cents / 100).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    ${((item.qty * item.unit_price_cents) / 100).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Order Totals */}
      <Card>
        <CardBody className="gap-3">
          <div className="flex justify-between">
            <span>{t("account-subtotal", "Subtotal")}</span>
            <span>${(order.subtotal_cents / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("account-shipping", "Shipping")}</span>
            <span>${(order.shipping_cents / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("account-tax", "Tax")}</span>
            <span>${(order.tax_cents / 100).toFixed(2)}</span>
          </div>
          <Divider />
          <div className="flex justify-between font-bold text-lg">
            <span>{t("account-total", "Total")}</span>
            <span>${(order.total_cents / 100).toFixed(2)}</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
