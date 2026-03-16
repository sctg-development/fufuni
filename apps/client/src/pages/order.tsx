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

import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { button as buttonStyles } from "@heroui/theme";
import { useTranslation } from "react-i18next";

import DefaultLayout from "@/layouts/default";

// Shape of the order returned by GET /v1/orders/:id/status
interface OrderStatus {
  number: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  shipping_cents: number;
  total_cents: number;
  created_at: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  items: { sku: string; title: string; qty: number; unit_price_cents: number }[];
}

function formatPrice(cents: number, currency: string, locale: string = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(dateStr: string, locale: string = "en-US") {
  try {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// Maps database status values to display labels and colors
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-warning-600 bg-warning-100" },
  paid: { label: "Paid", color: "text-success-600 bg-success-100" },
  processing: { label: "Processing", color: "text-primary-600 bg-primary-100" },
  shipped: { label: "Shipped", color: "text-primary-700 bg-primary-100" },
  delivered: { label: "Delivered", color: "text-success-700 bg-success-100" },
  refunded: { label: "Refunded", color: "text-default-600 bg-default-100" },
  canceled: { label: "Canceled", color: "text-danger-600 bg-danger-100" },
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { t, i18n } = useTranslation();

  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !token) {
      setError("Invalid link — please check your email.");
      setLoading(false);
      return;
    }

    // Call the public status endpoint — no Authorization header needed
    const merchantAPI = import.meta.env.API_BASE_URL || "http://localhost:8787";
    fetch(`${merchantAPI}/v1/orders/${id}/status?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.status === 401) throw new Error("Link expired or invalid.");
        if (!res.ok) throw new Error("Order not found.");
        return res.json();
      })
      .then((data) => setOrder(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading) {
    return (
      <DefaultLayout>
        <div className="max-w-2xl mx-auto py-12 px-6 text-center">
          <p className="text-default-500">{t("loading")}</p>
        </div>
      </DefaultLayout>
    );
  }

  if (error || !order) {
    return (
      <DefaultLayout>
        <div className="max-w-2xl mx-auto py-12 px-6 text-center">
          <div className="mb-6">
            <div className="text-5xl mb-3">⚠️</div>
            <h1 className="text-2xl font-bold mb-2">{t("tracking-link-invalid")}</h1>
            <p className="text-default-500 mb-6">
              {error || t("unable-to-load-order")}
            </p>
            <p className="text-sm text-default-400">
              {t("tracking-link-valid-30days")}
            </p>
          </div>
          <Link className={buttonStyles({ color: "primary", radius: "full" })} to="/">
            {t("return-home")}
          </Link>
        </div>
      </DefaultLayout>
    );
  }

  const statusInfo = STATUS_LABELS[order.status] ?? {
    label: order.status,
    color: "text-default-600 bg-default-100",
  };

  return (
    <DefaultLayout>
      <div className="max-w-2xl mx-auto py-12 px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t("order-tracking")}</h1>
          <p className="text-default-500 mt-1">
            {t("order-number")}<strong>{order.number}</strong>
            &nbsp;·&nbsp;
            {formatDate(order.created_at, i18n.language)}
          </p>
        </div>

        {/* Status */}
        <div className="rounded-lg border border-default-200 p-4 mb-6 flex items-center justify-between">
          <span className="text-sm font-medium text-default-600">{t("status")}</span>
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        {/* Tracking */}
        {order.tracking_number && (
          <div className="rounded-lg bg-primary-50 p-4 mb-6">
            <p className="font-medium mb-1">{t("tracking")}</p>
            <p className="text-sm text-default-500 mb-2">{t("tracking-number")} {order.tracking_number}</p>
            {order.shipped_at && (
              <p className="text-sm text-default-400 mb-2">
                {t("shipped-on")} {formatDate(order.shipped_at, i18n.language)}
              </p>
            )}
            {order.tracking_url && (
              <a
                href={order.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                {t("track-on-carrier")} →
              </a>
            )}
          </div>
        )}

        {/* Items */}
        <div className="border border-default-200 rounded-lg divide-y mb-6">
          {order.items.map((item) => (
            <div key={item.sku} className="flex justify-between items-center p-4">
              <div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-default-400">{t("qty")}: {item.qty}</p>
              </div>
              <p className="text-sm font-medium">
                {formatPrice(item.unit_price_cents * item.qty, order.currency, i18n.language)}
              </p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="bg-default-50 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-default-600">{t("subtotal")}</span>
            <span>{formatPrice(order.subtotal_cents, order.currency, i18n.language)}</span>
          </div>
          {order.discount_cents > 0 && (
            <div className="flex justify-between text-success-600">
              <span>{t("discount")}</span>
              <span>−{formatPrice(order.discount_cents, order.currency, i18n.language)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-default-600">{t("tax")}</span>
            <span>{formatPrice(order.tax_cents, order.currency, i18n.language)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-default-600">{t("shipping")}</span>
            <span>{formatPrice(order.shipping_cents, order.currency, i18n.language)}</span>
          </div>
          <div className="flex justify-between font-bold text-base pt-2 border-t border-default-200">
            <span>{t("total")}</span>
            <span>{formatPrice(order.total_cents, order.currency, i18n.language)}</span>
          </div>
        </div>

        {/* Action */}
        <div className="mt-8 text-center">
          <Link className={buttonStyles({ variant: "bordered", radius: "full" })} to="/">
            {t("continue-shopping")}
          </Link>
        </div>
      </div>
    </DefaultLayout>
  );
}
