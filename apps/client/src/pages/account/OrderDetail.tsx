/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, Spinner, Button, Chip, Separator, Table } from "@heroui/react";

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
        <div className="flex flex-col items-center gap-2">
          <Spinner />
          <span className="text-default-500">{t("loading")}</span>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <Card>
        <Card.Content>{t("account-order-not-found")}</Card.Content>
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
          {t("account-order")} #{order.number}
        </h1>
        <div className="flex gap-2">
          <Button
            variant="tertiary"
            onPress={() => navigate("/account/orders")}
          >
            {t("account-back")}
          </Button>
          <Button onPress={handleDownloadPDF}>
            {t("account-download-invoice")}
          </Button>
        </div>
      </div>

      {/* Order Summary */}
      <Card>
        <Card.Header className="flex gap-3 justify-between">
          <h2 className="text-lg font-semibold">
            {t("account-order-details")}
          </h2>
          <Chip
            color={(STATUS_COLORS[order.status] as any) || "default"}
            variant="tertiary"
          >
            {order.status}
          </Chip>
        </Card.Header>
        <Separator />
        <Card.Content className="gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">{t("account-date")}</p>
              <p className="font-semibold">
                {new Date(order.created_at).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t("account-currency")}</p>
              <p className="font-semibold">{order.currency}</p>
            </div>
            {order.shipped_at && (
              <div>
                <p className="text-sm text-gray-500">
                  {t("account-shipped-at")}
                </p>
                <p className="font-semibold">
                  {new Date(order.shipped_at).toLocaleDateString()}
                </p>
              </div>
            )}
            {order.tracking_number && (
              <div>
                <p className="text-sm text-gray-500">{t("account-tracking")}</p>
                <p className="font-semibold">{order.tracking_number}</p>
                {order.tracking_url && (
                  <a
                    className="text-blue-600 text-sm"
                    href={order.tracking_url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("account-track-shipment")}
                  </a>
                )}
              </div>
            )}
          </div>
        </Card.Content>
      </Card>

      {/* Order Items */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold">{t("account-items")}</h2>
        </Card.Header>
        <Separator />
        <Card.Content>
          <Table>
            <Table.Header>
              <Table.Column>{t("account-item")}</Table.Column>
              <Table.Column>{t("account-qty")}</Table.Column>
              <Table.Column>{t("account-unit-price")}</Table.Column>
              <Table.Column>{t("account-total")}</Table.Column>
            </Table.Header>
            <Table.Body>
              {order.items.map((item, idx) => (
                <Table.Row key={idx}>
                  <Table.Cell>{item.title}</Table.Cell>
                  <Table.Cell>{item.qty}</Table.Cell>
                  <Table.Cell>
                    ${(item.unit_price_cents / 100).toFixed(2)}
                  </Table.Cell>
                  <Table.Cell>
                    ${((item.qty * item.unit_price_cents) / 100).toFixed(2)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Card.Content>
      </Card>

      {/* Order Totals */}
      <Card>
        <Card.Content className="gap-3">
          <div className="flex justify-between">
            <span>{t("account-subtotal")}</span>
            <span>${(order.subtotal_cents / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("account-shipping")}</span>
            <span>${(order.shipping_cents / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("account-tax")}</span>
            <span>${(order.tax_cents / 100).toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-bold text-lg">
            <span>{t("account-total")}</span>
            <span>${(order.total_cents / 100).toFixed(2)}</span>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
